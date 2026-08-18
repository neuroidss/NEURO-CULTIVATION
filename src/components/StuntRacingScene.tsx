import { XR } from "@react-three/xr";
import React, { useRef, useState, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky, PerspectiveCamera, Grid, Box, Cylinder, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { Physics, RigidBody, RapierRigidBody } from "@react-three/rapier";
import { BleService } from "../lib/BleService";
import { InputService } from "../lib/InputService";
import { CultivationEngine } from "../lib/CultivationEngine";
import { globalXrStore as xrStore } from "../lib/xrStore";

// State to handle rewards/achievements seamlessly across renders
export const RaceState = {
  achievements: new Set<string>()
};

// Procedural Track Generation
const TRACK_WIDTH = 80;
const TRACK_OVERLAPPING_SEGMENTS = 200; // Even denser for smoother walls

export const trackCurve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(0, 0, -450),      // North
    new THREE.Vector3(350, 0, -350),    // North East curve
    new THREE.Vector3(250, 0, 0),       // East pinch
    new THREE.Vector3(350, 0, 350),     // South East bulge
    new THREE.Vector3(0, 0, 450),       // South
    new THREE.Vector3(-350, 0, 350),    // South West bulge
    new THREE.Vector3(-250, 0, 0),      // West pinch
    new THREE.Vector3(-350, 0, -350),   // North West curve
  ],
  true, // closed loop
  'catmullrom',
  0.5
);

export const TrackData = {
  checkpoints: [] as THREE.Vector3[],
  playerClosestIdx: 0,
  getClosestCheckpointIdx: (pos: THREE.Vector3) => {
     let minD = Infinity;
     let idx = 0;
     TrackData.checkpoints.forEach((cp, i) => {
        const d = cp.distanceToSquared(pos);
        if (d < minD) { minD = d; idx = i; }
     });
     return idx;
  }
};

for (let i = 0; i < 200; i++) {
    TrackData.checkpoints.push(trackCurve.getPointAt(i / 200));
}

const leftWallPoints = [];
const rightWallPoints = [];
for (let i = 0; i <= TRACK_OVERLAPPING_SEGMENTS; i++) {
   const t = i / TRACK_OVERLAPPING_SEGMENTS;
   const p = trackCurve.getPointAt(t);
   const tangent = trackCurve.getTangentAt(t).normalize();
   const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
   
   leftWallPoints.push(p.clone().add(normal.clone().multiplyScalar(-TRACK_WIDTH / 2)));
   rightWallPoints.push(p.clone().add(normal.clone().multiplyScalar(TRACK_WIDTH / 2)));
}
const leftCurve = new THREE.CatmullRomCurve3(leftWallPoints, true);
const rightCurve = new THREE.CatmullRomCurve3(rightWallPoints, true);

const getStartTransforms = () => {
   const p = trackCurve.getPointAt(0);
   
   const tangent = trackCurve.getTangentAt(0).normalize();
   const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
   
   // Exact mathematical rotation to align -Z (vehicle forward) with track tangent
   const startRotY = Math.atan2(tangent.x, tangent.z) + Math.PI;
   
   const playerPos = p.clone().add(normal.clone().multiplyScalar(-10));
   const botPos = p.clone().add(normal.clone().multiplyScalar(10));
   
   return { playerPos, botPos, startRotY };
};
const startTransforms = getStartTransforms();

