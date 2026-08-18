import { XR } from "@react-three/xr";
import React, { useRef, useState, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sky, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { Physics, RigidBody, RapierRigidBody } from "@react-three/rapier";
import { InputService } from "../lib/InputService";
import { BleService } from "../lib/BleService";

interface ModalityProps {
  driftRef: React.RefObject<Float32Array>;
  moveSensitivity: number;
  audioEngine?: any;
}

// Global Race State to prevent React re-renders while updating HUD
export const RaceState = {
  playerNextRing: 0,
  botNextRing: 0,
  laps: 0,
  bestLapTime: Infinity,
  currentLapStart: 0,
  isActive: false,
  penalties: 0,
  botLaps: 0,
  botBestLapTime: Infinity,
  botCurrentLapStart: 0,
  botIsActive: false,
  botPenalties: 0,
};

function formatTime(ms: number) {
  if (ms === Infinity || ms === 0) return "--:--.---";
  const date = new Date(ms);
  return `${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}.${date.getMilliseconds().toString().padStart(3, "0")}`;
}

function applySpatialSupport(
  droneRef: React.RefObject<RapierRigidBody>,
  rings: any[],
  trackRadius: number = 20.0,
) {
  if (!droneRef.current || rings.length < 2) return;
  const pos = droneRef.current.translation();
  const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);

  let minDistSq = Infinity;
  let closestPoint = new THREE.Vector3();

  for (let i = 0; i < rings.length; i++) {
    const p1 = new THREE.Vector3().fromArray(rings[i].position);
    const p2 = new THREE.Vector3().fromArray(rings[(i + 1) % rings.length].position);

    const lineVec = p2.clone().sub(p1);
    const droneVec = currentPos.clone().sub(p1);
    const lineLenSq = lineVec.lengthSq();

    let t = lineLenSq === 0 ? 0 : droneVec.dot(lineVec) / lineLenSq;
    // Seamless loop so we just clamp between 0 and 1
    t = Math.max(0, Math.min(1, t));

    const proj = p1.clone().add(lineVec.multiplyScalar(t));
    const distSq = currentPos.distanceToSquared(proj);

    if (distSq < minDistSq) {
      minDistSq = distSq;
      closestPoint.copy(proj);
    }
  }

  if (minDistSq > trackRadius * trackRadius) {
    // 1. Hard bound the position to edge
    const distanceToCenter = Math.sqrt(minDistSq);
    const toAxisNormal = closestPoint.clone().sub(currentPos).normalize();
    // position on wall boundary
    const clampDist = distanceToCenter - trackRadius;
    const clampedPos = currentPos.clone().add(toAxisNormal.clone().multiplyScalar(clampDist));
    droneRef.current.setTranslation(clampedPos, true);

    // 2. Remove outward velocity to slide on the wall
    const currentVel = droneRef.current.linvel();
    const velVec = new THREE.Vector3(currentVel.x, currentVel.y, currentVel.z);
    
    const outwardVel = velVec.dot(toAxisNormal.clone().negate());
    if (outwardVel > 0) {
      velVec.addScaledVector(toAxisNormal, outwardVel); 
    }
    // 3. Add drag coefficient for scraping
    velVec.multiplyScalar(0.95);
    droneRef.current.setLinvel(velVec, true);
  }
}

