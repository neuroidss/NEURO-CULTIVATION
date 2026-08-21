import React, { useEffect, useRef } from 'react';
import { InputService } from '../lib/InputService';
import { BleService } from '../lib/BleService';
import { Maze } from '../lib/maze';
import { dotProduct } from '../lib/clipHelper';
import { EngineConfig } from '../config/EngineConfig';
import { CultivationEngine } from '../lib/CultivationEngine';

// Add imports at top

interface BrainMazeProps {
    currentPosRef: React.RefObject<Float32Array>;
    driftRef: React.RefObject<Float32Array>;
    mode1Refs: Float32Array[];
    mode2Refs: Float32Array[];
    movementAxes?: Float32Array[];
    viewMode: 'World' | 'ThirdPerson';
    controlMode?: 'Motor' | 'Sweep' | 'Resonance' | 'Classic' | 'Semantic';
    moveSensitivity?: number;
    zoomLevel?: number;
    audioEngine?: any;
    movementInput?: string;
    showIntentArrow?: boolean;
}

export const BrainMazeScene = ({ currentPosRef, driftRef, mode1Refs, mode2Refs, movementAxes, viewMode = 'ThirdPerson', controlMode = 'Classic', moveSensitivity = 0.05, zoomLevel = 80, audioEngine, movementInput = 'BLE', showIntentArrow = false }: BrainMazeProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const reqRef = useRef<number>(0);

    const state = useRef({
        maze: new Maze(11),
        player: { x: 1.5, y: 1.5, angle: 0 },
        ctrl: { moveX: 0, moveY: 0, torque: 0 },
        dashCooldown: 0,
        synapticPersistence: 0
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let lastTime = performance.now();

        const loop = (time: number) => {
            const s = state.current;
            let dt = (time - lastTime) / 1000.0;
            lastTime = time;
            if (dt > 0.1) dt = 0.016;

            const input = InputService.getInstance();
            const ble = BleService.getInstance();
            let intentX = 0, intentY = 0, intentTq = 0;
            let intentDash = 0, intentGhost = 0;
            let focusIntensity = 0;
            let intentAngle = s.player.angle; // default to where player is facing

            if (ble.isConnected) {
                let asymmetry = Math.max(0, ble.futureAxes[0] - ble.pastAxes[0]); // Just a fallback for intensity if needed
                focusIntensity = Math.min(1.0, ble.sweep_mag / 10.0);
                if (ble.sweep_mag > 0.1) {
                    intentAngle = Math.atan2(ble.sweep_vy, ble.sweep_vx);
                    // In ThirdPerson view, the player is rotated by player.angle, but sweep_vx/vy is absolute.
                    // Actually, sweep_vx/vy from BleService are absolute screen coords if electrodes are mapped that way,
                    // but wait, they are mapped to DX/DY in screen space.
                }
            }

            let activeBoost = 1.0;
            let currentPersistence = 0;
            let isLocked = false;
            let coherenceGate = 0;

            if (movementInput === 'BLE' && ble.isConnected) {
                if (controlMode === 'Motor' || controlMode === 'Classic') {
                    intentX = ble.target_vx;
                    intentY = ble.target_vy;
                    intentTq = ble.target_tq;
                    currentPersistence = ble.synapticPersistence;
                } else if (controlMode === 'Sweep' || controlMode === 'Semantic') {
                    // sweep values are internally ~12x larger, so we divide by 24 to normalize
                    intentX = ble.sweep_vx / 24.0;
                    intentY = ble.sweep_vy / 24.0;
                    intentTq = ble.sweep_tq / 24.0;
                    currentPersistence = ble.sweep_persistence;
                } else {
                    // Resonance Lock
                    let mot_mag = Math.sqrt(ble.target_vx**2 + ble.target_vy**2);
                    let sweep_mag = Math.sqrt((ble.sweep_vx/24.0)**2 + (ble.sweep_vy/24.0)**2);
                    let alignment = (ble.target_vx * (ble.sweep_vx/24.0) + ble.target_vy * (ble.sweep_vy/24.0)) / (mot_mag * sweep_mag + 1e-6);
                    coherenceGate = Math.max(0.0, alignment);
                    
                    if (coherenceGate > 0.4) {
                        isLocked = true;
                    }
                    
                    intentX = ble.target_vx * coherenceGate;
                    intentY = ble.target_vy * coherenceGate;
                    intentTq = ble.target_tq * coherenceGate;
                    currentPersistence = (ble.synapticPersistence * 0.5 + ble.sweep_persistence * 0.5) * coherenceGate;
                }
            } else {
                if (controlMode === 'Motor' || controlMode === 'Classic') {
                    intentX = (input.rawAxes[0] || 0) * EngineConfig.Maze.intentMoveMagnitude;
                    intentY = (input.rawAxes[1] || 0) * EngineConfig.Maze.intentMoveMagnitude;
                    intentTq = (input.rawAxes[2] || 0) * EngineConfig.Maze.intentTurnMagnitude;
                    currentPersistence = input.synapticPersistence;
                } else if (controlMode === 'Sweep' || controlMode === 'Semantic') {
                    let isAuto = Math.abs(input.rawAxes[6] || 0) > 0.5 || Math.abs(input.rawAxes[7] || 0) > 0.5;
                    intentX = (isAuto ? (input.rawAxes[0] || 0) : (input.rawAxes[2] || 0)) * EngineConfig.Maze.intentMoveMagnitude;
                    intentY = (isAuto ? (input.rawAxes[1] || 0) : (input.rawAxes[3] || 0)) * EngineConfig.Maze.intentMoveMagnitude;
                    intentTq = 0;
                    currentPersistence = input.synapticPersistence;
                } else {
                    let mot_vx = (input.rawAxes[0] || 0) * EngineConfig.Maze.intentMoveMagnitude;
                    let mot_vy = (input.rawAxes[1] || 0) * EngineConfig.Maze.intentMoveMagnitude;
                    let isAuto = Math.abs(input.rawAxes[6] || 0) > 0.5 || Math.abs(input.rawAxes[7] || 0) > 0.5;
                    let sw_vx = (isAuto ? mot_vx : (input.rawAxes[2] || 0) * EngineConfig.Maze.intentMoveMagnitude);
                    let sw_vy = (isAuto ? mot_vy : (input.rawAxes[3] || 0) * EngineConfig.Maze.intentMoveMagnitude);
                    
                    let mot_mag = Math.sqrt(mot_vx**2 + mot_vy**2);
                    let sweep_mag = Math.sqrt(sw_vx**2 + sw_vy**2);
                    let alignment = (mot_vx * sw_vx + mot_vy * sw_vy) / (mot_mag * sweep_mag + 1e-6);
                    coherenceGate = Math.max(0.0, alignment);
                    
                    if (coherenceGate > 0.4) {
                        isLocked = true;
                    }
                    intentX = mot_vx * coherenceGate;
                    intentY = mot_vy * coherenceGate;
                    intentTq = (input.rawAxes[2] || 0) * EngineConfig.Maze.intentTurnMagnitude * coherenceGate;
                    currentPersistence = input.synapticPersistence * coherenceGate;
                }
            }

            activeBoost = (1.0 + currentPersistence * 4.0) * (controlMode === 'Resonance' ? (1.0 + coherenceGate * 0.8) : 1.0);

            const skillLevel = moveSensitivity;
            const smooth = 0.98 - (skillLevel * 0.1);
            const gain = skillLevel * EngineConfig.Maze.intentGain;

            s.ctrl.moveX = s.ctrl.moveX * smooth + intentX * gain * (1 - smooth);
            s.ctrl.moveY = s.ctrl.moveY * smooth + intentY * gain * (1 - smooth);
            s.ctrl.torque = s.ctrl.torque * smooth + intentTq * gain * 0.5 * (1 - smooth);

            let rawDx = 0;
            let rawDy = 0;

            if (viewMode === 'World') {
                rawDx = s.ctrl.moveX * EngineConfig.Maze.strafeSpeedScale * activeBoost;
                rawDy = s.ctrl.moveY * EngineConfig.Maze.forwardSpeedScale * activeBoost;
                
                // Pure decoupled rotation (Theta-Gamma Sagitta)
                s.player.angle += s.ctrl.torque * activeBoost * 0.5;
            } else {
                s.player.angle += s.ctrl.torque * activeBoost * 0.5;
                
                let forwardSpeed = -s.ctrl.moveY * EngineConfig.Maze.forwardSpeedScale * activeBoost;
                let strafeSpeed = s.ctrl.moveX * EngineConfig.Maze.strafeSpeedScale * activeBoost;

                rawDx = Math.sin(s.player.angle) * forwardSpeed + Math.cos(s.player.angle) * strafeSpeed;
                rawDy = -Math.cos(s.player.angle) * forwardSpeed + Math.sin(s.player.angle) * strafeSpeed;
            }

            if (Math.abs(intentDash) > 0.5 && s.dashCooldown <= 0) {
                 s.dashCooldown = 60; // Huge burst
            }

            const MAX_SPEED = EngineConfig.Maze.maxSpeed * (s.dashCooldown > 45 ? 5.0 : 1.0);
            let intendedMove = Math.sqrt(rawDx*rawDx + rawDy*rawDy);
            let targetDx = rawDx, targetDy = rawDy;
            if (intendedMove > MAX_SPEED) {
                targetDx = (rawDx / intendedMove) * MAX_SPEED;
                targetDy = (rawDy / intendedMove) * MAX_SPEED;
            }

            const isGhosting = Math.abs(intentGhost) > 0.5;

            const hit = (tx: number, ty: number) => {
                if (isGhosting) return false; // Feigenbaum phase-shift enabled!
                let gx = Math.floor(tx), gy = Math.floor(ty);
                if(gy<0||gy>=s.maze.dim||gx<0||gx>=s.maze.dim) return true;
                return s.maze.grid[gy][gx] === 1;
            };

            let steps = Math.ceil(Math.max(Math.abs(targetDx), Math.abs(targetDy)) / 0.05);
            if (steps < 1) steps = 1;
            
            let sdx = targetDx / steps;
            let sdy = targetDy / steps;

            for(let i=0; i<steps; i++) {
                if(!hit(s.player.x + sdx + Math.sign(sdx)*0.2, s.player.y)) s.player.x += sdx; 
                if(!hit(s.player.x, s.player.y + sdy + Math.sign(sdy)*0.2)) s.player.y += sdy; 
            }

            if (audioEngine) {
                audioEngine.updateMazeSonar(s.player, s.maze, focusIntensity, activeBoost, intentAngle, targetDx, targetDy);
            }

            if (s.dashCooldown > 0) s.dashCooldown--;

            // TELEKINESIS FOR CHESTS AND ORBS
            for (let chest of s.maze.chests) {
                if (chest.state === 'looted') continue;
                let dx = chest.x - s.player.x;
                let dy = chest.y - s.player.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 0.5) {
                    chest.state = 'looted'; // looted!
                    continue;
                }

                chest.isTargeted = false;
                if (dist < 3.0 && chest.state === 'closed') {
                    let chest_abs_angle = Math.atan2(dy, dx);
                    // Account for player rotation, where "up" is -PI/2 in screen space but wait: player.angle rotates world. 
                    let intent_world_angle = s.player.angle - Math.PI/2 + intentAngle; 
                    let focus_diff = Math.atan2(Math.sin(chest_abs_angle - intent_world_angle), Math.cos(chest_abs_angle - intent_world_angle));
                    let cone_angle = Math.PI / 4; 

                    if (focusIntensity > 0.3 && Math.abs(focus_diff) < cone_angle) {
                        chest.isTargeted = true;
                        chest.scanProgress += (focusIntensity - 0.3) * 0.05;
                        if (chest.scanProgress >= 1.0) {
                            chest.state = 'revealed';
                        }
                    } else {
                        if (chest.scanProgress > 0) chest.scanProgress -= 0.01;
                    }
                }
            }

            for (let orb of s.maze.orbs) {
                if (orb.collected) continue;
                let dx = orb.x - s.player.x;
                let dy = orb.y - s.player.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 0.5) {
                    orb.collected = true; // Looted!
                    continue;
                }

                let orb_abs_angle = Math.atan2(dy, dx);
                let intent_world_angle = s.player.angle - Math.PI/2 + intentAngle;
                let focus_diff = Math.atan2(Math.sin(orb_abs_angle - intent_world_angle), Math.cos(orb_abs_angle - intent_world_angle));

                orb.isTargeted = false;
                let cone_angle = Math.PI / 4; 

                if (dist < 4.0 && focusIntensity > 0.3 && Math.abs(focus_diff) < cone_angle) {
                    orb.isTargeted = true;
                    let pullForce = (focusIntensity - 0.3) * 0.15;
                    orb.x -= (dx / dist) * pullForce; 
                    orb.y -= (dy / dist) * pullForce;
                }
            }

            // Draw
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const cellSize = zoomLevel * 0.5;
            ctx.save();
            if (viewMode === 'ThirdPerson') {
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate(-s.player.angle);
                ctx.translate(-s.player.x * cellSize, -s.player.y * cellSize);
            } else {
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.translate(-(s.maze.dim / 2) * cellSize, -(s.maze.dim / 2) * cellSize);
            }

            // Задаем глубокий контрастный фон коридоров (темный космо-синий вместо серого)
            ctx.fillStyle = '#03050a';
            ctx.fillRect(-cellSize, -cellSize, (s.maze.dim + 2) * cellSize, (s.maze.dim + 2) * cellSize);

            // Получаем текущую ментальную стойкость (persistence) для свечения стен
            const persistenceVal = ble.isConnected ? ble.synapticPersistence : input.synapticPersistence;

            for (let r = 0; r < s.maze.dim; r++) {
                for (let c = 0; c < s.maze.dim; c++) {
                    if (s.maze.grid[r][c] === 1) {
                        // Динамическое свечение стен: от глубокого синего до яркой неоновой бирюзы
                        let g = Math.floor(40 + persistenceVal * 110);  // диапазон яркости зеленого 40 -> 150
                        let b = Math.floor(70 + persistenceVal * 120);  // диапазон яркости синего 70 -> 190
                        ctx.fillStyle = `rgb(10, ${g}, ${b})`;
                        ctx.fillRect(c * cellSize, r * cellSize, cellSize + 1, cellSize + 1);
                        
                        // Светящаяся рамка вокруг каждого блока стены (бирюзовый неон)
                        ctx.strokeStyle = `rgba(34, 211, 238, ${0.15 + persistenceVal * 0.6})`; 
                        ctx.lineWidth = 1.5;
                        ctx.strokeRect(c * cellSize, r * cellSize, cellSize, cellSize);
                    } else if (s.maze.grid[r][c] === 2) {
                        // Светящаяся финишная точка (выход из лабиринта) — сочный зеленый
                        ctx.fillStyle = '#00ff66';
                        ctx.shadowColor = '#00ff66';
                        ctx.shadowBlur = 20; // Эффект свечения вокруг сферы
                        ctx.beginPath();
                        ctx.arc(c * cellSize + cellSize / 2, r * cellSize + cellSize / 2, cellSize / 3, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.shadowBlur = 0; // Обязательно сбрасываем тень, чтобы не тормозил рендер
                    }
                }
            }

            for (let chest of s.maze.chests) {
                if (chest.state === 'looted') continue;
                let cx = chest.x * cellSize;
                let cy = chest.y * cellSize;
                let cSize = cellSize * 0.4;
                
                if (chest.isTargeted) {
                    ctx.strokeStyle = '#f0f';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(s.player.x * cellSize, s.player.y * cellSize);
                    ctx.lineTo(cx, cy);
                    ctx.stroke();
                }

                if (chest.state === 'closed') {
                    ctx.fillStyle = '#ffd700';
                    ctx.shadowColor = '#ffd700';
                    ctx.shadowBlur = chest.isTargeted ? 20 : 5;
                    ctx.fillRect(cx - cSize/2, cy - cSize/2, cSize, cSize);
                    ctx.shadowBlur = 0;
                    
                    if (chest.scanProgress > 0) {
                        ctx.strokeStyle = '#0ff';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.arc(cx, cy, cSize, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * chest.scanProgress));
                        ctx.stroke();
                    }
                } else if (chest.state === 'revealed') {
                    if (chest.isMimic) {
                        ctx.fillStyle = '#f00';
                        ctx.beginPath();
                        ctx.moveTo(cx - cSize/2, cy - cSize/2);
                        ctx.lineTo(cx + cSize/2, cy - cSize/2);
                        ctx.lineTo(cx, cy + cSize/2);
                        ctx.fill();
                    } else {
                        ctx.fillStyle = '#0f0';
                        ctx.beginPath();
                        ctx.moveTo(cx, cy - cSize/2);
                        ctx.lineTo(cx + cSize/2, cy);
                        ctx.lineTo(cx, cy + cSize/2);
                        ctx.lineTo(cx - cSize/2, cy);
                        ctx.fill();
                    }
                }
            }

            for (let orb of s.maze.orbs) {
                if (orb.collected) continue;

                let ox = orb.x * cellSize;
                let oy = orb.y * cellSize;

                ctx.fillStyle = '#0ff';
                ctx.shadowColor = '#0ff';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(ox, oy, cellSize * 0.15, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                if (orb.isTargeted) {
                    ctx.strokeStyle = `rgba(255, 0, 255, ${(focusIntensity - 0.3) * 2})`;
                    ctx.lineWidth = 2 + Math.random() * 4;
                    ctx.beginPath();
                    ctx.moveTo(ox, oy);
                    ctx.lineTo(s.player.x * cellSize, s.player.y * cellSize);
                    ctx.stroke();
                }
            }
            
            // Check win
            let px = Math.floor(s.player.x);
            let py = Math.floor(s.player.y);
            if (py >= 0 && py < s.maze.dim && px >= 0 && px < s.maze.dim) {
                if (s.maze.grid[py][px] === 2) {
                    s.maze = new Maze(11);
                    s.player.x = 1.5;
                    s.player.y = 1.5;
                }
            }

            ctx.restore();

            // Draw player
            ctx.save();
            if (viewMode === 'ThirdPerson') {
                ctx.translate(canvas.width / 2, canvas.height / 2);
            } else {
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.translate(-(s.maze.dim / 2) * cellSize, -(s.maze.dim / 2) * cellSize);
                ctx.translate(s.player.x * cellSize, s.player.y * cellSize);
                ctx.rotate(s.player.angle);
            }
            
            let pSize = cellSize * 0.3;
            ctx.fillStyle = (controlMode === 'Sweep' || controlMode === 'Semantic') ? '#0ff' : (controlMode === 'Motor' || controlMode === 'Classic') ? '#fd0' : isLocked ? '#0f8' : '#f66';
            ctx.beginPath(); ctx.arc(0, 0, pSize, 0, Math.PI * 2); ctx.fill();
            
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -pSize * 1.5); ctx.lineTo(-pSize * 0.7, pSize * 0.5); ctx.lineTo(pSize * 0.7, pSize * 0.5); ctx.fill();
            
            // Draw Motor Ray
            let mot_mag = Math.sqrt(ble.target_vx**2 + ble.target_vy**2);
            if (showIntentArrow && mot_mag > 0.01 && (controlMode !== 'Sweep' && controlMode !== 'Semantic')) {
                let mot_ang = Math.atan2(ble.target_vy, ble.target_vx);
                let draw_ang = viewMode === 'World' ? mot_ang - s.player.angle : mot_ang;
                let mot_len = pSize * 1.4 + Math.min(mot_mag, 15.0) * 5.0;
                ctx.strokeStyle = '#fd0';
                ctx.lineWidth = (controlMode === 'Motor' || controlMode === 'Classic') ? 5 : 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(draw_ang) * mot_len, Math.sin(draw_ang) * mot_len);
                ctx.stroke();
            }
            
            // Draw Sweep Ray
            let sw_mag = ble.sweep_mag;
            if (showIntentArrow && sw_mag > 0.01) {
                let sw_ang = Math.atan2(ble.sweep_vy, ble.sweep_vx);
                let draw_ang = viewMode === 'World' ? sw_ang - s.player.angle : sw_ang;
                let sw_len = pSize * 1.5 + Math.min(sw_mag, 15.0) * 7.0;
                ctx.strokeStyle = '#0ff';
                ctx.lineWidth = (controlMode === 'Sweep' || controlMode === 'Semantic') || (controlMode === 'Resonance' && isLocked) ? 5 : 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(draw_ang) * sw_len, Math.sin(draw_ang) * sw_len);
                ctx.stroke();
            }
            
            if (controlMode === 'Resonance' && isLocked) {
                ctx.strokeStyle = '#0f8';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, 0, pSize * 1.6, 0, Math.PI * 2); ctx.stroke();
            }
            
            ctx.restore();

            reqRef.current = requestAnimationFrame(loop);
        };

        reqRef.current = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(reqRef.current);
            if (audioEngine) {
                audioEngine.muteSonar();
            }
        };
    }, [moveSensitivity, zoomLevel, viewMode, controlMode, movementInput, audioEngine]);

    return (
        <div className="w-full h-full absolute inset-0 z-0">
            <canvas ref={canvasRef} className="absolute inset-0 z-0 block w-full h-full" />
        </div>
    );
};