function CameraRig({ mode, carRef }: { mode: string, carRef: React.RefObject<RapierRigidBody> }) {
  const { camera } = useThree();
  
  useFrame(() => {
    if (!carRef.current) return;
    const pos = carRef.current.translation();
    const rot = carRef.current.rotation();
    const carP = new THREE.Vector3(pos.x, pos.y, pos.z);
    const carQ = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(carQ);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(carQ);
    
    let idealPos = new THREE.Vector3();
    let idealLook = new THREE.Vector3();
    
    if (mode === 'FirstPerson') {
      idealPos.copy(carP).add(up.clone().multiplyScalar(1.0)).add(forward.clone().multiplyScalar(0.5));
      idealLook.copy(idealPos).add(forward.clone().multiplyScalar(40));
    } else if (mode === 'ThirdPerson') {
      idealPos.copy(carP).sub(forward.clone().multiplyScalar(24)).add(up.clone().multiplyScalar(15));
      idealLook.copy(carP).add(forward.clone().multiplyScalar(20));
    } else if (mode === 'TrackLocked') {
      // Follows position tightly but always looks PARALLEL to track line, acting as an arcade follower camera
      const closestIdx = TrackData.getClosestCheckpointIdx(carP);
      const tangent = trackCurve.getTangentAt(closestIdx / TrackData.checkpoints.length).normalize();
      
      idealPos.copy(carP).add(tangent.clone().multiplyScalar(-40)).add(up.clone().multiplyScalar(20));
      idealLook.copy(carP).add(tangent.clone().multiplyScalar(40));
    } else if (mode === 'WorldMap') {
      idealPos.set(0, 700, 1);
      idealLook.set(0, 0, 0);
    }
    
    camera.position.lerp(idealPos, 0.2); // Snappy tracking for high speeds
    
    // Smooth camera rotation
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, idealLook, new THREE.Vector3(0,1,0)));
    camera.quaternion.slerp(targetQuat, 0.15);
  });
  return null;
}

function BotCar() {
  const botRb = useRef<RapierRigidBody>(null);
  
  useFrame((state, delta) => {
    if (!botRb.current) return;
    const pos = botRb.current.translation();
    const p = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    // Global tracking instead of local look-ahead index. Never gets stuck!
    const closestIdx = TrackData.getClosestCheckpointIdx(p);
    
    // Adaptive target speed based on curve sharpness ahead
    const targetIdx3 = (closestIdx + 4) % TrackData.checkpoints.length;
    const targetIdx8 = (closestIdx + 12) % TrackData.checkpoints.length;
    const cp3 = TrackData.checkpoints[targetIdx3];
    const cp8 = TrackData.checkpoints[targetIdx8];
    const dir3 = cp3.clone().sub(p).normalize();
    const dir8 = cp8.clone().sub(cp3).normalize();
    const sharpCorner = dir3.dot(dir8) < 0.8;
    
    // Look ahead dynamically depending on speed
    const targetIdx = (closestIdx + (sharpCorner ? 6 : 10)) % TrackData.checkpoints.length;
    const target = TrackData.checkpoints[targetIdx];
    
    const idealDir = target.clone().sub(p).normalize();
    
    const rot = botRb.current.rotation();
    const currentQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
    const forwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(currentQuat);
    
    // Robust cross-product based steering angle
    const cross = forwardVec.clone().cross(idealDir);
    const dot = forwardVec.dot(idealDir);
    const angle = Math.atan2(cross.y, dot);
    
    // Pure Physical Steering (Torque Impulse)
    const targetYawRate = angle * 12.0; // Stronger steering to avoid walls
    const currentAngVel = botRb.current.angvel();
    const diffYawRate = targetYawRate - currentAngVel.y;
    botRb.current.applyTorqueImpulse({ x: 0, y: diffYawRate * 0.5, z: 0 }, true);
    
    // Pure Physical Propulsion (Linear Impulse) 
    const currentVel = botRb.current.linvel();
    const velVec = new THREE.Vector3(currentVel.x, 0, currentVel.z);
    const currentForwardSpeed = velVec.dot(forwardVec);
    
    // Slow down in sharp turns
    const targetSpeed = sharpCorner ? 40.0 : 90.0; 
    const diffF = targetSpeed - currentForwardSpeed;
    
    const impulse = new THREE.Vector3();
    impulse.addScaledVector(forwardVec, diffF * 0.15); // Better acceleration/braking
    
    // Arcade Grip: absolute lock on lateral sliding for the bot
    const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(currentQuat);
    const currentRightSpeed = velVec.dot(rightVec);
    impulse.addScaledVector(rightVec, -currentRightSpeed * 1.8); 
    
    // Keep bot glued to the ground and stabilized 
    botRb.current.applyImpulse(impulse, true);
  });
  
  return (
    <RigidBody ref={botRb} colliders="cuboid" ccd={true} position={[startTransforms.botPos.x, 2, startTransforms.botPos.z]} rotation={[0, startTransforms.startRotY, 0]} friction={0.0} restitution={0.2} mass={0.8} enabledRotations={[false, true, false]} linearDamping={1.5} angularDamping={2.0}>
        <Box args={[2.2, 0.6, 3.5]} castShadow receiveShadow>
          <meshStandardMaterial color="#0ea5e9" roughness={0.3} metalness={0.8} />
        </Box>
        <Cylinder args={[0.5, 0.5, 0.7]} position={[-1.3, -0.2, 1.2]} rotation={[0, 0, Math.PI / 2]}><meshStandardMaterial color="#222" /></Cylinder>
        <Cylinder args={[0.5, 0.5, 0.7]} position={[1.3, -0.2, 1.2]} rotation={[0, 0, Math.PI / 2]}><meshStandardMaterial color="#222" /></Cylinder>
        <Cylinder args={[0.5, 0.5, 0.7]} position={[-1.3, -0.2, -1.2]} rotation={[0, 0, Math.PI / 2]}><meshStandardMaterial color="#222" /></Cylinder>
        <Cylinder args={[0.5, 0.5, 0.7]} position={[1.3, -0.2, -1.2]} rotation={[0, 0, Math.PI / 2]}><meshStandardMaterial color="#222" /></Cylinder>
    </RigidBody>
  )
}