function applyDronePhysics(
  droneRef: React.RefObject<RapierRigidBody>,
  inputs: { pitch: number; roll: number; yaw: number; throttle: number },
  delta: number,
  visualGroupRef?: React.RefObject<THREE.Group>
) {
  if (!droneRef.current) return;
  const { pitch, roll, yaw, throttle } = inputs;

  // Clamp inputs to prevent over-rotation and flip-outs
  const clampedPitch = Math.max(-1, Math.min(1, pitch));
  const clampedRoll = Math.max(-1, Math.min(1, roll));

  const rot = droneRef.current.rotation();
  const currentQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const currentEuler = new THREE.Euler().setFromQuaternion(currentQuat, "YXZ");

  if (!droneRef.current.userData) droneRef.current.userData = {};
  if ((droneRef.current.userData as any).targetYaw === undefined) {
    (droneRef.current.userData as any).targetYaw = currentEuler.y;
  }

  // INSTANT Zero-Latency Yaw
  (droneRef.current.userData as any).targetYaw -= yaw * 3.5 * delta;

  // Rigid body ONLY acts on Yaw (Pitch and Roll are visual only)
  const yawEuler = new THREE.Euler(0, (droneRef.current.userData as any).targetYaw, 0, "YXZ");
  const yawQuat = new THREE.Quaternion().setFromEuler(yawEuler);

  // DIRECT Zero-Latency Rotation for rigid body (keeps it visually flat for the attached camera)
  droneRef.current.setRotation(yawQuat, true);
  droneRef.current.setAngvel(new THREE.Vector3(0, 0, 0), true);

  // Apply visual tilt to inner mesh
  let visualPitch = 0;
  if (visualGroupRef && visualGroupRef.current) {
    const MAX_TILT = Math.PI / 2.5; // ~72 degrees max tilt
    // Pushing Forward (+1) should tilt nose down (negative X rotation).
    visualPitch = -clampedPitch * MAX_TILT; 
    const visualRoll = -clampedRoll * MAX_TILT; 
    visualGroupRef.current.rotation.set(visualPitch, 0, visualRoll, "YXZ");
  }

  // DIRECT Zero-Latency Arcade Movement
  const forwardScale = -clampedPitch; 
  const rightScale = clampedRoll;
  const speedScale = 40.0; 

  // Arcade movement: forward follows yaw AND camera pitch (vertical looking)
  const movementEuler = new THREE.Euler((droneRef.current.userData as any).targetPitch || 0, (droneRef.current.userData as any).targetYaw, 0, "YXZ");

  const forwardVec = new THREE.Vector3(0, 0, -1).applyEuler(movementEuler);
  const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(movementEuler);

  const targetVel = new THREE.Vector3();
  targetVel.addScaledVector(forwardVec, forwardScale * speedScale);
  targetVel.addScaledVector(rightVec, rightScale * speedScale);
  // Independent altitude scaling, purely additive to planar movement
  targetVel.y += throttle * 15.0;

  droneRef.current.setLinvel(targetVel, true);
}

