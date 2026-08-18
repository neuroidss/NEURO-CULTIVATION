import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Physics, RigidBody, RapierRigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { InputService } from '../lib/InputService';
import { BleService } from '../lib/BleService';

function Bin({ position, color, onScore }: { position: [number, number, number], color: string, onScore: () => void }) {
    const scoredItems = useRef<Set<number>>(new Set());

    return (
        <group position={position}>
            {/* Base pad */}
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI/2, 0, 0]}>
                <planeGeometry args={[4, 4]} />
                <meshStandardMaterial color={color} transparent opacity={0.2} />
            </mesh>
            
            {/* Walls */}
            <RigidBody type="fixed" colliders="cuboid" position={[0, 0.5, 2]}>
                <mesh><boxGeometry args={[4, 1, 0.2]}/><meshStandardMaterial color={color} transparent opacity={0.6} depthWrite={false}/></mesh>
            </RigidBody>
            <RigidBody type="fixed" colliders="cuboid" position={[0, 0.5, -2]}>
                <mesh><boxGeometry args={[4, 1, 0.2]}/><meshStandardMaterial color={color} transparent opacity={0.6} depthWrite={false}/></mesh>
            </RigidBody>
            <RigidBody type="fixed" colliders="cuboid" position={[2, 0.5, 0]}>
                <mesh><boxGeometry args={[0.2, 1, 4]}/><meshStandardMaterial color={color} transparent opacity={0.6} depthWrite={false}/></mesh>
            </RigidBody>
            <RigidBody type="fixed" colliders="cuboid" position={[-2, 0.5, 0]}>
                <mesh><boxGeometry args={[0.2, 1, 4]}/><meshStandardMaterial color={color} transparent opacity={0.6} depthWrite={false}/></mesh>
            </RigidBody>

            <CuboidCollider 
                args={[1.8, 1.0, 1.8]} 
                position={[0, 1.0, 0]} 
                sensor
                onIntersectionEnter={({ other }) => {
                    const id = other.colliderObject?.id;
                    if (other.rigidBodyObject?.name === color && id && !scoredItems.current.has(id)) {
                        scoredItems.current.add(id);
                        onScore();
                    }
                }}
            />
        </group>
    );
}

