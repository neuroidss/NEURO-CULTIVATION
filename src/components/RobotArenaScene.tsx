import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics, RigidBody, RapierRigidBody } from '@react-three/rapier';
import { XR } from '@react-three/xr';
import { globalXrStore as xrStore } from '../lib/xrStore';
import { Sky, Grid, Box } from '@react-three/drei';
import * as THREE from 'three';
import { InputService } from '../lib/InputService';
import { CultivationEngine } from '../lib/CultivationEngine';
import { dotProduct } from '../lib/clipHelper';

import { BleService } from '../lib/BleService';
import { MultiplayerService } from '../lib/MultiplayerService';
import { EngineConfig } from '../config/EngineConfig';

export const playerPosition = new THREE.Vector3();

interface RobotArenaProps {
    currentPosRef: React.RefObject<Float32Array>;
    driftRef: React.RefObject<Float32Array>;
    mode1Refs: Float32Array[];
    mode2Refs: Float32Array[];
    movementAxes?: Float32Array[];
    viewMode: 'World' | 'ThirdPerson';
    controlMode?: 'Motor' | 'Sweep' | 'Resonance' | 'Classic' | 'Semantic';
    controlBlend?: number;
    moveSensitivity?: number;
    zoomLevel?: number;
    movementInput?: 'BLE' | 'Gamepad';
    bladesInput?: 'BLE' | 'Gamepad';
    bladeCount?: number;
    isActive?: boolean;
    audioEngine?: any;
    showIntentArrow?: boolean;
}

const OrbiterMesh = ({ i, getPstFut, baseColor }: { i: number, getPstFut: () => { past: Float32Array, future: Float32Array } | null, baseColor: number }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
        if (!meshRef.current) return;
        const pstFut = getPstFut();
        const past = pstFut ? pstFut.past[i] : 0;
        const future = pstFut ? pstFut.future[i] : 0;
        
        const mat = meshRef.current.material as THREE.MeshStandardMaterial;
        mat.color.setHSL(baseColor, 1.0, 0.5 + Math.abs(future) * 0.5);
        mat.emissive.copy(mat.color).multiplyScalar(Math.abs(future));
        meshRef.current.rotation.x += future * 0.1;
        meshRef.current.rotation.y += past * 0.1;
    });
    return (
        <mesh ref={meshRef}>
            <boxGeometry args={[0.2, 0.4, 0.1]} />
            <meshStandardMaterial color="white" />
        </mesh>
    );
};

const OrbiterSwarm = ({ playerRb, getPstFut, baseColor, bladeCount = 28, collisionGroups }: { playerRb: React.RefObject<RapierRigidBody>, getPstFut: () => { past: Float32Array, future: Float32Array } | null, baseColor: number, bladeCount?: number, collisionGroups?: number }) => {
    // We create orbiters based on bladeCount
    const orbiters = useRef(Array(bladeCount).fill(0).map(() => React.createRef<RapierRigidBody>())).current;
    const orbiterTime = useRef(Math.random() * 100);
    
    useFrame((state, delta) => {
        if (!playerRb.current) return;
        orbiterTime.current += delta;
        const pstFut = getPstFut();
        const playerPos = playerRb.current.translation();
        
        const playerYaw = (() => {
            const rot = playerRb.current.rotation();
            const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w), 'YXZ');
            return euler.y;
        })();
        
        for (let i = 0; i < bladeCount; i++) {
             const rb = orbiters[i]?.current;
             if (!rb) continue;
             
             const past = pstFut ? pstFut.past[i] || 0 : 0;
             const future = pstFut ? pstFut.future[i] || 0 : 0;
             
             const diff = future - past;
             // Maximum attack distance
             const attackExtent = Math.max(0, diff * 20.0);
             
             // System Protection: minimum radius so blades never touch user
             const r_min = 2.0;
    
             const theta_i = (i * Math.PI * 2) / bladeCount;
             const theta_world = theta_i - playerYaw; // make blades orbit the avatar
             
             const c = attackExtent / 2; // focal distance
             const a = c + r_min; // major semi-axis
             const b = r_min;  // minor semi-axis
    
             const orbitSpeed = 2.0 + Math.abs(diff) * 0.1;
             const phi = orbiterTime.current * orbitSpeed + theta_i;
    
             // Local ellipse centered at (0,0). User is at (-c, 0).
             // To align user with (0,0), we translate by (c, 0)
             const x_local = c + a * Math.cos(phi);
             const z_local = b * Math.sin(phi);
    
             // Rotate ellipse to face attack direction theta_world
             const rx = x_local * Math.cos(theta_world) - z_local * Math.sin(theta_world);
             const rz = x_local * Math.sin(theta_world) + z_local * Math.cos(theta_world);
    
             const targetX = playerPos.x + rx;
             const targetY = playerPos.y + 0.5; // Always keep the blades low so they can hit things
             const targetZ = playerPos.z + rz;
             
             const safeDist = EngineConfig.Arena.safeDist; // safety bubble
             let safeTargetX = targetX;
             let safeTargetY = targetY;
             let safeTargetZ = targetZ;
             
             // Adjust the target so it's never inside the safety bubble
             const tDX = targetX - playerPos.x;
             const tDZ = targetZ - playerPos.z;
             const tDist = Math.sqrt(tDX*tDX + tDZ*tDZ);
             if (tDist < safeDist && tDist > 0.001) {
                 safeTargetX = playerPos.x + (tDX / tDist) * safeDist;
                 safeTargetZ = playerPos.z + (tDZ / tDist) * safeDist;
             }
             
             // Instantaneous reactivity for blades (kinematicPosition)
             rb.setTranslation({ x: safeTargetX, y: safeTargetY, z: safeTargetZ }, true);

             const targetAngle = -theta_world - Math.PI / 2;
             const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
             rb.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
        }
    });
    
    return (
        <group>
        {orbiters.map((ref, i) => (
            <RigidBody key={i} ref={ref} type="kinematicPosition" colliders="cuboid" position={[0, -5, 0]} collisionGroups={collisionGroups}>
                <OrbiterMesh i={i} getPstFut={getPstFut} baseColor={baseColor} />
            </RigidBody>
        ))}
        </group>    
    );
};