const DroneAvatar = ({
  moveSensitivity,
  audioEngine,
  rings,
  color,
  cameraMode,
  droneRef,
}: any) => {
  const localRef = useRef<RapierRigidBody>(null);
  const activeRef = droneRef || localRef;
  const visualGroupRef = useRef<THREE.Group>(null);
  const fpvCamRef = useRef<THREE.PerspectiveCamera>(null);
  const intentArrowRef = useRef<THREE.Group>(null);
  
  // Initialize initial yaw once
  useEffect(() => {
     if (activeRef.current && rings.length > 0) {
        if (!activeRef.current.userData) activeRef.current.userData = {};
        // The rings point along +Z after their rotation, but drone forward is -Z.
        (activeRef.current.userData as any).targetYaw = rings[0].rotation[1] + Math.PI;
     }
  }, [rings]);

  useFrame((state, delta) => {
    if (!activeRef.current) return;

    const ble = BleService.getInstance();
    const input = InputService.getInstance();

    // Base mapping from Gamepad / Keyboard
    let roll = input.rawAxes[0] || 0; 
    let pitch = input.rawAxes[1] || 0; 
    let yawSpeed = input.rawAxes[2] || 0; 
    let pitchSpeed = input.rawAxes[3] || 0;
    
    // Throttle combines Keyboard Space/Shift (rawAxes[6]) and gamepad Triggers (rawAxes[4])
    // If Right trigger is pressed rawAxes[4] > 0, we want to go UP. So just add them.
    let throttle = (input.rawAxes[6] || 0) + (input.rawAxes[4] || 0);

    // Apply FPS mouse direct deltas (bypassing the decaying axis for precision)
    // and joystick speeds
    if (!activeRef.current.userData) activeRef.current.userData = { targetYaw: 0, targetPitch: 0 };
    if ((activeRef.current.userData as any).targetPitch === undefined) (activeRef.current.userData as any).targetPitch = 0;

    (activeRef.current.userData as any).targetYaw -= yawSpeed * 3.5 * delta;
    (activeRef.current.userData as any).targetYaw -= input.mouseDeltaX * 0.005;

    (activeRef.current.userData as any).targetPitch -= pitchSpeed * 2.0 * delta; // Stick up (-) -> -(-) = +, looks up
    (activeRef.current.userData as any).targetPitch -= input.mouseDeltaY * 0.005; // Mouse up (-) -> +, looks up

    // Clamp camera pitch to completely straight up/down limits
    (activeRef.current.userData as any).targetPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, (activeRef.current.userData as any).targetPitch));

    let yaw = 0; // We handle yaw directly in physics now
    
    let intentMag = 0;
    let rawIntentX = 0;
    let rawIntentY = 0;

    if (ble.isConnected) {
      const uData = activeRef.current.userData;
      if (uData.sPitch === undefined) {
         uData.sPitch = 0; uData.sRoll = 0; uData.sYawSpeed = 0; uData.sThrottle = 0; uData.sDev2Y = 0;
      }

      // Exact same smoothing formula as BrainMazeScene
      const skillLevel = moveSensitivity;
      const smooth = 0.98 - (skillLevel * 0.1); 
      const gain = 1.0; 

      let intentX = 0, intentY = 0, intentTq = 0;
      
      let coherenceGate = 1.0;
      let sweepX = ble.sweep_vx / 24.0;
      let sweepY = ble.sweep_vy / 24.0;
      let sweepTq = ble.sweep_tq / 24.0;
      
      let mot_mag = Math.sqrt(ble.target_vx**2 + ble.target_vy**2);
      let sweep_mag = Math.sqrt(sweepX**2 + sweepY**2);
      let alignment = (ble.target_vx * sweepX + ble.target_vy * sweepY) / (mot_mag * sweep_mag + 1e-6);
      coherenceGate = Math.max(0.0, alignment);
      
      // Default to semantic/sweep (Working Memory) if it has energy, fallback to motor
      if (sweep_mag > 0.05) {
          intentX = sweepX;
          intentY = sweepY;
          intentTq = sweepTq;
          intentMag = sweep_mag;
          rawIntentX = sweepX;
          rawIntentY = sweepY;
      } else {
          intentX = ble.target_vx;
          intentY = ble.target_vy;
          intentTq = ble.target_tq;
          intentMag = mot_mag;
          rawIntentX = ble.target_vx;
          rawIntentY = ble.target_vy;
      }
      
      // Drone physics expects pitch (forward/back) on Y and roll (left/right) on X.
      // But for camera-relative logic, we'll keep roll=X and pitch=Y.

      uData.sRoll = uData.sRoll * smooth + intentX * gain * (1 - smooth);
      uData.sPitch = uData.sPitch * smooth + intentY * gain * (1 - smooth);
      uData.sYawSpeed = uData.sYawSpeed * smooth + intentTq * gain * (1 - smooth);

      pitch = uData.sPitch; 
      roll = uData.sRoll; 
      (activeRef.current.userData as any).targetYaw -= uData.sYawSpeed * 3.5 * delta;
      
      if (ble.deviceAxes && ble.deviceAxes.length > 1) {
          // Full control: 2nd device handles vertical
          const dev2 = ble.deviceAxes[1];
          uData.sDev2Y = uData.sDev2Y * smooth + (-dev2.vy) * gain * (1 - smooth);
          throttle += uData.sDev2Y;
          if (dev2.tq !== 0) {
               throttle += -dev2.tq;
          }
      }
    } else {
       intentMag = Math.sqrt(roll*roll + pitch*pitch);
       rawIntentX = roll;
       rawIntentY = pitch;
    }

    const currentPos = activeRef.current.translation();

    // Update Intent Arrow
    if (intentArrowRef.current) {
        if (intentMag > 0.05) {
            intentArrowRef.current.visible = true;
            intentArrowRef.current.position.set(currentPos.x, currentPos.y - 0.4, currentPos.z);
            
            const camEuler = new THREE.Euler().setFromQuaternion(state.camera.quaternion, 'YXZ');
            const camYaw = new THREE.Euler(0, camEuler.y, 0, 'YXZ');
            
            // Map intent to world space via camera yaw
            const dirVector = new THREE.Vector3(rawIntentX, 0, rawIntentY);
            dirVector.applyEuler(camYaw).normalize();
            
            const arrowTarget = new THREE.Vector3(currentPos.x + dirVector.x, currentPos.y - 0.4, currentPos.z + dirVector.z);
            intentArrowRef.current.lookAt(arrowTarget);
            
            const arrowMesh1 = intentArrowRef.current.children[0] as THREE.Mesh;
            const arrowMesh2 = intentArrowRef.current.children[1] as THREE.Mesh;
            if (arrowMesh1?.material) (arrowMesh1.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, intentMag);
            if (arrowMesh2?.material) (arrowMesh2.material as THREE.MeshBasicMaterial).opacity = Math.min(0.6, intentMag * 0.8);
        } else {
            intentArrowRef.current.visible = false;
        }
    }

    // Replace the default physics with a camera-relative version
    const speedScale = 15.0; // Base speed
    
    const camEuler = new THREE.Euler().setFromQuaternion(state.camera.quaternion, 'YXZ');
    const camYaw = new THREE.Euler(0, camEuler.y, 0, 'YXZ');
    const forwardVec = new THREE.Vector3(0, 0, -1).applyEuler(camYaw);
    const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(camYaw);
    
    const targetVel = activeRef.current.linvel();
    // Decay velocity (air friction)
    targetVel.x *= 0.95;
    targetVel.z *= 0.95;
    targetVel.y *= 0.95;
    
    // Add thrust relative to camera view
    // Pitch is up/down on joystick, which is forward/back. Roll is left/right.
    targetVel.x += (forwardVec.x * -pitch + rightVec.x * roll) * speedScale * 0.1;
    targetVel.z += (forwardVec.z * -pitch + rightVec.z * roll) * speedScale * 0.1;
    
    targetVel.y += throttle * 1.5; // Up/down relative to world

    // Explicitly clamp drone rotation so it always faces its targetYaw (camera look direction)
    const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (activeRef.current.userData as any).targetYaw, 0, 'YXZ'));
    activeRef.current.setRotation(targetQuat, true);
    activeRef.current.setLinvel(targetVel, true);
    activeRef.current.setAngvel({x: 0, y: 0, z: 0}, true); // Stop any physics rotation

    // Visual tilt based on movement intent
    if (visualGroupRef.current) {
        visualGroupRef.current.rotation.z = roll * -0.5; // Roll visual
        visualGroupRef.current.rotation.x = pitch * 0.5; // Pitch visual
    }
    applySpatialSupport(activeRef, rings, 12.0); // Widen support boundary so bots and players don't hit tube walls randomly

    if (fpvCamRef.current) {
      // Direct 1-to-1 mouse look camera up/down without autocentering
      fpvCamRef.current.rotation.x = (activeRef.current.userData as any).targetPitch;
    }

    // Audio Update
    if (audioEngine && audioEngine.updateDroneMotors) {
      audioEngine.updateDroneMotors(
        Math.abs(throttle),
        roll * 2.0,
        pitch * 2.0,
        -yaw * 2.0,
      );
    }

    // Read the LATEST ALL-COMPUTED translation after physics overrides for zero-latency camera
    const latestPos = activeRef.current.translation();
    const dronePosVec = new THREE.Vector3(latestPos.x, latestPos.y, latestPos.z);
    
    const rot = activeRef.current.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const targetYaw = (activeRef.current.userData as any).targetYaw || 0;

    // --- Collision check using non-React state to avoid frame drops ---
    const nextRingIndex = RaceState.playerNextRing;
    
    // Check the expected ring and the next 4 rings (skip allowance)
    for (let offset = 0; offset < 5; offset++) {
      const checkIndex = (nextRingIndex + offset) % rings.length;
      const targetRingInfo = rings[checkIndex];
      if (targetRingInfo) {
        const ringPos = new THREE.Vector3().fromArray(targetRingInfo.position);
        if (dronePosVec.distanceTo(ringPos) < 6.0) { // Keep radius smaller than ring spacing (10.4)
          RaceState.playerNextRing = (checkIndex + 1) % rings.length;
          RaceState.penalties += offset; // +1 penalty for each skipped ring
          
          // If we completed a lap by passing the finish line (ring 0) 
          // or we passed it via skipping
          if (checkIndex === 0 || (nextRingIndex > checkIndex && nextRingIndex !== 0)) {
             if (RaceState.isActive) {
                 RaceState.laps++;
                 let lapTime = performance.now() - RaceState.currentLapStart;
                 if (lapTime < RaceState.bestLapTime) RaceState.bestLapTime = lapTime;
             }
             RaceState.isActive = true;
             RaceState.currentLapStart = performance.now();
          }
          break; // Stop checking further rings once we matched one
        }
      }
    }

    // Update UI HUD directly
    const hudRings = document.getElementById("hud-rings");
    const hudTime = document.getElementById("hud-time");
    const hudBest = document.getElementById("hud-best");
    const hudLaps = document.getElementById("hud-laps");
    
    if (hudRings) hudRings.innerText = `P1 NEXT: ${RaceState.playerNextRing}/${rings.length}` + (RaceState.penalties > 0 ? ` [S:${RaceState.penalties}]` : "");
    if (hudLaps) hudLaps.innerText = `P1 LAPS: ${RaceState.laps}`;
    if (hudBest) hudBest.innerText = `BEST: ${formatTime(RaceState.bestLapTime)}`;
    if (hudTime) {
      if (RaceState.isActive) {
        hudTime.innerText = `CUR: ${formatTime(performance.now() - RaceState.currentLapStart)}`;
      } else {
        hudTime.innerText = `CUR: --:--.---`;
      }
    }

    const hudBotRings = document.getElementById("hud-bot-rings");
    const hudBotLaps = document.getElementById("hud-bot-laps");
    if (hudBotRings) hudBotRings.innerText = `BOT NEXT: ${RaceState.botNextRing}/${rings.length}` + (RaceState.botPenalties > 0 ? ` [S:${RaceState.botPenalties}]` : "");
    if (hudBotLaps) hudBotLaps.innerText = `BOT LAPS: ${RaceState.botLaps}`;

  });

  return (
    <RigidBody
      ref={activeRef}
      position={[rings[rings.length-1].position[0], rings[rings.length-1].position[1], rings[rings.length-1].position[2]]}
      gravityScale={0}
      linearDamping={1.5}
      angularDamping={5.0}
      colliders="cuboid"
      collisionGroups={1}
      enabledRotations={[false, true, false]} // Only allow physics physics/kinematics on Y, but we set it directly anyway
      ccd
    >
      {/* Visual Drone */}
      <group ref={visualGroupRef}>
        <mesh castShadow>
          <boxGeometry args={[0.8, 0.2, 0.8]} />
          <meshStandardMaterial color={color || "#ffffff"} wireframe />
        </mesh>
        <mesh position={[0, 0, -0.4]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#ff0000" />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <ringGeometry args={[0.3, 0.4, 32]} />
          <meshBasicMaterial color="#00ffff" side={THREE.DoubleSide} />
        </mesh>
        <pointLight color={color || "#00ffff"} intensity={2} distance={5} />
      </group>

      <group ref={intentArrowRef} visible={false}>
          <mesh position={[0, 0, -1.2]} rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.3, 0.8, 4]} />
              <meshBasicMaterial color="#00ffff" transparent opacity={0.8} depthTest={false} />
          </mesh>
          <mesh position={[0, 0, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.1, 1.6]} />
              <meshBasicMaterial color="#00ffff" transparent opacity={0.6} depthTest={false} />
          </mesh>
      </group>

      {/* FPV Camera is attached to the body, strictly using mouse look, NOT the visual tilt */}
      <PerspectiveCamera
        ref={fpvCamRef}
        makeDefault={cameraMode === "fpv"}
        position={[0, 0.2, 0]}
        fov={90}
        near={0.05}
      />

      {/* Chase Camera matches position and yaw of rigid body, but does NOT pitch */}
      <PerspectiveCamera
        makeDefault={cameraMode === "chase"}
        position={[0, 25.0, 10.0]}
        rotation={[-1.1, 0, 0]}
        fov={75}
      />
    </RigidBody>
  );
};