export default function RoboArmScene({ 
    moveSensitivity = 1, 
    zoomLevel = 80, 
    showUI = true,
    controlMode = 'Arcade (IK)',
    autoGrab = true,
    cameraView = 'Gripper FPV'
}: { 
    moveSensitivity?: number, 
    zoomLevel?: number, 
    showUI?: boolean,
    controlMode?: 'Arcade (IK)' | 'Joint (Manual)',
    autoGrab?: boolean,
    cameraView?: 'World' | 'Gripper FPV'
}) {
    const { camera } = useThree();
    const [score, setScore] = React.useState(0);

    useEffect(() => {
        // Adjust FOV based on zoom factor
        if (camera && 'fov' in camera) {
            camera.fov = 60 / (zoomLevel / 80);
            camera.updateProjectionMatrix();
        }
    }, [zoomLevel, camera]);

    // Refs for hierarchy
    const j1Ref = useRef<THREE.Group>(null);
    const j2Ref = useRef<THREE.Group>(null);
    const j3Ref = useRef<THREE.Group>(null);
    const j4Ref = useRef<THREE.Group>(null);
    const j5Ref = useRef<THREE.Group>(null);
    
    // Refs for meshes (kinematic sync points)
    const link1Mesh = useRef<THREE.Mesh>(null);
    const link2Mesh = useRef<THREE.Mesh>(null);
    const link3Mesh = useRef<THREE.Mesh>(null);
    const link4Mesh = useRef<THREE.Mesh>(null);
    const link5Mesh = useRef<THREE.Mesh>(null);
    const fingerLeftMesh = useRef<THREE.Mesh>(null);
    const fingerRightMesh = useRef<THREE.Mesh>(null);

    // Refs for RigidBodies
    const l1Rb = useRef<RapierRigidBody>(null);
    const l2Rb = useRef<RapierRigidBody>(null);
    const l3Rb = useRef<RapierRigidBody>(null);
    const l4Rb = useRef<RapierRigidBody>(null);
    const l5Rb = useRef<RapierRigidBody>(null);
    const fLRb = useRef<RapierRigidBody>(null);
    const fRRb = useRef<RapierRigidBody>(null);

    // State angles
    const stateList = useRef({
        bYaw: 0,
        sPitch: Math.PI / 6,
        ePitch: -Math.PI / 2,
        wPitch: -Math.PI / 4,
        wRoll: 0,
        gripperW: 1.5
    });

    const vPos = new THREE.Vector3();
    const vQuat = new THREE.Quaternion();

    const AXIS_NAMES = ["Base Yaw", "Shoulder Pitch", "Elbow Pitch", "Wrist Pitch", "Wrist Roll", "Gripper"];
    const [mappingReport, setMappingReport] = React.useState<{id: string, roles: string[]}[]>([]);

    const rb1 = useRef<RapierRigidBody>(null);
    const rb2 = useRef<RapierRigidBody>(null);
    const rb3 = useRef<RapierRigidBody>(null);
    const rb4 = useRef<RapierRigidBody>(null);

    const ikTarget = useRef({
        x: 0,
        y: 2,
        z: 7,
        gripperW: 1.5,
        wRoll: 0
    });
    
    const autoGrabState = useRef<'find' | 'dip' | 'grab' | 'lift' | 'holding' | 'drop'>('find');
    const sequenceTimer = useRef(0);
    const intentArrowRef = useRef<THREE.Group>(null);

    useFrame((state, dtRaw) => {
        const dt = Math.min(0.05, dtRaw); // Prevent physics explosions on lag spikes
        const input = InputService.getInstance();
        const s = stateList.current;
        const speed = 1.5 * dt;

        // Dynamic Multi-Device Handling
        const inputDevices = input.getActiveDevices();
        const ble = BleService.getInstance();
        let devices = [...inputDevices];

        // Inject BLE devices dynamically
        if (ble.isConnected) {
            for (let i = 0; i < ble.devices.length; i++) {
                let da = ble.deviceAxes[i];
                if (da) {
                    let ax0 = da.vx, ax1 = da.vy, ax2 = da.tq;
                    if (i === 0) { // Main device uses controlMode logic
                        const cMode = input.useSensors ? 'Sweep' : 'Classic';
                        let sweepX = ble.sweep_vx / 24.0;
                        let sweepY = ble.sweep_vy / 24.0;
                        let sweepTq = ble.sweep_tq / 24.0;
                        let mot_mag = Math.sqrt(ble.target_vx**2 + ble.target_vy**2);
                        let sweep_mag = Math.sqrt(sweepX**2 + sweepY**2);
                        
                        if (sweep_mag > 0.05) {
                            ax0 = sweepX; ax1 = sweepY; ax2 = sweepTq;
                            if (intentArrowRef.current && j5Ref.current) {
                                intentArrowRef.current.visible = true;
                                
                                // Exactly mirror the arcade IK movement logic
                                const camEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
                                const camYaw = new THREE.Euler(0, camEuler.y, 0, 'YXZ');
                                
                                const forwardVec = new THREE.Vector3(0, 0, -1).applyEuler(camYaw);
                                const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(camYaw);

                                const fwdX = forwardVec.x, fwdZ = forwardVec.z;
                                const rightX = rightVec.x, rightZ = rightVec.z;

                                const mvX = sweepX; 
                                const mvZ = -sweepY; // Same inversion as IK movement
                                
                                // INVERT BOTH AXES based on user feedback.
                                // We negate both right and forward calculations here, effectively flipping it 180 degrees
                                // because the Arrow's internal geometry points towards -Z, while lookAt targets +Z.
                                const dirVector = new THREE.Vector3(
                                    -(rightX * mvX + fwdX * mvZ),
                                    0,
                                    -(rightZ * mvX + fwdZ * mvZ)
                                ).normalize();
                                
                                const gripperPos = new THREE.Vector3();
                                j5Ref.current.getWorldPosition(gripperPos);
                                
                                // Hover further below the physical gripper (-3.0 instead of -0.8) so it's always visible in default zoom
                                intentArrowRef.current.position.set(gripperPos.x, gripperPos.y - 3.0, gripperPos.z);
                                
                                intentArrowRef.current.lookAt(
                                    gripperPos.x + dirVector.x,
                                    gripperPos.y - 3.0,
                                    gripperPos.z + dirVector.z
                                );
                                
                                const arrowMesh1 = intentArrowRef.current.children[0] as THREE.Mesh;
                                const arrowMesh2 = intentArrowRef.current.children[1] as THREE.Mesh;
                                if (arrowMesh1?.material) (arrowMesh1.material as THREE.MeshBasicMaterial).opacity = Math.min(0.8, sweep_mag);
                                if (arrowMesh2?.material) (arrowMesh2.material as THREE.MeshBasicMaterial).opacity = Math.min(0.6, sweep_mag * 0.8);
                            }
                        } else {
                            ax0 = ble.target_vx; ax1 = ble.target_vy; ax2 = ble.target_tq;
                            if (intentArrowRef.current) intentArrowRef.current.visible = false;
                        }
                    }
                    devices.unshift({ // Prioritize neuro headsets
                        id: `Neuro Headset (BLE) ${i+1}`,
                        axes: [ax0, ax1, ax2]
                    });
                }
            }
        }
        
        let armDeltas = [0, 0, 0, 0, 0, 0];
        let newMapping: {id: string, roles: string[]}[] = [];
        
        if (devices.length > 0) {
            if (input.multiDeviceMode === 'average' || input.multiDeviceMode === 'max' || input.multiDeviceMode === 'primary') {
                if (input.multiDeviceMode === 'primary') {
                    let dev = devices[0];
                    newMapping[0] = { id: dev.id, roles: [] };
                    for (let p = 0; p < 6; p++) {
                        let rawVal = dev.axes[p] || 0;
                        if (Math.abs(rawVal) > 0.05) armDeltas[p] = rawVal;
                        if (p < dev.axes.length) newMapping[0].roles.push(`Axis ${p} -> ${AXIS_NAMES[p]} (Primary)`);
                    }
                } else if (input.multiDeviceMode === 'average') {
                    let counts = new Array(6).fill(0);
                    for (let devIdx = 0; devIdx < devices.length; devIdx++) {
                        let dev = devices[devIdx];
                        if (!newMapping[devIdx]) newMapping[devIdx] = { id: dev.id, roles: [] };
                        for (let p = 0; p < 6; p++) {
                            let rawVal = dev.axes[p] || 0;
                            if (Math.abs(rawVal) > 0.05) {
                                armDeltas[p] += rawVal;
                                counts[p]++;
                            }
                            if (p < dev.axes.length) newMapping[devIdx].roles.push(`Axis ${p} -> ${AXIS_NAMES[p]} (Avg)`);
                        }
                    }
                    for (let p = 0; p < 6; p++) {
                        if (counts[p] > 0) armDeltas[p] /= counts[p];
                    }
                } else if (input.multiDeviceMode === 'max') {
                    for (let devIdx = 0; devIdx < devices.length; devIdx++) {
                        let dev = devices[devIdx];
                        if (!newMapping[devIdx]) newMapping[devIdx] = { id: dev.id, roles: [] };
                        for (let p = 0; p < 6; p++) {
                            let rawVal = dev.axes[p] || 0;
                            if (Math.abs(rawVal) > 0.05 && Math.abs(rawVal) > Math.abs(armDeltas[p])) {
                                armDeltas[p] = rawVal;
                            }
                            if (p < dev.axes.length) newMapping[devIdx].roles.push(`Axis ${p} -> ${AXIS_NAMES[p]} (Max)`);
                        }
                    }
                }
                
                for (let p = 0; p < 6; p++) {
                    armDeltas[p] = Math.max(-1.0, Math.min(1.0, armDeltas[p]));
                }
            } else {
                let paramsPerDevice = Math.ceil(6 / devices.length);
                let devIdx = 0;
                let axisIdx = 0;
                
                for (let p=0; p<6; p++) {
                     if (devIdx >= devices.length) break;
                     let dev = devices[devIdx];
                     
                     // Apply deadzone or smooth curve
                     let rawVal = dev.axes[axisIdx] || 0;
                     if (Math.abs(rawVal) < 0.05) rawVal = 0; 
                     armDeltas[p] = rawVal;
                     
                     if (!newMapping[devIdx]) newMapping[devIdx] = { id: dev.id, roles: [] };
                     newMapping[devIdx].roles.push(`Axis ${axisIdx} -> ${AXIS_NAMES[p]}`);
                     
                     axisIdx++;
                     if (axisIdx >= dev.axes.length || axisIdx >= paramsPerDevice) {
                         devIdx++;
                         axisIdx = 0;
                     }
                }
            }
        }
        
        // Update UI max twice a second to avoid React re-render lag inside useFrame
        if (state.clock.elapsedTime % 0.5 < dt) {
            setMappingReport(newMapping);
        }

        // Apply mapped axes
        if (controlMode === 'Joint (Manual)') {
            const manualSpeed = speed * (moveSensitivity * 20);
            s.bYaw   += -armDeltas[0] * manualSpeed; // Base Yaw
            s.sPitch += armDeltas[1] * manualSpeed;  // Shoulder Pitch
            s.ePitch += armDeltas[2] * manualSpeed;  // Elbow Pitch
            s.wPitch += armDeltas[3] * manualSpeed;  // Wrist Pitch
            s.wRoll  += armDeltas[4] * manualSpeed;  // Wrist Roll
            s.gripperW += armDeltas[5] * manualSpeed * 2; // Gripper
            
            s.sPitch = Math.max(-Math.PI*0.1, Math.min(Math.PI*0.5, s.sPitch)); 
            s.ePitch = Math.max(-Math.PI*0.8, Math.min(Math.PI*0.8, s.ePitch));
            s.wPitch = Math.max(-Math.PI*0.8, Math.min(Math.PI*0.8, s.wPitch));
            s.gripperW = Math.max(0.3, Math.min(2.0, s.gripperW));
        } else {
            // Arcade (IK) Mode
            const tgt = ikTarget.current;
            const ikSpeed = speed * (moveSensitivity * 20) * 2;

            // Determine orientation-based movement vectors
            const camEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
            const camYaw = new THREE.Euler(0, camEuler.y, 0, 'YXZ');
            
            const forwardVec = new THREE.Vector3(0, 0, -1).applyEuler(camYaw);
            const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(camYaw);

            let fwdX = forwardVec.x, fwdZ = forwardVec.z;
            let rightX = rightVec.x, rightZ = rightVec.z;

            // X / Y (forward/back) mapping to local screen coordinates
            const mvX = armDeltas[0] * ikSpeed; // Strafe
            const mvZ = -armDeltas[1] * ikSpeed; // Forward/Back (Inverted once per user request. DO NOT CHANGE THIS AGAIN!)
            tgt.x += rightX * mvX + fwdX * mvZ;
            tgt.z += rightZ * mvX + fwdZ * mvZ;
            
            tgt.wRoll += armDeltas[2] * speed * 3; // RX -> Rotate Gripper left/right
            tgt.wRoll += armDeltas[4] * speed; // Allow triggers to also rotate gripper

            if (autoGrab) {
                const allRbs = [rb1, rb2, rb3, rb4];
                let nearestCube: { dSq: number, pos: THREE.Vector3 } | null = null;
                let anyCubeHeld = false;
                for(let i=0; i<4; i++) {
                    const rb = allRbs[i].current;
                    if (rb) {
                        const pos = rb.translation();
                        if (pos.y > 1.5) anyCubeHeld = true; // If a cube is lifted above floor
                        const dx = tgt.x - pos.x;
                        const dz = tgt.z - pos.z;
                        const dSq = dx*dx + dz*dz;
                        if (dSq < 2.0 && (!nearestCube || dSq < nearestCube.dSq)) {
                            nearestCube = { dSq, pos: new THREE.Vector3(pos.x, pos.y, pos.z) };
                        }
                    }
                }

                const overCube = nearestCube && nearestCube.dSq < 0.5 && nearestCube.pos.y > -2 && nearestCube.pos.y < 2;
                const onBin1 = tgt.x < -3 && tgt.z > 5 && tgt.z < 9;
                const onBin2 = tgt.x > 3  && tgt.z > 5 && tgt.z < 9;
                const overBin = onBin1 || onBin2;

                const st = autoGrabState.current;
                
                if (st === 'find') {
                    tgt.gripperW = THREE.MathUtils.lerp(tgt.gripperW, 2.0, speed * 2);
                    tgt.y = THREE.MathUtils.lerp(tgt.y, 4, speed); // Keep high
                    if (overCube) {
                        autoGrabState.current = 'dip';
                    }
                } else if (st === 'dip') {
                    tgt.y = THREE.MathUtils.lerp(tgt.y, -2.5, speed * 3); // Go down
                    if (tgt.y < -1.8) {
                        autoGrabState.current = 'grab';
                        sequenceTimer.current = 0;
                    }
                } else if (st === 'grab') {
                    // Cube width is 1.0. Finger width is 0.2 (halfExtent 0.1).
                    // Center of finger is at +/- gripperW. Inner face is at +/- (gripperW - 0.1).
                    // Gap = 2 * gripperW - 0.2.
                    // For a gap of 0.9 (pinching a 1.0 cube), 2 * gripperW = 1.1 => gripperW = 0.55.
                    tgt.gripperW = THREE.MathUtils.lerp(tgt.gripperW, 0.55, speed * 4); 
                    sequenceTimer.current += dtRaw;
                    if (sequenceTimer.current > 0.5) autoGrabState.current = 'lift';
                } else if (st === 'lift') {
                    tgt.gripperW = 0.55; // Keep closed
                    tgt.y = THREE.MathUtils.lerp(tgt.y, 4, speed * 2);
                    if (tgt.y > 3) {
                        if (anyCubeHeld) {
                            autoGrabState.current = 'holding';
                        } else {
                            autoGrabState.current = 'find'; // We missed, try again
                        }
                    }
                } else if (st === 'holding') {
                    tgt.gripperW = 0.55;
                    tgt.y = THREE.MathUtils.lerp(tgt.y, 4, speed);
                    if (!anyCubeHeld) {
                        autoGrabState.current = 'find'; // Dropped it by accident
                    } else if (overBin) {
                        autoGrabState.current = 'drop';
                        sequenceTimer.current = 0;
                    }
                } else if (st === 'drop') {
                    tgt.gripperW = THREE.MathUtils.lerp(tgt.gripperW, 2.0, speed * 4); // Open
                    sequenceTimer.current += dtRaw;
                    if (sequenceTimer.current > 0.5) autoGrabState.current = 'find';
                }
            } else {
                if (Math.abs(armDeltas[3]) > 0.05) {
                    tgt.y -= armDeltas[3] * ikSpeed; // RY -> Up/Down
                }
                tgt.gripperW += armDeltas[5] * speed * 2;
            }

            tgt.x = Math.max(-10, Math.min(10, tgt.x));
            tgt.z = Math.max(1, Math.min(15, tgt.z)); // Don't crash into self
            tgt.y = Math.max(-3, Math.min(12, tgt.y)); // Allow getting lower to touch floor
            tgt.gripperW = Math.max(0.3, Math.min(2.0, tgt.gripperW));

            // Solve simple 2-bone IK
            const rTarget = Math.sqrt(tgt.x * tgt.x + tgt.z * tgt.z);
            s.bYaw = Math.atan2(tgt.x, tgt.z);
            s.gripperW = tgt.gripperW;

            // Height relative to shoulder (j2 is at Y = -2 + 0.5 + 3 = 1.5)
            const j2_y_world = 1.5;
            const d_tip = 3.5; // Estimated wrist to tip distance so gripper reaches the target
            
            let dx = rTarget;
            let dy = (tgt.y + d_tip) - j2_y_world;

            let dist = Math.sqrt(dx*dx + dy*dy);
            const L1 = 6;
            const L2 = 5;

            if (dist > L1 + L2 - 0.01) dist = L1 + L2 - 0.01;

            const phi = Math.atan2(dx, dy); 
            
            let cosBeta = (L1*L1 + dist*dist - L2*L2) / (2 * L1 * dist);
            cosBeta = Math.max(-1, Math.min(1, cosBeta));
            const beta = Math.acos(cosBeta);

            s.sPitch = phi - beta;

            let cosGamma = (L1*L1 + L2*L2 - dist*dist) / (2 * L1 * L2);
            cosGamma = Math.max(-1, Math.min(1, cosGamma));
            const gamma = Math.acos(cosGamma);

            s.ePitch = Math.PI - gamma;
            
            // Keep gripper pointing straight down: total angle = PI
            s.wPitch = Math.PI - (s.sPitch + s.ePitch);
            
            // Counteract base yaw so gripper stays facing consistently relative to world
            s.wRoll = tgt.wRoll + s.bYaw;
        }

        if(j1Ref.current) j1Ref.current.rotation.y = s.bYaw;
        if(j2Ref.current) j2Ref.current.rotation.x = s.sPitch;
        if(j3Ref.current) j3Ref.current.rotation.x = s.ePitch;
        if(j4Ref.current) j4Ref.current.rotation.x = s.wPitch;
        if(j5Ref.current) j5Ref.current.rotation.y = s.wRoll;

        if(fingerLeftMesh.current) fingerLeftMesh.current.position.x = -s.gripperW / 2;
        if(fingerRightMesh.current) fingerRightMesh.current.position.x = s.gripperW / 2;

        if(j1Ref.current) j1Ref.current.updateMatrixWorld(true);

        const sync = (mRef: any, rRef: any) => {
            if(mRef.current && rRef.current) {
                mRef.current.getWorldPosition(vPos);
                mRef.current.getWorldQuaternion(vQuat);
                rRef.current.setNextKinematicTranslation(vPos);
                rRef.current.setNextKinematicRotation(vQuat);
            }
        };

        sync(link1Mesh, l1Rb);
        sync(link2Mesh, l2Rb);
        sync(link3Mesh, l3Rb);
        sync(link4Mesh, l4Rb);
        sync(link5Mesh, l5Rb);
        sync(fingerLeftMesh, fLRb);
        sync(fingerRightMesh, fRRb);

        // Target Camera Mode (After kinematic updates so there's zero 1-frame lag/jitter)
        if (cameraView === 'World') {
            camera.position.lerp(new THREE.Vector3(0, 10, 15), 0.05);
            camera.lookAt(0, 2, 0);
        } else if (cameraView === 'Gripper FPV' && j5Ref.current) {
            const tempPos = new THREE.Vector3();
            const tempQuat = new THREE.Quaternion();
            j5Ref.current.getWorldPosition(tempPos);
            j5Ref.current.getWorldQuaternion(tempQuat);
            
            // Move camera slightly "forward" along the gripper (+Y)
            const offset = new THREE.Vector3(0, 0.5, 0).applyQuaternion(tempQuat);
            const camPos = tempPos.clone().add(offset);
            
            // For perfectly smooth attached FPV (zero lag), use copy rather than lerp.
            camera.position.copy(camPos);
            
            // Look straight out from the wrist (+Y locally)
            const lookPos = camPos.clone().add(new THREE.Vector3(0, 1, 0).applyQuaternion(tempQuat));
            
            // Set camera Up vector to -Z locally, so the view isn't upside down or sideways
            camera.up.set(0, 0, -1).applyQuaternion(tempQuat);
            
            camera.lookAt(lookPos);
        }
    });

    return (
        <>
        <Physics>
            {/* Visual Hierarchy */}
            <group position={[0, -2, 0]}>
                <group ref={j1Ref} position={[0, 0.5, 0]}>
                    <mesh ref={link1Mesh} position={[0, 1.5, 0]} castShadow> 
                        <cylinderGeometry args={[0.8, 0.8, 3, 16]} />
                        <meshStandardMaterial color="#475569" roughness={0.4} metalness={0.6}/>
                    </mesh>
                    
                    <group ref={j2Ref} position={[0, 3, 0]}>
                        <mesh castShadow><sphereGeometry args={[1.0]} /><meshStandardMaterial color="#1e293b"/></mesh>
                        <mesh ref={link2Mesh} position={[0, 3, 0]} castShadow>
                            <boxGeometry args={[0.8, 6, 0.8]} />
                            <meshStandardMaterial color="#3b82f6" roughness={0.5}/>
                        </mesh>
                        
                        <group ref={j3Ref} position={[0, 6, 0]}>
                            <mesh castShadow><sphereGeometry args={[0.8]} /><meshStandardMaterial color="#1e293b"/></mesh>
                            <mesh ref={link3Mesh} position={[0, 2.5, 0]} castShadow>
                                <boxGeometry args={[0.6, 5, 0.6]} />
                                <meshStandardMaterial color="#3b82f6" roughness={0.5}/>
                            </mesh>
                            
                            <group ref={j4Ref} position={[0, 5, 0]}>
                                <mesh castShadow><sphereGeometry args={[0.7]} /><meshStandardMaterial color="#1e293b"/></mesh>
                                <mesh ref={link4Mesh} position={[0, 0.5, 0]} castShadow>
                                    <boxGeometry args={[0.8, 1, 0.8]} />
                                    <meshStandardMaterial color="#1e293b" />
                                </mesh>
                                
                                <group ref={j5Ref} position={[0, 1, 0]}>
                                    <mesh ref={link5Mesh} position={[0, 0.25, 0]} castShadow>
                                        <boxGeometry args={[2.5, 0.5, 1.2]} />
                                        <meshStandardMaterial color="#f59e0b" metalness={0.5} roughness={0.3}/>
                                    </mesh>
                                    
                                    <mesh ref={fingerLeftMesh} position={[-1.0, 1.25, 0]} castShadow>
                                        <boxGeometry args={[0.2, 2.0, 0.8]} />
                                        <meshStandardMaterial color="#ef4444" />
                                    </mesh>
                                    <mesh ref={fingerRightMesh} position={[1.0, 1.25, 0]} castShadow>
                                        <boxGeometry args={[0.2, 2.0, 0.8]} />
                                        <meshStandardMaterial color="#ef4444" />
                                    </mesh>
                                </group>
                            </group>
                        </group>
                    </group>
                </group>
            </group>

            {/* Hidden Kinematic RigidBodies for Collision */}
            {/* CylinderCollider args are [halfHeight, radius] */}
            <RigidBody type="kinematicPosition" ref={l1Rb} friction={0.5} colliders={false}><CylinderCollider args={[1.5, 0.8]} /></RigidBody>
            {/* CuboidCollider args are half-extents */}
            <RigidBody type="kinematicPosition" ref={l2Rb} friction={0.5} colliders={false}><CuboidCollider args={[0.4, 3, 0.4]} /></RigidBody>
            <RigidBody type="kinematicPosition" ref={l3Rb} friction={0.5} colliders={false}><CuboidCollider args={[0.3, 2.5, 0.3]} /></RigidBody>
            <RigidBody type="kinematicPosition" ref={l4Rb} friction={0.5} colliders={false}><CuboidCollider args={[0.4, 0.5, 0.4]} /></RigidBody>
            <RigidBody type="kinematicPosition" ref={l5Rb} friction={0.5} colliders={false}><CuboidCollider args={[1.25, 0.25, 0.6]} /></RigidBody>
            {/* Fingers have high friction to pick up items, and a tiny bottom lip to prevent slipping */}
            <RigidBody type="kinematicPosition" ref={fLRb} friction={4.0} restitution={0.0} colliders={false}>
                <CuboidCollider args={[0.1, 1.0, 0.4]} />
                <CuboidCollider args={[0.15, 0.05, 0.4]} position={[0.15, -0.9, 0]} />
            </RigidBody>
            <RigidBody type="kinematicPosition" ref={fRRb} friction={4.0} restitution={0.0} colliders={false}>
                <CuboidCollider args={[0.1, 1.0, 0.4]} />
                <CuboidCollider args={[0.15, 0.05, 0.4]} position={[-0.15, -0.9, 0]} />
            </RigidBody>
        
            {/* Environment */}
            <RigidBody type="fixed" friction={1.0} position={[0, -2 - 0.5, 5]}>
                <CuboidCollider args={[15, 0.5, 10]} />
                <mesh receiveShadow>
                    <boxGeometry args={[30, 1, 20]} />
                    <meshStandardMaterial color="#2d3748" />
                </mesh>
            </RigidBody>

            <Bin position={[-5, -2, 7]} color="#ef4444" onScore={() => setScore(s => s + 1)} />
            <Bin position={[5, -2, 7]} color="#3b82f6" onScore={() => setScore(s => s + 1)} />

            <group name="SortingObjects">
                <RigidBody ref={rb1} name="#ef4444" position={[-2, 0, 5]} colliders="cuboid" mass={3} friction={4.0} linearDamping={2.0} angularDamping={2.0}>
                    <mesh castShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ef4444" /></mesh>
                </RigidBody>
                <RigidBody ref={rb2} name="#ef4444" position={[2, 0, 6]} colliders="cuboid" mass={3} friction={4.0} linearDamping={2.0} angularDamping={2.0}>
                    <mesh castShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ef4444" /></mesh>
                </RigidBody>
                
                <RigidBody ref={rb3} name="#3b82f6" position={[0, 0, 5]} colliders="cuboid" mass={3} friction={4.0} linearDamping={2.0} angularDamping={2.0}>
                    <mesh castShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#3b82f6" /></mesh>
                </RigidBody>
                <RigidBody ref={rb4} name="#3b82f6" position={[-1, 0, 8]} colliders="cuboid" mass={3} friction={4.0} linearDamping={2.0} angularDamping={2.0}>
                    <mesh castShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#3b82f6" /></mesh>
                </RigidBody>
            </group>

            <group ref={intentArrowRef} visible={false}>
                <mesh position={[0, 0, -1.0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <coneGeometry args={[0.2, 0.6, 4]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.8} depthTest={false} />
                </mesh>
                <mesh position={[0, 0, -0.4]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[0.08, 1.2]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.6} depthTest={false} />
                </mesh>
            </group>
        </Physics>
        
        {/* UI Overlay */}
        {showUI && (
        <Html calculatePosition={() => [0, 0]} style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none' }} zIndexRange={[100, 0]}>
            <div style={{ position: 'absolute', top: '20px', right: '40px', width: '380px', pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
                <div style={{ color: 'white', fontFamily: 'monospace', fontSize: '24px', fontWeight: 'bold', textShadow: '1px 1px 2px black' }}>
                   ROBO-ARM QUEST: SORT BY COLOR <br/>
                   SCORE: {score}/4
                </div>

            <div style={{ color: '#ccc', fontFamily: 'monospace', fontSize: '13px', marginTop: 20, textShadow: '1px 1px 2px black' }}>
               <strong style={{ color: 'white' }}>{controlMode === 'Arcade (IK)' ? 'ARCADE CONTROLS' : 'MANUAL CONTROLS'}</strong><br/>
               {controlMode === 'Arcade (IK)' ? (
                   <>
                       Left Stick: Move X / Z (Strafe / Forward)<br/>
                       Right Stick: Rotate Gripper / Move Up & Down<br/>
                       Bumpers: Open / Close Gripper<br/>
                   </>
               ) : (
                   <>
                       Left Stick: Base Yaw / Shoulder Pitch <br/>
                       Right Stick: Elbow Pitch / Wrist Pitch <br/>
                       Triggers: Wrist Roll <br/>
                       Bumpers: Gripper
                   </>
               )}
            </div>
            
            <div style={{ color: '#ccc', fontFamily: 'monospace', fontSize: '12px', marginTop: 20, textShadow: '1px 1px 2px black', textAlign: 'right' }}>
               <strong style={{ color: 'white' }}>DYNAMIC DEVICE MAPPING REPORT:</strong>
               <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                   {mappingReport.map((dev, ix) => (
                       <div key={ix} style={{ background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '6px', border: '1px solid #444', minWidth: '180px', textAlign: 'left' }}>
                           <div style={{ color: '#6ee7b7', fontWeight: 'bold', marginBottom: '5px', textShadow: 'none' }}>[{ix+1}] {dev.id}</div>
                           {dev.roles.map((r, ri) => <div key={ri} style={{ textShadow: 'none' }}>{r}</div>)}
                       </div>
                   ))}
               </div>
            </div>
        </div>
        </Html>
        )}
        </>
    );
}