// ... Wait, let's keep going

const RobotAvatar = ({ currentPosRef, driftRef, mode1Refs, mode2Refs, movementAxes, viewMode, controlMode = 'Classic', controlBlend = 0.0, moveSensitivity = 0.05, zoomLevel = 80, movementInput = 'BLE', bladesInput = 'BLE', bladeCount = 28, audioEngine, showIntentArrow = false }: RobotArenaProps) => {
    const rb = useRef<RapierRigidBody>(null);
    const bodyMesh = useRef<THREE.Mesh>(null);
    const intentArrowRef = useRef<THREE.Group>(null);
    const cameraTarget = useRef(new THREE.Vector3());
    const smoothedIntent = useRef({ x: 0, z: 0, yaw: 0 });

    // Pad arrays so they don't break if resized slightly
    const gamepadBlades = useRef({ past: new Float32Array(128), future: new Float32Array(128) }).current;

    const getPstFut = () => {
        if (bladesInput === 'Gamepad') {
            const input = InputService.getInstance();
            
            // All buttons and triggers act as axes.
            // Let's combine all logical directions. (Negate Y-axes where UP is +1 so they match the standard where UP is -1.0)
            const attackX = (input.rawAxes[6] || 0) + (input.rawAxes[8] || 0) + (input.rawAxes[5] || 0) * 1.5; 
            const attackZ = -(input.rawAxes[7] || 0) - (input.rawAxes[9] || 0) - (input.rawAxes[4] || 0) * 1.5;

            // In local coordinate system (swarm rotates with character), 
            // stick X should map to blade X, sticking Z (forward is negative stick)
            // maps directly to blade Z (we map standard inputs to local theta directions).
            // -1 in attackZ means pushing UP (forward). Let's see how theta_i is defined:
            // X=cos, Z=sin. For theta=0, X=1, Z=0. (Right blade)
            // For theta=-pi/2, X=0, Z=-1. (Forward blade).
            // So attackX should map to cos, attackZ to sin.
            const relAttackX = attackX;
            const relAttackZ = attackZ;

            for(let i=0; i<bladeCount; i++) {
                const theta_i = (i * Math.PI * 2) / bladeCount;
                const dirX = Math.cos(theta_i);
                const dirZ = Math.sin(theta_i); 
                
                const align = relAttackX * dirX + relAttackZ * dirZ;
                
                // Directly set future to align so diff (future-past) is exactly the alignment
                gamepadBlades.past[i] = 0;
                gamepadBlades.future[i] = Math.max(0, align);
            }
            return gamepadBlades;
        }

        const ble = BleService.getInstance();
        if (ble.isConnected && ble.rawAxes) {
            const N = ble.rawAxes.length;
            const M = bladeCount;
            
            for(let i=0; i<128; i++) {
                gamepadBlades.past[i] = 0;
                gamepadBlades.future[i] = 0;
            }
            if (M === 0 || N === 0) return gamepadBlades;
            
            const electrodes = ble.electrodes;
            const ch = ble.numChannels;
            let pairIdx = 0;
            
            for (let c1 = 0; c1 < ch; c1++) {
                for (let c2 = c1 + 1; c2 < ch; c2++) {
                    if (pairIdx >= N) break;

                    // Blades driven by Beta (rawAxes, 18-36 Hz)
                    const betaVal = ble.rawAxes[pairIdx] || 0;
                    const pastVal = Math.max(0, -betaVal);
                    const futVal = Math.max(0, betaVal);
                    
                    const cx = (electrodes[c1].x + electrodes[c2].x) / 2;
                    const cy = (electrodes[c1].y + electrodes[c2].y) / 2;
                    
                    // Angle of pair center (maps to X/Z plane)
                    const pairAngle = Math.atan2(cy, cx); 
                    
                    for (let b = 0; b < M; b++) {
                        const theta_b = (b * Math.PI * 2) / M;
                        // Compare orbit angle (theta_b) with pairAngle.
                        // We map pairAngle (which is in X,Y coordinates of skull) to X, -Z coordinates in game.
                        // So pair angle alpha means X=cos(alpha), Z=-sin(alpha).
                        const sim = Math.cos(theta_b) * Math.cos(pairAngle) + Math.sin(theta_b) * (-Math.sin(pairAngle));
                        
                        if (sim > 0.5) { 
                           gamepadBlades.past[b] += pastVal * sim;
                           gamepadBlades.future[b] += futVal * sim;
                        }
                    }
                    pairIdx++;
                }
            }
            return gamepadBlades;
        }
        return null;
    };

    useFrame((state, delta) => {
        if (!rb.current || !driftRef.current) return;

        const input = InputService.getInstance();
        const ble = BleService.getInstance();
        const cultEngine = CultivationEngine.getInstance();
        const mp = MultiplayerService.getInstance();
        
        const mapSim = (sim: number) => Math.max(0.0, Math.min(1.0, (sim - 0.18) * 4.0));
        
        // --- Calculate Anchor (Past) Intent (Classic) ---
        let classicIntentZ = 0;
        let classicIntentX = 0;
        let classicIntentYaw = 0;

        if (movementInput === 'BLE' && ble.isConnected) {
            // Scale BLE target velocities to match gamepad intent magnitudes
            // Movement driven by Working Memory (Gamma cross-frequency phase / sweep)
            // Note: sweep_val is internally scaled by 12x in BleService, so we divide the scale significantly to keep control smooth.
            const eegScale = EngineConfig.Arena.intentMoveMagnitude / 24.0; 
            classicIntentZ = ble.sweep_vy * eegScale; 
            classicIntentX = ble.sweep_vx * eegScale; 
            classicIntentYaw = ble.sweep_tq * (EngineConfig.Arena.intentTurnMagnitude / 24.0); 
        } else {
            classicIntentZ = (input.rawAxes[1] || 0) * EngineConfig.Arena.intentMoveMagnitude; 
            classicIntentX = (input.rawAxes[0] || 0) * EngineConfig.Arena.intentMoveMagnitude;  
            classicIntentYaw = (input.rawAxes[2] || 0) * EngineConfig.Arena.intentTurnMagnitude; 
        }

        // --- Calculate Anchor (Past) Intent (Semantic) ---
        let semanticIntentZ = 0;
        let semanticIntentX = 0;
        let semanticIntentYaw = 0;

        const dot = (v1: Float32Array, v2: Float32Array) => {
            let sum = 0; for(let i=0; i<v1.length; i++) sum += v1[i]*v2[i]; return sum;
        };
        
        const isSemanticActive = driftRef.current && dot(driftRef.current, driftRef.current) > 0.000001;

        if (movementInput === 'BLE' && movementAxes && movementAxes.length >= 3 && isSemanticActive) {
            const mapIntent = (sim: number) => {
                let s = sim * EngineConfig.BLE.driftSimScale; 
                return s < 0.1 && s > -0.1 ? 0 : Math.max(-1, Math.min(1, s));
            };
            
            const right_val = mapIntent(dot(driftRef.current, movementAxes[0]));
            const back_val = mapIntent(dot(driftRef.current, movementAxes[1]));
            const turn_right_val = mapIntent(dot(driftRef.current, movementAxes[2]));
            
            semanticIntentX = right_val * EngineConfig.Arena.intentMoveMagnitude;
            semanticIntentZ = back_val * EngineConfig.Arena.intentMoveMagnitude;
            semanticIntentYaw = turn_right_val * EngineConfig.Arena.intentTurnMagnitude;
            
        } else if (movementInput === 'BLE' && mode2Refs.length > 2 && isSemanticActive) {
            const mapIntent = (sim: number) => {
                let s = sim * EngineConfig.BLE.driftSimScale; 
                return Math.abs(s) < 0.1 ? 0 : Math.max(-1, Math.min(1, s)) * EngineConfig.Arena.intentMoveMagnitude;
            };
            
            let raw0 = dot(driftRef.current, mode2Refs[0]);
            let raw1 = dot(driftRef.current, mode2Refs[1]);
            let raw2 = dot(driftRef.current, mode2Refs[2]);
            let raw5 = dot(driftRef.current, mode2Refs[5]);
            let raw8 = dot(driftRef.current, mode2Refs[8]);
            let raw9 = dot(driftRef.current, mode2Refs[9]);
            
            semanticIntentX = mapIntent(raw0) || mapIntent(raw8);
            semanticIntentZ = mapIntent(raw1) || mapIntent(raw9); 
            semanticIntentYaw = (mapIntent(raw2) || mapIntent(raw5)) * (EngineConfig.Arena.intentTurnMagnitude / EngineConfig.Arena.intentMoveMagnitude);
        } else {
            // Fallback to classic when semantics are missing
            if (movementInput === 'BLE' && ble.isConnected) {
                const eegScale = EngineConfig.Arena.intentMoveMagnitude / 24.0; 
                semanticIntentZ = ble.sweep_vy * eegScale; 
                semanticIntentX = ble.sweep_vx * eegScale; 
                semanticIntentYaw = ble.sweep_tq * (EngineConfig.Arena.intentTurnMagnitude / 24.0); 
            } else {
                semanticIntentZ = (input.rawAxes[1] || 0) * EngineConfig.Arena.intentMoveMagnitude; 
                semanticIntentX = (input.rawAxes[0] || 0) * EngineConfig.Arena.intentMoveMagnitude;  
                semanticIntentYaw = (input.rawAxes[2] || 0) * EngineConfig.Arena.intentTurnMagnitude; 
            }
        }

        // Smooth blend of classic and semantic intents via controlBlend
        let effectiveBlend = controlBlend < 0 ? cultEngine.progress : controlBlend;
        if (controlMode === 'Classic' || controlMode === 'Motor') effectiveBlend = 0.0;
        if (controlMode === 'Semantic' || controlMode === 'Sweep' || controlMode === 'Resonance') effectiveBlend = 1.0;
        
        let intentX = classicIntentX * (1.0 - effectiveBlend) + semanticIntentX * effectiveBlend;
        let intentZ = classicIntentZ * (1.0 - effectiveBlend) + semanticIntentZ * effectiveBlend;
        let intentYaw = classicIntentYaw * (1.0 - effectiveBlend) + semanticIntentYaw * effectiveBlend;

        let semanticFire = 0;
        
        if (mode1Refs.length > 28) {
            semanticFire = mapSim(dotProduct(currentPosRef.current, mode1Refs[3])); // "Roaring heavenly fire flame"
        }

        const skillLevel = moveSensitivity;
        const smooth = 0.98 - (skillLevel * 0.1);
        const gain = skillLevel * EngineConfig.Arena.intentGain;

        smoothedIntent.current.x = smoothedIntent.current.x * smooth + intentX * gain * (1 - smooth);
        smoothedIntent.current.z = smoothedIntent.current.z * smooth + intentZ * gain * (1 - smooth);
        smoothedIntent.current.yaw = smoothedIntent.current.yaw * smooth + intentYaw * gain * EngineConfig.Arena.turnSpeedScale * (1 - smooth);

        const sIntentX = smoothedIntent.current.x;
        const sIntentZ = smoothedIntent.current.z;
        const sIntentYaw = smoothedIntent.current.yaw;

        const stabilityMultiplier = 1.0 - cultEngine.instability; 
        const activeBoost = 1.0 + (ble.isConnected ? ble.synapticPersistence : input.synapticPersistence) * 4.0;
        const baseSpeedScale = EngineConfig.Arena.baseSpeedScale * activeBoost; 
        const baseTurnScale = EngineConfig.Arena.baseTurnScale * activeBoost * 0.5; 

        let focusIntensity = 0;
        const pstFut = getPstFut();
        if (pstFut) {
            let pastPower = 0;
            let futurePower = 0;
            for(let i=0; i<28; i++){
                pastPower += Math.abs(pstFut.past[i]);
                futurePower += Math.abs(pstFut.future[i]);
            }
            let asymmetry = Math.max(0, futurePower - pastPower) / Math.max(0.1, pastPower);
            focusIntensity = Math.min(1.0, Math.max(0, asymmetry - 0.2) / 1.5); 
        }

        const currentVel = rb.current.linvel();
        const rot = rb.current.rotation();
        const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w), 'YXZ');
        
        // Strafe direction is always relative to the camera's view (screen space)
        const camEuler = new THREE.Euler().setFromQuaternion(state.camera.quaternion, 'YXZ');
        const camYaw = new THREE.Euler(0, camEuler.y, 0, 'YXZ');
        
        // (0,0,1) points towards the camera. If user wants to move forward (negative sIntentZ),
        // multiplying by (0,0,1) makes velocity negative along the camera's local Z (away from camera).
        const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(camYaw);
        const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(camYaw);
        
        const targetVx = (forwardVector.x * sIntentZ + rightVector.x * sIntentX) * baseSpeedScale;
        const targetVz = (forwardVector.z * sIntentZ + rightVector.z * sIntentX) * baseSpeedScale;
        
        let targetVy = currentVel.y;
        if (rb.current.translation().y > 1.5) {
            targetVy = THREE.MathUtils.lerp(targetVy, -5.0, 0.2); // bring it down fast
        } else {
            targetVy = -1.0; // slight gravity to stick to floor
        }

        const fixNaN = (v: number) => Number.isNaN(v) ? 0 : v;
        const targetVxSafe = fixNaN(targetVx);
        const targetVySafe = fixNaN(targetVy);
        const targetVzSafe = fixNaN(targetVz);

        const currentPos = rb.current.translation();
        
        let clampedVx = targetVxSafe;
        let clampedVz = targetVzSafe;
        
        // Strict physical position clamping (Arena is 50x50, bounded at +/- 24.5)
        let forcedX = currentPos.x;
        let forcedZ = currentPos.z;
        let requiresClamp = false;

        if (currentPos.x < -24.5) { forcedX = -24.5; clampedVx = Math.max(0, clampedVx); requiresClamp = true; }
        if (currentPos.x > 24.5) { forcedX = 24.5; clampedVx = Math.min(0, clampedVx); requiresClamp = true; }
        if (currentPos.z < -24.5) { forcedZ = -24.5; clampedVz = Math.max(0, clampedVz); requiresClamp = true; }
        if (currentPos.z > 24.5) { forcedZ = 24.5; clampedVz = Math.min(0, clampedVz); requiresClamp = true; }

        if (requiresClamp) {
            rb.current.setTranslation({ x: forcedX, y: currentPos.y, z: forcedZ }, true);
        }

        rb.current.setLinvel({ x: clampedVx, y: targetVySafe, z: clampedVz }, true);
        
        const newEuler = euler.clone();
        
        // Apply the pure decoupled semantic/classic IntentYaw (the Theta-Gamma Sagitta)
        // This now works perfectly in both World and Third Person without cross-talk
        newEuler.y += fixNaN(-sIntentYaw * baseTurnScale * delta);
        
        const targetQuat = new THREE.Quaternion().setFromEuler(newEuler);
        rb.current.setRotation({ x: fixNaN(targetQuat.x), y: fixNaN(targetQuat.y), z: fixNaN(targetQuat.z), w: fixNaN(targetQuat.w) }, true);
        rb.current.setAngvel({ x: 0, y: 0, z: 0 }, true);

        // Update the visual intent arrow based on the raw intent from Sweep/Working Memory (or motor fallback)
        if (intentArrowRef.current) {
            const rawMag = Math.sqrt(intentX * intentX + intentZ * intentZ);
            if (showIntentArrow && rawMag > 0.05) {
                intentArrowRef.current.visible = true;
                intentArrowRef.current.position.set(currentPos.x, currentPos.y - 0.4, currentPos.z);
                
                // Calculate world direction the user is trying to push toward
                const dirVector = new THREE.Vector3(intentX, 0, intentZ);
                // The intent is defined in screen space, so we apply the camera yaw to map it to world space
                dirVector.applyEuler(camYaw).normalize();
                
                // Point the arrow
                const arrowTarget = new THREE.Vector3(
                    currentPos.x + dirVector.x, 
                    currentPos.y - 0.4, 
                    currentPos.z + dirVector.z
                );
                intentArrowRef.current.lookAt(arrowTarget);
                
                // Scale opacity based on intent strength
                const arrowMesh1 = intentArrowRef.current.children[0] as THREE.Mesh;
                const arrowMesh2 = intentArrowRef.current.children[1] as THREE.Mesh;
                if (arrowMesh1?.material) (arrowMesh1.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, rawMag);
                if (arrowMesh2?.material) (arrowMesh2.material as THREE.MeshBasicMaterial).opacity = Math.min(0.6, rawMag * 0.8);
            } else {
                intentArrowRef.current.visible = false;
            }
        }

        if (bodyMesh.current) {
            const mat = bodyMesh.current.material as THREE.MeshStandardMaterial;
            // Ensure values are never NaN to prevent black material
            const h = fixNaN(semanticFire * 0.2 + 0.5) || 0.6;
            const lColor = fixNaN(0.5 + stabilityMultiplier * 0.2) || 0.7;
            const intensity = fixNaN(Math.max(0.0, cultEngine.level * 0.5 * stabilityMultiplier)) || 0.5;
            
            mat.color.setHSL(h, 1.0, lColor);
            mat.emissive.setHSL(h, 1.0, 0.5);
            mat.emissiveIntensity = intensity;
            mat.wireframe = false;
        }

        // Safety net to rescue if fallen under the floor
        if (currentPos.y < -2 || currentPos.y > 20 || Number.isNaN(currentPos.y)) {
            rb.current.setTranslation({ x: fixNaN(currentPos.x)||0, y: 5, z: fixNaN(currentPos.z)||0 }, true);
            rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }

        const pos = rb.current.translation();
        playerPosition.set(pos.x, pos.y, pos.z);
        if ((state.camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
            (state.camera as THREE.PerspectiveCamera).fov = 50;
        }

        if (viewMode === 'ThirdPerson') {
            const zoomDist = zoomLevel / 4.0;
            const offset = new THREE.Vector3(0, zoomDist * 0.5, zoomDist); 
            offset.applyEuler(euler);
            
            const targetCamPos = new THREE.Vector3(pos.x + offset.x, pos.y + offset.y, pos.z + offset.z);
            state.camera.position.copy(targetCamPos);
            
            cameraTarget.current.copy(new THREE.Vector3(pos.x, pos.y + 1, pos.z));
            state.camera.lookAt(cameraTarget.current);
        } else {
            const zoomDist = zoomLevel * 0.7; 
            state.camera.position.set(zoomDist * 0.5, zoomDist, zoomDist * 0.8);
            cameraTarget.current.set(0, 0, 0);
            state.camera.lookAt(cameraTarget.current);
        }
        state.camera.updateProjectionMatrix();

        if (mp.peerId) {
            const pos = rb.current.translation();
            const rot = rb.current.rotation();
            mp.broadcastState({
                id: mp.peerId,
                position: [pos.x, pos.y, pos.z],
                rotation: [rot.x, rot.y, rot.z, rot.w],
                color: mp.localColor
            });
        }

        let bladeIntensity = 0;
        const bladePstFut = getPstFut();
        if (bladePstFut) {
            for (let i = 0; i < bladeCount; i++) {
                bladeIntensity += Math.max(0, bladePstFut.future[i] - bladePstFut.past[i]);
            }
            bladeIntensity = Math.min(1.0, bladeIntensity / 8.0);
        }

        if (audioEngine) {
            audioEngine.updateArenaAudio(pos, null, activeBoost, focusIntensity, bladeIntensity);
        }
    });

    return (
        <>
            <RigidBody ref={rb} position={[0, 1.5, 0]} colliders="cuboid" enabledRotations={[false, true, false]} collisionGroups={131069}>
                <Box ref={bodyMesh} args={[1, 2, 1]} castShadow>
                    <meshStandardMaterial color="cyan" />
                </Box>
            </RigidBody>
            <group ref={intentArrowRef} visible={false}>
                <mesh position={[0, 0, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
                    <coneGeometry args={[0.3, 0.8, 4]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.8} depthTest={false} />
                </mesh>
                <mesh position={[0, 0, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[0.1, 1.6]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.6} depthTest={false} />
                </mesh>
            </group>
            <OrbiterSwarm key={`swarm-${bladeCount}`} playerRb={rb} getPstFut={getPstFut} baseColor={0.5} bladeCount={bladeCount} collisionGroups={196606} />
        </>
    );
};

const EnemyBot = ({ bladeCount = 28 }: { bladeCount?: number }) => {
    const rb = useRef<RapierRigidBody>(null);
    const botBrain = useRef({
        past: new Float32Array(128).fill(0),
        future: new Float32Array(128).fill(0)
    }).current;
    
    useFrame((state, delta) => {
        if (!rb.current) return;
        
        const pos = rb.current.translation();
        
        const dx = playerPosition.x - pos.x;
        const dz = playerPosition.z - pos.z;
        const dist = Math.sqrt(dx*dx + dz*dz);
        const currentVel = rb.current.linvel();
        
        let focusIntensity = 0;

        if (dist < 100 && dist > 1.5) {
            const speed = 4.0;
            const targetVx = (dx / dist) * speed;
            const targetVz = (dz / dist) * speed;
            
            // Only apply force if we aren't already flying super fast from a hit
            if (currentVel.x * currentVel.x + currentVel.z * currentVel.z < speed * speed * 2) {
                const forceX = (targetVx - currentVel.x) * 2.0;
                const forceZ = (targetVz - currentVel.z) * 2.0;
                rb.current.applyImpulse({ x: forceX * delta, y: 0, z: forceZ * delta }, true);
            }
            
            const angle = Math.atan2(dx, dz);
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
            rb.current.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
            
            const time = state.clock.getElapsedTime();
            let pastPower = 0;
            let futPower = 0;
            for(let i=0; i<28; i++) {
                 botBrain.past[i] = Math.sin(time*2 + i) * 0.5;
                 botBrain.future[i] = Math.cos(time*3 + i) * 0.5;
                 pastPower += Math.abs(botBrain.past[i]);
                 futPower += Math.abs(botBrain.future[i]);
            }
            let asymmetry = Math.max(0, futPower - pastPower) / Math.max(0.1, pastPower);
            focusIntensity = Math.min(1.0, Math.max(0, asymmetry - 0.2) / 1.5); 
        } else {
            botBrain.past.fill(0);
            botBrain.future.fill(0);
        }

        let targetVy = currentVel.y;
        if (pos.y > 1.5) {
            targetVy = THREE.MathUtils.lerp(targetVy, -5.0, 0.2); // bring it down fast
        } else {
            targetVy = -1.0; // slight gravity
        }
        
        const latestVel = rb.current.linvel();
        rb.current.setLinvel({ x: latestVel.x, y: targetVy, z: latestVel.z }, true);

        let nx = pos.x;
        let nz = pos.z;
        let clamped = false;
        
        if (nx > 24.5) { nx = 24.5; clamped = true; }
        if (nx < -24.5) { nx = -24.5; clamped = true; }
        if (nz > 24.5) { nz = 24.5; clamped = true; }
        if (nz < -24.5) { nz = -24.5; clamped = true; }
        
        if (clamped) {
            rb.current.setTranslation({ x: nx, y: pos.y, z: nz }, true);
            const curLin = rb.current.linvel();
            rb.current.setLinvel({ 
                x: (nx === 24.5 || nx === -24.5) ? 0 : curLin.x, 
                y: curLin.y, 
                z: (nz === 24.5 || nz === -24.5) ? 0 : curLin.z 
            }, true);
        }

        if (pos.y < -2 || pos.y > 20) {
            rb.current.setTranslation({x: 0, y: 5, z: -5}, true);
            rb.current.setLinvel({x: 0, y: 0, z: 0}, true);
        }
    });

    const getPstFut = () => botBrain;

    return (
        <>
            <RigidBody ref={rb} position={[0, 1.5, -5]} colliders="cuboid" enabledRotations={[false, true, false]} linearDamping={2.0}>
                <Box args={[1, 2, 1]} castShadow>
                    <meshStandardMaterial color="red" />
                </Box>
            </RigidBody>
            <OrbiterSwarm key={`swarm-e-${bladeCount}`} playerRb={rb} getPstFut={getPstFut} baseColor={0.0} bladeCount={bladeCount} />
        </>
    );
};

// Remote Player avatar driven by MultiplayerService
const RemotePlayer = ({ id, pState, bladeCount = 28 }: { id: string, pState: any, bladeCount?: number }) => {
    const rb = useRef<RapierRigidBody>(null);
    const botBrain = useRef({
        past: new Float32Array(128).fill(0),
        future: new Float32Array(128).fill(0)
    }).current;
    
    let seed = 0;
    for(let i=0; i<id.length; i++) seed += id.charCodeAt(i);
    
    useFrame((state, delta) => {
        if (!rb.current) return;
        const currentPos = rb.current.translation();
        const currentRot = rb.current.rotation();
        
        const targetPos = new THREE.Vector3(...pState.position);
        const targetRot = new THREE.Quaternion(...pState.rotation);
        
        const newPos = new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z).lerp(targetPos, 0.2);
        const newRot = new THREE.Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w).slerp(targetRot, 0.2);
        
        rb.current.setTranslation({ x: newPos.x, y: newPos.y, z: newPos.z }, true);
        rb.current.setRotation({ x: newRot.x, y: newRot.y, z: newRot.z, w: newRot.w }, true);
        
        const time = state.clock.getElapsedTime();
        for (let i = 0; i < 28; i++) {
            botBrain.past[i] = Math.sin(time * 1.5 + i + seed) * 0.4;
            botBrain.future[i] = Math.cos(time * 2.5 + i + seed) * 0.4;
        }
    });

    const getPstFut = () => botBrain;

    return (
        <>
            <RigidBody ref={rb} type="kinematicPosition" position={[0, 1.5, -5]} colliders="cuboid">
                <Box args={[1, 2, 1]} castShadow>
                    <meshStandardMaterial color={pState.color || "hotpink"} />
                </Box>
            </RigidBody>
            <OrbiterSwarm key={`swarm-r-${bladeCount}`} playerRb={rb} getPstFut={getPstFut} baseColor={0.8} bladeCount={bladeCount} />
        </>
    );
}