const DroneBot = ({ rings, color }: any) => {
  const droneRef = useRef<RapierRigidBody>(null);
  const visualGroupRef = useRef<THREE.Group>(null);
  const targetRingRef = useRef(0);

  useEffect(() => {
     if (droneRef.current && rings.length > 0) {
        if (!droneRef.current.userData) droneRef.current.userData = {};
        (droneRef.current.userData as any).targetYaw = rings[0].rotation[1] + Math.PI;
     }
  }, [rings]);

  useFrame((state, delta) => {
    if (!droneRef.current) return;

    let pitch = 0;
    let roll = 0;
    let yaw = 0;
    let throttle = 0;

    const pos = droneRef.current.translation();
    const rot = droneRef.current.rotation();
    const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    
    let targetRing = targetRingRef.current;

    if (targetRing < rings.length) {
      const targetPos = new THREE.Vector3().fromArray(
        rings[targetRing].position,
      );
      const dronePos = new THREE.Vector3(pos.x, pos.y, pos.z);

      const toTarget = targetPos.clone().sub(dronePos);
      const distance = toTarget.length();
      const distance2D = Math.sqrt(
        toTarget.x * toTarget.x + toTarget.z * toTarget.z,
      );

      // Altitude control (Throttle)
      const yDiff = targetPos.y - pos.y;
      throttle = yDiff * 0.4;

      // Direction control (Add PI because our forward vector is -Z)
      const currentEuler = new THREE.Euler().setFromQuaternion(quat, "YXZ");
      const targetAngle = Math.atan2(toTarget.x, toTarget.z) + Math.PI;

      // Vertical aiming
      const targetPitchAngle = Math.atan2(yDiff, distance2D);
      (droneRef.current.userData as any).targetPitch = targetPitchAngle;

      let yawDiff = currentEuler.y - targetAngle;
      while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
      while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;

      // Aggressive yaw to face target faster
      yaw = yawDiff * 6.0;
      yaw = Math.max(-1, Math.min(1, yaw));

      // Map target to local space to determine if we should strafe left/right
      const localTarget = toTarget.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -currentEuler.y);
      roll = Math.max(-1, Math.min(1, localTarget.x * 0.05)); // Slight strafe towards path out of the wall

      if (Math.abs(yawDiff) < Math.PI / 2) {
        // Forward flight
        pitch = -Math.min(1, distance2D * 0.2); 
      } else {
        pitch = -Math.min(0.2, distance2D * 0.1); // fly slow if not facing completely
      }

      // Check the expected ring and the next 4 rings (skip allowance)
      for (let offset = 0; offset < 5; offset++) {
        const checkIndex = (targetRing + offset) % rings.length;
        const targetRingInfo = rings[checkIndex];
        if (targetRingInfo) {
          const ringPos = new THREE.Vector3().fromArray(targetRingInfo.position);
          if (dronePos.distanceTo(ringPos) < 6.0) { 
            targetRingRef.current = (checkIndex + 1) % rings.length;
            RaceState.botNextRing = targetRingRef.current;
            RaceState.botPenalties += offset; 
            
            if (checkIndex === 0 || (targetRing > checkIndex && targetRing !== 0)) {
               if (RaceState.botIsActive) {
                   RaceState.botLaps++;
                   let lapTime = performance.now() - RaceState.botCurrentLapStart;
                   if (lapTime < RaceState.botBestLapTime) RaceState.botBestLapTime = lapTime;
               }
               RaceState.botIsActive = true;
               RaceState.botCurrentLapStart = performance.now();
            }
            break; 
          }
        }
      }
    }

    applyDronePhysics(droneRef, { pitch, roll, yaw, throttle }, delta, visualGroupRef);
    applySpatialSupport(droneRef, rings, 12.0);
  });

  return (
    <RigidBody
      ref={droneRef}
      position={[rings[rings.length-2].position[0], rings[rings.length-2].position[1], rings[rings.length-2].position[2]]}
      gravityScale={0}
      linearDamping={1.5}
      angularDamping={5.0}
      colliders="cuboid"
      collisionGroups={2}
      enabledRotations={[false, true, false]}
      ccd
    >
      <group ref={visualGroupRef}>
        <mesh castShadow>
          <boxGeometry args={[0.8, 0.2, 0.8]} />
          <meshStandardMaterial color={color || "#ff0055"} wireframe />
        </mesh>
        <mesh position={[0, 0, -0.4]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <pointLight color={color || "#ff0055"} intensity={2} distance={5} />
      </group>
    </RigidBody>
  );
};