function StuntCar({ carRb }: { carRb: React.RefObject<RapierRigidBody> }) {
  const w1 = useRef<THREE.Mesh>(null);
  const w2 = useRef<THREE.Mesh>(null);
  const w3 = useRef<THREE.Mesh>(null);
  const w4 = useRef<THREE.Mesh>(null);
  const chassisMat = useRef<THREE.MeshStandardMaterial>(null);
  
  // Add group ref for intent arrow
  const intentArrowRef = useRef<THREE.Group>(null);
  
  // Apex positions for the sling shot multiplier
  const apexSouth = new THREE.Vector3(0, 0, 270);
  const apexNorth = new THREE.Vector3(0, 0, -270);
  
  useFrame((state, delta) => {
    const ble = BleService.getInstance();
    const input = InputService.getInstance();
    const cultEngine = CultivationEngine.getInstance();
    const rawCoherences = ble.rawAxes;
    
    let vx = 0;
    let vy = 0;
    let tq = 0;

    let intentMag = 0;
    let rawIntentX = 0;
    let rawIntentY = 0;

    if (ble.isConnected) {
        const cMode = input.useSensors ? 'Sweep' : 'Classic';
        let sweepX = ble.sweep_vx / 24.0;
        let sweepY = ble.sweep_vy / 24.0;
        let sweepTq = ble.sweep_tq / 24.0;
        let sweep_mag = Math.sqrt(sweepX**2 + sweepY**2);
        
        if (sweep_mag > 0.05) {
            vx = sweepX;
            vy = -sweepY;
            tq = sweepTq;
            intentMag = sweep_mag;
            rawIntentX = sweepX;
            rawIntentY = sweepY;
        } else {
            vx = ble.target_vx || 0;
            vy = -(ble.target_vy || 0); // Correctly bound so pushing UP moves FORWARD
            tq = ble.target_tq || 0;
            intentMag = Math.sqrt(vx*vx + vy*vy);
            rawIntentX = vx;
            rawIntentY = -vy; // revert inversion for arrow
        }
    } else {
        vx = (input.rawAxes[0] || 0) * 5.0;
        vy = (input.rawAxes[1] || 0) * 5.0; // Inverted or not? For consistency with ble.target_vy which is Y screen
        tq = (input.rawAxes[2] || 0) * 5.0;
        intentMag = Math.sqrt(vx*vx + vy*vy);
        rawIntentX = vx;
        rawIntentY = vy;
    }

    let chaosFactor = cultEngine.progress;

    // 1. Grip & Velocity (Global Density)
    let sum = 0;
    const len = rawCoherences.length || 120;
    for (let i = 0; i < len; i++) sum += Math.abs(rawCoherences[i]);
    const globalDensity = sum / len;

    let maxSpeedMulti = 1.0;
    let gripMulti = 1.0;
    if (chaosFactor > 0.3 && globalDensity > 0.4) {
      maxSpeedMulti = 1.6; // High grip = higher max speed
      gripMulti = 1.5;
      if (!RaceState.achievements.has("Magnetic Grip")) RaceState.achievements.add("Magnetic Grip");
      if (chassisMat.current) chassisMat.current.emissiveIntensity = THREE.MathUtils.lerp(chassisMat.current.emissiveIntensity, 0.8, 0.1);
    } else {
      if (chassisMat.current) chassisMat.current.emissiveIntensity = THREE.MathUtils.lerp(chassisMat.current.emissiveIntensity, 0.0, 0.1);
    }

    // 2. Pivot Orbit (Inter-hemispheric)
    let interSum = 0;
    let intraSum = 0;
    let half = Math.floor(len / 2);
    for (let i = 0; i < half; i++) interSum += Math.abs(rawCoherences[i]);
    for (let i = half; i < len; i++) intraSum += Math.abs(rawCoherences[i]);
    
    const isOrbitLocked = interSum > (intraSum + 0.15); 
    
    const pos = carRb.current?.translation() || { x: 0, y: 0, z: 0 };
    const pVec = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    TrackData.playerClosestIdx = TrackData.getClosestCheckpointIdx(pVec);
    
    let slingShotActive = false;
    let activeApex = null;
    if (isOrbitLocked && chaosFactor > 0.5) {
       if (pVec.distanceTo(apexSouth) < 90.0) activeApex = apexSouth;
       else if (pVec.distanceTo(apexNorth) < 90.0) activeApex = apexNorth;
       
       if (activeApex) {
         slingShotActive = true;
         maxSpeedMulti *= 1.5;
         if (!RaceState.achievements.has("Sling Shot")) RaceState.achievements.add("Sling Shot");
       }
    }

    // Update Intent Arrow
    if (intentArrowRef.current) {
        if (intentMag > 0.05) {
            intentArrowRef.current.visible = true;
            intentArrowRef.current.position.set(pos.x, pos.y + 0.5, pos.z);
            
            const camEuler = new THREE.Euler().setFromQuaternion(state.camera.quaternion, 'YXZ');
            const camYaw = new THREE.Euler(0, camEuler.y, 0, 'YXZ');
            
            // Map intent to world space via camera yaw
            const dirVector = new THREE.Vector3(rawIntentX, 0, rawIntentY);
            dirVector.applyEuler(camYaw).normalize();
            
            const arrowTarget = new THREE.Vector3(pos.x + dirVector.x, pos.y + 0.5, pos.z + dirVector.z);
            intentArrowRef.current.lookAt(arrowTarget);
            
            const arrowMesh1 = intentArrowRef.current.children[0] as THREE.Mesh;
            const arrowMesh2 = intentArrowRef.current.children[1] as THREE.Mesh;
            if (arrowMesh1?.material) (arrowMesh1.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, intentMag);
            if (arrowMesh2?.material) (arrowMesh2.material as THREE.MeshBasicMaterial).opacity = Math.min(0.6, intentMag * 0.8);
        } else {
            intentArrowRef.current.visible = false;
        }
    }

    // Apply Physical Vectors using pure Impulse limits wall clipping entirely
    if (carRb.current) {
        const moveSpeed = 80.0 * maxSpeedMulti;
        
        const rot = carRb.current.rotation();
        const carQuat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
        
        const camEuler = new THREE.Euler().setFromQuaternion(state.camera.quaternion, 'YXZ');
        const camYaw = new THREE.Euler(0, camEuler.y, 0, 'YXZ');
        
        // Instead of car forward/right, use camera forward/right for strafe inputs
        const forwardVec = new THREE.Vector3(0, 0, -1).applyEuler(camYaw);
        const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(camYaw);
        
        // Also keep actual car forward for standard friction
        const carForwardVec = new THREE.Vector3(0, 0, -1).applyQuaternion(carQuat);
        
        const currentVel = carRb.current.linvel();
        const velVec = new THREE.Vector3(currentVel.x, 0, currentVel.z);
        
        // We project current velocity onto the camera's axes to know how fast we are going relative to user input
        const currentForwardSpeed = velVec.dot(forwardVec);
        const currentRightSpeed = velVec.dot(rightVec);
        
        const impulse = new THREE.Vector3();
        
        if (slingShotActive && activeApex) {
           // Slingshot override: generate force tangential to the apex
           let dir = pVec.clone().sub(activeApex).normalize();
           let tangent = new THREE.Vector3(-dir.z, 0, dir.x);
           // Assure tangent points along current facing direction
           if (tangent.dot(forwardVec) < 0) tangent.negate();
           
           const currentTangentSpeed = velVec.dot(tangent);
           const diffTangent = (moveSpeed * 1.5) - currentTangentSpeed;
           impulse.addScaledVector(tangent, diffTangent * 0.15);
           
           // Grip to pull towards apex slightly
           impulse.addScaledVector(dir, -currentRightSpeed * 0.2); 
        } else {
           // Normal Racing Physics Tracking
           const targetForwardSpeed = vy * moveSpeed;
           const targetRightSpeed = vx * moveSpeed;

           const diffF = targetForwardSpeed - currentForwardSpeed;
           const diffR = targetRightSpeed - currentRightSpeed;
           
           // Forward acceleration & braking
           impulse.addScaledVector(forwardVec, diffF * 0.15);
           // Lateral Grip (resists sliding out during turns)
           impulse.addScaledVector(rightVec, diffR * 0.2 * gripMulti);
        }

        carRb.current.applyImpulse(impulse, true);

        // Steering Physics (Torque)
        const currentAngVel = carRb.current.angvel();
        const targetYawRate = -tq * 5.0; // tq is joystick X
        const diffYawRate = targetYawRate - currentAngVel.y;
        carRb.current.applyTorqueImpulse({ x: 0, y: diffYawRate * 0.3, z: 0 }, true);
        
        // Visual Wheels
        let speedFL = vy + vx + tq;
        let speedFR = vy - vx - tq;
        let speedBL = vy - vx + tq;
        let speedBR = vy + vx - tq;
        
        if (slingShotActive) {
            speedFL = 0; // Inner locked visual
            speedFR *= 2.5; speedBL *= 2.5; speedBR *= 2.5;
        }
        
        if (w1.current) w1.current.rotation.x -= speedFL * delta * 20.0; 
        if (w2.current) w2.current.rotation.x -= speedFR * delta * 20.0;
        if (w3.current) w3.current.rotation.x -= speedBL * delta * 20.0;
        if (w4.current) w4.current.rotation.x -= speedBR * delta * 20.0;
    }
  });

  return (
    <RigidBody ref={carRb} colliders="cuboid" ccd={true} position={[startTransforms.playerPos.x, 2, startTransforms.playerPos.z]} rotation={[0, startTransforms.startRotY, 0]} friction={0.0} restitution={0.2} mass={1.2} enabledRotations={[false, true, false]} linearDamping={1.0} angularDamping={2.0}>
       <group>
           <Box args={[2.2, 0.6, 3.5]} castShadow receiveShadow>
              <meshStandardMaterial ref={chassisMat} color="#ec4899" emissive="#f472b6" emissiveIntensity={0} roughness={0.4} metalness={0.7} />
           </Box>
           <Cylinder ref={w1} args={[0.5, 0.5, 0.7]} position={[-1.3, -0.2, 1.2]} rotation={[0, 0, Math.PI / 2]}><meshStandardMaterial color="#111" roughness={0.9} /></Cylinder>
           <Cylinder ref={w2} args={[0.5, 0.5, 0.7]} position={[1.3, -0.2, 1.2]} rotation={[0, 0, Math.PI / 2]}><meshStandardMaterial color="#111" roughness={0.9} /></Cylinder>
           <Cylinder ref={w3} args={[0.5, 0.5, 0.7]} position={[-1.3, -0.2, -1.2]} rotation={[0, 0, Math.PI / 2]}><meshStandardMaterial color="#111" roughness={0.9} /></Cylinder>
           <Cylinder ref={w4} args={[0.5, 0.5, 0.7]} position={[1.3, -0.2, -1.2]} rotation={[0, 0, Math.PI / 2]}><meshStandardMaterial color="#111" roughness={0.9} /></Cylinder>
           
           <group ref={intentArrowRef} visible={false}>
               <mesh position={[0, -0.3, -1.2]} rotation={[Math.PI / 2, 0, 0]}>
                   <coneGeometry args={[0.3, 0.8, 4]} />
                   <meshBasicMaterial color="#00ffff" transparent opacity={0.8} depthTest={false} />
               </mesh>
               <mesh position={[0, -0.3, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
                   <planeGeometry args={[0.1, 1.6]} />
                   <meshBasicMaterial color="#00ffff" transparent opacity={0.6} depthTest={false} />
               </mesh>
           </group>
       </group>
    </RigidBody>
  )
}

function RacingHUD({ camMode, setCamMode }: { camMode: string, setCamMode: (m:string)=>void }) {
  const [_, forceUpdate] = useState({});
  useEffect(() => { const i = setInterval(() => forceUpdate({}), 500); return () => clearInterval(i); }, []);
  return (
      <div className="absolute top-4 right-4 p-4 bg-slate-950/80 border border-emerald-500/50 rounded-lg font-mono text-white text-xs w-72 pointer-events-auto backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.2)]">
         <h1 className="text-emerald-400 font-extrabold mb-2 uppercase tracking-wide">Genesis Circuit</h1>
         <div className="text-slate-400 mb-2 border-b border-slate-700 pb-1 font-semibold">Semantic Exploits</div>
         
         <div className={`mb-1 transition-colors duration-500 flex items-center gap-2 ${RaceState.achievements.has('Magnetic Grip') ? 'text-yellow-300 drop-shadow-[0_0_5px_rgba(253,224,71,0.8)]' : 'text-slate-600'}`}>
            <span className="text-[10px]">■</span> Grip (Density Bias)
         </div>
         <div className={`mb-1 transition-colors duration-500 flex items-center gap-2 ${RaceState.achievements.has('Sling Shot') ? 'text-yellow-300 drop-shadow-[0_0_5px_rgba(253,224,71,0.8)]' : 'text-slate-600'}`}>
            <span className="text-[10px]">■</span> Slingshot (Hemispheric)
         </div>

         <div className="mt-4 border-t border-slate-700 pt-3">
           <button 
             onClick={() => {
               const modes = ['ThirdPerson', 'FirstPerson', 'TrackLocked', 'WorldMap'];
               setCamMode(modes[(modes.indexOf(camMode) + 1) % modes.length]);
             }}
             className="w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-emerald-300 py-2 rounded border border-slate-600 transition-colors uppercase font-bold tracking-widest cursor-pointer"
           >
             CAMERA: {camMode}
           </button>
         </div>
      </div>
  )
}

function CheckpointGate({ index, cp }: { index: number, cp: THREE.Vector3 }) {
   const gateRef = useRef<THREE.Mesh>(null);
   const cpNext = TrackData.checkpoints[(index + 1) % TrackData.checkpoints.length];
   const dummy = useMemo(() => {
       const d = new THREE.Object3D();
       d.position.copy(cp);
       d.lookAt(cpNext);
       return d;
   }, [cp, cpNext]);
   
   useFrame(() => {
       if (!gateRef.current) return;
       // diff between TrackData.playerClosestIdx and index
       let diff = index - TrackData.playerClosestIdx;
       if (diff < 0) diff += TrackData.checkpoints.length;
       
       // isActive if index is the upcoming gate
       const isActive = diff > 0 && diff <= 12;
       
       const mat = gateRef.current.material as THREE.MeshStandardMaterial;
       if (isActive) {
           mat.color.setHex(0x10b981);
           mat.emissive.setHex(0x10b981);
           mat.opacity = 0.4;
       } else {
           mat.color.setHex(0x334155);
           mat.emissive.setHex(0x000000);
           mat.opacity = 0.1;
       }
   });
   
   return (
      <group position={[cp.x, 0, cp.z]} rotation={[0, dummy.rotation.y, 0]}>
         {/* Massive translucent arch/wall that players drive through */}
         <mesh ref={gateRef} position={[0, 10, 0]} castShadow receiveShadow>
            <boxGeometry args={[TRACK_WIDTH, 20, 1]} />
            <meshStandardMaterial transparent={true} depthWrite={false} />
         </mesh>
         {/* Left pillar */}
         <mesh position={[-TRACK_WIDTH/2, 10, 0]}>
             <boxGeometry args={[2, 20, 2]} />
             <meshStandardMaterial color="#334155" />
         </mesh>
         {/* Right pillar */}
         <mesh position={[TRACK_WIDTH/2, 10, 0]}>
             <boxGeometry args={[2, 20, 2]} />
             <meshStandardMaterial color="#334155" />
         </mesh>
         {/* Top beam */}
         <mesh position={[0, 21, 0]}>
             <boxGeometry args={[TRACK_WIDTH + 4, 2, 2]} />
             <meshStandardMaterial color="#334155" />
         </mesh>
      </group>
   );
}

export const StuntRacingScene = () => {
  const carRb = useRef<RapierRigidBody>(null);
  const [camMode, setCamMode] = useState('ThirdPerson');
  
  return (
    <div className="w-full h-full absolute inset-0 z-0 bg-slate-900 cursor-crosshair">
      <Canvas shadows={{ type: THREE.PCFShadowMap }} gl={{ preserveDrawingBuffer: true }}>
        <XR store={xrStore}>
          <Sky sunPosition={[100, 20, 100]} turbidity={0.1} rayleigh={0.5} />
          <ambientLight intensity={0.6} />
          <directionalLight castShadow position={[10, 30, 20]} intensity={1.5} shadow-mapSize={[2048, 2048]} />
          <fog attach="fog" args={["#0f172a", 100, 1500]} />
          
          <Physics gravity={[0, -40, 0]}>
             <CameraRig mode={camMode} carRef={carRb} />
             <StuntCar carRb={carRb} />
             <BotCar />
             
             {/* Procedural Track Geometry */}
             <RigidBody type="fixed" friction={0.0} restitution={0.2}>
                {/* Physical Ground */}
                <Box args={[1200, 2, 1200]} position={[0, -1, 0]} receiveShadow>
                   <meshStandardMaterial color="#0f172a" roughness={0.9} />
                </Box>
             </RigidBody>

             <RigidBody type="fixed" colliders="trimesh" friction={0.0} restitution={0.2}>
                <mesh castShadow receiveShadow>
                   <extrudeGeometry args={[
                       new THREE.Shape().moveTo(-2, 0).lineTo(2, 0).lineTo(2, 20).lineTo(-2, 20).lineTo(-2, 0),
                       { extrudePath: leftCurve, steps: TRACK_OVERLAPPING_SEGMENTS, bevelEnabled: false }
                   ]} />
                   <meshStandardMaterial color="#1e293b" />
                </mesh>
                <mesh castShadow receiveShadow>
                   <extrudeGeometry args={[
                       new THREE.Shape().moveTo(-2, 0).lineTo(2, 0).lineTo(2, 20).lineTo(-2, 20).lineTo(-2, 0),
                       { extrudePath: rightCurve, steps: TRACK_OVERLAPPING_SEGMENTS, bevelEnabled: false }
                   ]} />
                   <meshStandardMaterial color="#1e293b" />
                </mesh>
             </RigidBody>
             
             {/* Visible Checkpoint Markers */}
             {TrackData.checkpoints.map((cp, i) => {
                 // Render a checkpoint gate every 10 segments
                 if (i % 10 !== 0) return null;
                 return <CheckpointGate key={`cp-${i}`} index={i} cp={cp} />;
             })}
             
             {/* Track Lane Grid markings mapped globally */}
             <Grid args={[1200, 1200]} sectionSize={20} cellSize={4} sectionColor="#334155" cellColor="#0f172a" position={[0, 0.1, 0]} fadeDistance={600} />

             {/* Apex Pivot Landmark 1 */}
             <group position={[0, 0, -270]}>
                 <Sphere args={[2]} position={[0, 6, 0]}><meshStandardMaterial color="gold" emissive="gold" emissiveIntensity={3} /></Sphere>
                 <pointLight position={[0, 6, 0]} color="gold" intensity={5} distance={50} />
             </group>

             {/* Apex Pivot Landmark 2 */}
             <group position={[0, 0, 270]}>
                 <Sphere args={[2]} position={[0, 6, 0]}><meshStandardMaterial color="gold" emissive="gold" emissiveIntensity={3} /></Sphere>
                 <pointLight position={[0, 6, 0]} color="gold" intensity={5} distance={50} />
             </group>
             
          </Physics>

          {/* Backup camera */}
          <PerspectiveCamera makeDefault position={[0, 100, 200]} rotation={[-Math.PI / 4, 0, 0]} />
        </XR>
      </Canvas>
      <RacingHUD camMode={camMode} setCamMode={setCamMode} />
    </div>
  );
};