const Debris = () => {
    // Generate some random coordinates for debris
    const crates = useMemo(() => Array(30).fill(0).map(() => ({
        x: (Math.random() - 0.5) * 40,
        y: Math.random() * 5 + 1,
        z: (Math.random() - 0.5) * 40,
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI,
        rotZ: Math.random() * Math.PI,
        scale: Math.random() * 1.5 + 1.0
    })), []);

    return (
        <group>
            {crates.map((c, i) => (
                <RigidBody key={i} colliders="cuboid" mass={0.5} position={[c.x, c.y, c.z]} rotation={[c.rotX, c.rotY, c.rotZ]}>
                    <Box args={[c.scale, c.scale, c.scale]} castShadow receiveShadow>
                        <meshStandardMaterial color="#8B4513" roughness={0.9} />
                    </Box>
                </RigidBody>
            ))}
        </group>
    );
};

export function RobotArenaScene({driftRef, currentPosRef, mode1Refs, mode2Refs, movementAxes, viewMode, controlMode = 'Classic', controlBlend = 0.0, moveSensitivity = 0.05, zoomLevel = 80, movementInput = 'BLE', bladesInput = 'BLE', bladeCount = 28, isActive = true, audioEngine, showIntentArrow = false}: RobotArenaProps) {
    const [remotePlayers, setRemotePlayers] = useState<any[]>([]);

    useEffect(() => {
        const mp = MultiplayerService.getInstance();
        const interval = setInterval(() => {
            if (mp.remoteStates.size > 0) {
                setRemotePlayers(Array.from(mp.remoteStates.entries()));
            } else {
                setRemotePlayers([]);
            }
        }, 100);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-full h-full absolute inset-0 z-0">
            <Canvas frameloop={isActive ? 'always' : 'demand'} shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 5, 10], fov: 50 }} gl={{ preserveDrawingBuffer: true }}>
                <XR store={xrStore}>
                    <Sky sunPosition={[10, 20, 10]} />
                    <ambientLight intensity={0.3} />
                <directionalLight castShadow position={[10, 20, 10]} intensity={1.5} shadow-mapSize={[1024, 1024]} />
                
                <Physics>
                    <RobotAvatar driftRef={driftRef} currentPosRef={currentPosRef} mode1Refs={mode1Refs} mode2Refs={mode2Refs} movementAxes={movementAxes} viewMode={viewMode} controlMode={controlMode} controlBlend={controlBlend} moveSensitivity={moveSensitivity} zoomLevel={zoomLevel} movementInput={movementInput} bladesInput={bladesInput} bladeCount={bladeCount} audioEngine={audioEngine} showIntentArrow={showIntentArrow} />
                    
                    {remotePlayers.length > 0 ? (
                        remotePlayers.map(([id, pState]) => (
                            <RemotePlayer key={id} id={id} pState={pState} bladeCount={bladeCount} />
                        ))
                    ) : (
                        <EnemyBot bladeCount={bladeCount} />
                    )}

                    <Debris />
                    
                    {/* Ground */}
                    <RigidBody type="fixed" position={[0, -0.5, 0]}>
                        <Box args={[50, 1, 50]} receiveShadow>
                            <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
                        </Box>
                    </RigidBody>

                    {/* Invisible Arena Walls */}
                    <RigidBody type="fixed" position={[0, 5, -25]}>
                        <Box args={[50, 10, 1]} visible={false} />
                    </RigidBody>
                    <RigidBody type="fixed" position={[0, 5, 25]}>
                        <Box args={[50, 10, 1]} visible={false} />
                    </RigidBody>
                    <RigidBody type="fixed" position={[-25, 5, 0]}>
                        <Box args={[1, 10, 50]} visible={false} />
                    </RigidBody>
                    <RigidBody type="fixed" position={[25, 5, 0]}>
                        <Box args={[1, 10, 50]} visible={false} />
                    </RigidBody>
                </Physics>
                <Grid args={[50, 50]} cellColor="gray" sectionColor="white" />
                </XR>
            </Canvas>
        </div>
    );
}