const WorldCamera = ({ droneRef }: { droneRef: React.RefObject<RapierRigidBody> }) => {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  
  useFrame(() => {
    if (cameraRef.current) {
      // Orbiting from high up to see entire course context
      cameraRef.current.position.lerp(new THREE.Vector3(0, 150.0, 50.0), 0.1);
      cameraRef.current.lookAt(0, 20, 0);
    }
  });

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={55}
    />
  );
};

const Course = ({ rings }: any) => {
  const materialsRef = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  // To draw a continuous tube track, we need an array of closed points
  const curve = useMemo(() => {
    const points = rings.map((r: any) => new THREE.Vector3(...r.position));
    return new THREE.CatmullRomCurve3(points, true); // true = closed loop
  }, [rings]);

  useFrame(() => {
    const nextRing = RaceState.playerNextRing;
    materialsRef.current.forEach((mat, index) => {
      if (!mat) return;
      const isStart = index === 0;
      
      if (index === nextRing) {
         // Highlight current objective
         mat.color.setHex(0x00ffaa);
         mat.emissive.setHex(0x00aa55);
      } else {
         // Dim off-target rings
         mat.color.setHex(isStart ? 0xffaa00 : 0xff0055);
         mat.emissive.setHex(isStart ? 0xbb6600 : 0x220000);
      }
    });
  });

  return (
    <group>
      {rings.map((ring: any, index: number) => {
        const isStart = index === 0;
        return (
          <group key={index} position={ring.position} rotation={ring.rotation}>
            <mesh>
              <torusGeometry args={[4, 0.3, 16, 32]} />
              <meshStandardMaterial
                ref={(el) => (materialsRef.current[index] = el)}
                color={isStart ? "#ffaa00" : "#ff0055"}
                emissive={isStart ? "#bb6600" : "#220000"}
              />
            </mesh>
            {isStart && (
               <mesh position={[0, 4.5, 0]}>
                 <boxGeometry args={[8, 0.5, 0.5]} />
                 <meshStandardMaterial color="#ffffff" emissive="#ffffff" />
               </mesh>
             )}
          </group>
        );
      })}
      <mesh>
        <tubeGeometry args={[curve, 128, 8.0, 16, true]} />
        <meshStandardMaterial
          color="#00aaff"
          wireframe
          transparent
          opacity={0.15}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
};

// Global XR store instance
import { globalXrStore as xrStore } from '../lib/xrStore';

export function DroneRacingScene(props: ModalityProps) {
  const [cameraMode, setCameraMode] = useState<"chase" | "fpv" | "world">("chase");
  const playerDroneRef = useRef<RapierRigidBody>(null);

  // Generate a racing loop track
  const rings = useMemo(() => {
    const arr = [];
    const numRings = 24;
    const trackRadius = 40;
    
    for (let i = 0; i < numRings; i++) {
      const t = (i / numRings) * Math.PI * 2;
      
      // Simple perfect circle in XZ plane
      const x = Math.sin(t) * trackRadius;
      const z = Math.cos(t) * trackRadius;
      
      // Keep Y elevated but make track wave gently so some vertical movement is needed
      const y = 18 + Math.sin(t * 4) * 6;

      const nextT = ((i + 1) / numRings) * Math.PI * 2;
      const nx = Math.sin(nextT) * trackRadius;
      const nz = Math.cos(nextT) * trackRadius;

      const dx = nx - x;
      const dz = nz - z;
      
      const rotY = Math.atan2(dx, dz);

      arr.push({
        position: [x, y, z],
        rotation: [0, rotY, 0],
      });
    }
    return arr;
  }, []);

  const [numConnected, setNumConnected] = useState(0);

  useEffect(() => {
    // Reset global state on mount
    RaceState.playerNextRing = 0;
    RaceState.botNextRing = 0;
    RaceState.laps = 0;
    RaceState.bestLapTime = Infinity;
    RaceState.isActive = false;
    RaceState.penalties = 0;
    RaceState.botLaps = 0;
    RaceState.botBestLapTime = Infinity;
    RaceState.botIsActive = false;
    RaceState.botPenalties = 0;

    const interval = setInterval(() => {
      const count = BleService.getInstance().devices.length;
      if (count !== numConnected) setNumConnected(count);
    }, 1000);
    return () => clearInterval(interval);
  }, [numConnected]);

  const colors = ["#00ffaa", "#ff00aa", "#00aaff", "#ffaa00", "#ffffff"];

  return (
    <div className="w-full h-full absolute inset-0 z-0 bg-sky-300">
      <Canvas shadows={{ type: THREE.PCFShadowMap }} gl={{ preserveDrawingBuffer: true }}>
        <XR store={xrStore}>
          <color attach="background" args={["#87CEEB"]} />
        <Sky sunPosition={[100, 20, 100]} turbidity={0.1} rayleigh={0.5} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[100, 100, 50]} intensity={1} castShadow />

        <Physics gravity={[0, -9.81, 0]}>
          <DroneAvatar
            {...props}
            rings={rings}
            color={colors[0]}
            cameraMode={cameraMode}
            droneRef={playerDroneRef}
          />
          <DroneBot rings={rings} color={colors[1]} />

          <Course rings={rings} />

          {/* Ground Plane */}
          <RigidBody type="fixed" position={[0, -0.5, 0]}>
            <mesh receiveShadow>
              <boxGeometry args={[2000, 1, 2000]} />
              <meshStandardMaterial color="#334433" />
            </mesh>
          </RigidBody>
          
          {/* Aesthetic environmental objects */}
          <RigidBody type="fixed" position={[0, 20, 0]}>
            <mesh>
               <boxGeometry args={[5, 40, 5]} />
               <meshStandardMaterial color="#445544" />
            </mesh>
          </RigidBody>
        </Physics>
        
        {/* WORLD VIEW CAMERA (Top-Down, slightly tilted, tracking player) */}
        {cameraMode === "world" && (
          <WorldCamera droneRef={playerDroneRef} />
        )}
        </XR>
      </Canvas>

      {/* High-Performance HUD Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
        <div className="px-4 py-3 bg-black/70 backdrop-blur-md rounded-xl border border-white/10 flex flex-col gap-2 pointer-events-auto">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-white text-xs font-mono font-bold tracking-wider">
              ARCADE CIRCUIT
            </span>
            <button
              onClick={() => setCameraMode((m) => {
                if (m === "fpv") return "chase";
                if (m === "chase") return "world";
                return "fpv";
              })}
              className="ml-4 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white font-mono uppercase transition-colors"
            >
              {cameraMode} CAM
            </button>
          </div>

          <div className="flex justify-between items-center text-xs font-mono mt-1 gap-6 text-white/90">
             <div className="flex flex-col">
               <span id="hud-laps" className="text-sm font-bold text-emerald-400">P1 LAPS: 0</span>
               <span id="hud-rings" className="text-gray-400">P1 RING: 0 / 24</span>
             </div>
             <div className="flex flex-col text-center">
               <span id="hud-bot-laps" className="text-sm font-bold text-pink-400">BOT LAPS: 0</span>
               <span id="hud-bot-rings" className="text-pink-300/70">BOT RING: 0 / 24</span>
             </div>
             <div className="flex flex-col items-end text-right">
               <span id="hud-time" className="text-lg font-bold text-sky-400">CUR: --:--.---</span>
               <span id="hud-best" className="text-amber-400">BEST: --:--.---</span>
             </div>
          </div>
        </div>
      </div>
      
      {/* Controls Manual */}
      <div className="absolute bottom-4 left-4 z-10 p-3 bg-black/60 backdrop-blur-md rounded-lg border border-white/5 pointer-events-none">
          <div className="text-[10px] text-gray-300 font-mono flex flex-col">
            {numConnected === 0 ? (
              <div className="flex flex-col gap-1 text-gray-400">
                <span className="text-white mb-1 tracking-widest font-bold">ARCADE CONTROLS</span>
                <span>Move: WSAD / L-Stick</span>
                <span>Turn: Mouse X / R-Stick X</span>
                <span>Alt: Triggers / Q/E</span>
              </div>
            ) : (
              <>
                <span className="text-orange-300">Device 1 (Pz): Move & Turn</span>
                {numConnected > 1 && (
                  <span className="text-sky-300">Device 2 (Oz): Altitude</span>
                )}
              </>
            )}
          </div>
      </div>
    </div>
  );
}

