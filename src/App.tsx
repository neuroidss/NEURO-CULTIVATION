import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { ACTIVE_QUEST, QuestTarget } from './config/questData';
import { NeuroEngine } from './lib/NeuroEngine';
import { NeuroAudioEngine } from './lib/NeuroAudioEngine';
import { ClipService } from './lib/ClipService';
import { EngineConfig } from './config/EngineConfig';
import { dotProduct } from './lib/clipHelper';
import { MODE_1_AXES_FLAT, MODE_2_AXES_FLAT, SEMANTIC_DIRECTIONS } from './config/referenceAxes';
import { BleService } from './lib/BleService';
import { InputService } from './lib/InputService';
import { CultivationEngine } from './lib/CultivationEngine';
import { RobotArenaScene } from './components/RobotArenaScene';
import { BrainMazeScene } from './components/BrainMazeScene';
import { RhythmicLawPanel } from './components/RhythmicLawPanel';
import { CzRailgunScene } from './components/CzRailgunScene';
import { DlpfcMonolithScene } from './components/DlpfcMonolithScene';
import { OzFractalScene } from './components/OzFractalScene';
import { FpQuantumShiftScene } from './components/FpQuantumShiftScene';
import { DroneRacingScene } from './components/DroneRacingScene';
import { StuntRacingScene } from './components/StuntRacingScene';
import { SemanticRadar } from './components/SemanticRadar';
import RoboArmScene from './components/RoboArmScene';
import ArcAgiScene from './components/ArcAgiScene';
import PhaseVortexScene from './components/PhaseVortexScene';
import { RawDiagnostics } from './components/RawDiagnostics';
import { WorkingMemoryDiagnostics } from './components/WorkingMemoryDiagnostics';
import { MultiplayerService } from './lib/MultiplayerService';
import { GamepadExportService } from './lib/GamepadExportService';
import { QRCodeSVG } from 'qrcode.react';
import { globalXrStore } from './lib/xrStore';

export default function App() {
  const [, forceUpdate] = useState({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentTarget, setCurrentTarget] = useState<QuestTarget>(ACTIVE_QUEST.targets[0]);
  const [renderMode, setRenderMode] = useState<number>(3); 
  const [autoQuality, setAutoQuality] = useState<boolean>(true);
  const engineRef = useRef<NeuroEngine | null>(null);
  const latentResidueRef = useRef<Float32Array>(new Float32Array(768));
  const [isMenuMinimized, setIsMenuMinimized] = useState<boolean>(true);
  const [showRawDiagnostics, setShowRawDiagnostics] = useState<boolean>(false);
  const [showWorkingMemory, setShowWorkingMemory] = useState<boolean>(false);
  
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [bleConnected, setBleConnected] = useState<boolean>(false);
  const audioEngineRef = useRef<NeuroAudioEngine | null>(null);

  const [isInitializing, setIsInitializing] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<string>("Initializing CLIP Model...");
  const [downloadState, setDownloadState] = useState<'checking' | 'pending' | 'downloading'>('checking');
  const [cultivationState, setCultivationState] = useState({ 
    levelName: "", 
    progress: 0, 
    instability: 0, 
    consensusVolume: 0,
    reqConsensus: 5,
    autoProgression: false 
  });
  const [activityMode, setActivityMode] = useState<'Refining' | 'Arena' | 'BrainMaze' | 'RhythmDJ' | 'Topology' | 'CzRailgun' | 'DlpfcMonolith' | 'OzFractal' | 'FpQuantumShift' | 'DroneRacing' | 'StuntRacing' | 'RoboArm' | 'ArcAgi' | 'PhaseVortex'>('PhaseVortex');
  const activityModeRef = useRef<'Refining' | 'Arena' | 'BrainMaze' | 'RhythmDJ' | 'Topology' | 'CzRailgun' | 'DlpfcMonolith' | 'OzFractal' | 'FpQuantumShift' | 'DroneRacing' | 'StuntRacing' | 'RoboArm' | 'ArcAgi' | 'PhaseVortex'>('PhaseVortex');
  useEffect(() => { 
      activityModeRef.current = activityMode; 
      if (engineRef.current) {
          engineRef.current.isPaused = (activityMode !== 'Refining');
      }
  }, [activityMode]);
  const [viewMode, setViewMode] = useState<'World' | 'ThirdPerson'>('ThirdPerson');
  const [controlMode, setControlMode] = useState<'Motor' | 'Sweep' | 'Resonance'>('Sweep');
  const [morphOverride, setMorphOverride] = useState<'Auto' | 'Manual'>('Manual');
  const [manualBlend, setManualBlend] = useState<number>(0.0);
  const [moveSensitivity, setMoveSensitivity] = useState<number>(0.05);
  const [zoomLevel, setZoomLevel] = useState<number>(80);
  const [movementInput, setMovementInput] = useState<'BLE' | 'Gamepad'>('BLE');
  const [bladesInput, setBladesInput] = useState<'BLE' | 'Gamepad'>('BLE');
  const [useGamepad, setUseGamepad] = useState<boolean>(true);
  const [useKbMouse, setUseKbMouse] = useState<boolean>(true);
  const [phaseVortexShowLines, setPhaseVortexShowLines] = useState<boolean>(false);
  const [phaseVortexShowGamepad, setPhaseVortexShowGamepad] = useState<boolean>(true);
  const [phaseVortexShowProtoGamepads, setPhaseVortexShowProtoGamepads] = useState<boolean>(false);
  const [useSensors, setUseSensors] = useState<boolean>(true);
  const [showIntentArrow, setShowIntentArrow] = useState<boolean>(true);
  const [multiDeviceMode, setMultiDeviceMode] = useState<'append' | 'average' | 'max' | 'primary'>('max');

  useEffect(() => {
    const handlePointerLockChange = () => {
      if (!document.pointerLockElement) {
         if (isMenuMinimized) {
            setIsMenuMinimized(false);
         }
      }
    };
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, [isMenuMinimized]);

  useEffect(() => {
    const input = InputService.getInstance();
    input.useGamepad = useGamepad;
    input.useKeyboardMouse = useKbMouse;
    input.useSensors = useSensors;
    input.multiDeviceMode = multiDeviceMode;
  }, [useGamepad, useKbMouse, useSensors, multiDeviceMode]);
  const [bladeCount, setBladeCount] = useState<number>(16);
  const [bleGain, setBleGain] = useState<4 | 8 | 16 | 32>(16);
  
  // Robo Arm States
  const [roboControlMode, setRoboControlMode] = useState<'Arcade (IK)' | 'Joint (Manual)'>('Arcade (IK)');
  const [roboAutoGrab, setRoboAutoGrab] = useState<boolean>(true);
  const [roboCameraView, setRoboCameraView] = useState<'World' | 'Gripper FPV'>('Gripper FPV');

  const [gpExportUrl, setGpExportUrl] = useState('ws://127.0.0.1:8765');
  const [gpExportConnected, setGpExportConnected] = useState(false);

  const [peerState, setPeerState] = useState({ id: '', joinId: '', isHost: false, connected: 0 });

  useEffect(() => {
    const mp = MultiplayerService.getInstance();
    
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    if (joinCode && !mp.isHost && mp.connections.size === 0) {
      setPeerState(s => ({ ...s, joinId: joinCode }));
      setTimeout(() => {
        mp.joinGame(joinCode);
        setActivityMode('Arena');
      }, 1000);
    }

    const unsub = mp.subscribe(() => {
        setPeerState({
            id: mp.peerId || '',
            joinId: peerState.joinId || joinCode || '',
            isHost: mp.isHost,
            connected: mp.connections.size
        });
    });
    return () => { unsub(); };
  }, [peerState.joinId]);

  const getJoinUrl = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('join', id);
    return url.toString();
  };

  const smoothedInputRef = useRef<Float32Array>(new Float32Array(16));
  const lastRawInputRef = useRef<Float32Array>(new Float32Array(32));
  const drumVisualStateRef = useRef<number>(0);
  const lastDrumTriggerRef = useRef<number>(0);
  const drumCooldownRef = useRef<number>(100.0);
  const drumSensitivityRef = useRef<number>(1.0);
  const drumThresholdRef = useRef<number>(3.5);

  const [drumCooldownUi, setDrumCooldownUi] = useState<number>(100.0);
  const [drumSensitivityUi, setDrumSensitivityUi] = useState<number>(1.0);
  const [drumThresholdUi, setDrumThresholdUi] = useState<number>(3.5);

  const currentPosRef = useRef<Float32Array>(new Float32Array(768));
  const driftRef = useRef<Float32Array>(new Float32Array(768));

  const [targetEmbeddings, setTargetEmbeddings] = useState<Record<string, Float32Array>>({});
  const [mode1Refs, setMode1Refs] = useState<Float32Array[]>([]);
  const [mode2Refs, setMode2Refs] = useState<Float32Array[]>([]);
  const [movementRefs, setMovementRefs] = useState<Float32Array[]>([]);
  const [movementAxes, setMovementAxes] = useState<Float32Array[]>([]);

  const synapticBarRef = useRef<HTMLDivElement>(null);
  const processTimeRef = useRef<HTMLSpanElement>(null);
  
  const rigidityTextRef = useRef<HTMLSpanElement>(null);

  const NLP_MODELS = [
    { id: 'none', label: 'No NLP (Classic Pad Only)', sizeQ: '0MB', sizeF: '0MB' },
    { id: 'Xenova/all-mpnet-base-v2', label: 'High Quality (MPNet, 768D)', sizeQ: '~90MB', sizeF: '~420MB' },
    { id: 'Xenova/all-MiniLM-L6-v2', label: 'Maximum Speed (MiniLM, 384D)', sizeQ: '~22MB', sizeF: '~80MB' },
    { id: 'Xenova/bge-small-en-v1.5', label: 'Balanced (BGE, 384D)', sizeQ: '~33MB', sizeF: '~133MB' }
  ];

  const [selectedModel, setSelectedModel] = useState<string>(NLP_MODELS[0].id);
  const [useQuantized, setUseQuantized] = useState<boolean>(true);

  const [isCached, setIsCached] = useState<boolean>(false);
  const [hardwareType, setHardwareType] = useState<string>('wasm');

  useEffect(() => {
    const checkCache = async () => {
        setDownloadState('checking');
        const cached = await ClipService.getInstance().checkIfCached(selectedModel, useQuantized);
        setIsCached(cached);
        setDownloadState('pending');
    };
    checkCache();
  }, [selectedModel, useQuantized]);

  useEffect(() => {
    if (downloadState !== 'downloading') return;
    let active = true;
    const init = async () => {
      try {
        if (selectedModel === 'none') {
            const dummyDim = 16;
            const tEmbs: Record<string, Float32Array> = {};
            ACTIVE_QUEST.targets.forEach(t => tEmbs[t.id] = new Float32Array(dummyDim));
            setTargetEmbeddings(tEmbs);
            setMode1Refs(Array(32).fill(new Float32Array(dummyDim)));
            setMode2Refs(Array(64).fill(new Float32Array(dummyDim)));
            setMovementRefs(Array(6).fill(new Float32Array(dummyDim)));
            setHardwareType('none');
            setIsInitializing(false);
            return;
        }

        const clip = ClipService.getInstance();
        await clip.initialize(selectedModel, useQuantized, (progress: any) => {
          if (progress.status === 'downloading') {
            setLoadingProgress(`Downloading chunk...`);
          } else if (progress.status === 'progress') {
            setLoadingProgress(`Loading Model: ${Math.round(progress.progress)}%`);
          } else if (progress.status === 'ready') {
            setLoadingProgress(`Model Base Loaded.`);
          }
        });

        if (!active) return;
        setLoadingProgress(`Synthesizing Semantic Targets...`);
        
        const tEmbs: Record<string, Float32Array> = {};
        const targets = ACTIVE_QUEST.targets;
        const targetPromises = await Promise.all(targets.map(t => clip.getEmbedding(t.text)));
        for (let i = 0; i < targets.length; i++) {
            tEmbs[targets[i].id] = targetPromises[i];
        }
        setTargetEmbeddings(tEmbs);

        if (!active) return;
        setLoadingProgress("Mapping Semantic Triad (32 Axes)...");
        const m1 = await Promise.all(MODE_1_AXES_FLAT.map(word => clip.getEmbedding(word)));
        setMode1Refs(m1);

        if (!active) return;
        setLoadingProgress("Mapping Spectral Resonance (64 Axes)...");
        const m2 = await Promise.all(MODE_2_AXES_FLAT.map(word => clip.getEmbedding(word)));
        setMode2Refs(m2);

        if (!active) return;
        setLoadingProgress("Mapping Semantic Directions (6 Axes)...");
        const mov = await Promise.all(SEMANTIC_DIRECTIONS.map(word => clip.getEmbedding(word)));
        setMovementRefs(mov);

        if (!active) return;
        setHardwareType(clip.usedDevice);
        setIsInitializing(false);

      } catch (err) {
        console.error("Initialization Error", err);
        setLoadingProgress("Error loading AI model. Check console.");
      }
    };
    init();
    
    return () => { active = false; };
  }, [downloadState]);

  useEffect(() => {
    if (isInitializing || !canvasRef.current || engineRef.current) return;
    
    const engine = new NeuroEngine(canvasRef.current);
    engine.start();
    engine.isPaused = (activityMode !== 'Refining');
    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [isInitializing]);

  const projInputTo768Ref = useRef<Float32Array | null>(null);
  const projBleTo768Ref = useRef<Float32Array | null>(null);
  const accumulatedDriftRef = useRef<Float32Array>(new Float32Array(0));
  const smoothedAudioTriadRef = useRef<Float32Array>(new Float32Array(32));

  useEffect(() => {
    if (mode2Refs.length === 64 && movementRefs.length === 6) {
        const dim = mode2Refs[0].length;
        const p1 = new Float32Array(16 * dim);
        
        for(let i=0; i<16; i++) {
            for(let d=0; d<dim; d++) p1[i * dim + d] = mode2Refs[i][d] * 0.1; 
        }

        const dot = (a:Float32Array, b:Float32Array) => { let s=0; for(let i=0;i<dim;i++)s+=a[i]*b[i]; return s; };
        
        const a0 = new Float32Array(dim);
        const a1 = new Float32Array(dim);
        const a2 = new Float32Array(dim);
        const a3 = new Float32Array(dim); 
        const a4 = new Float32Array(dim); 
        for(let d=0; d<dim; d++) {
            a0[d] = (movementRefs[3][d] - movementRefs[2][d]) * 0.5; 
            a1[d] = (movementRefs[1][d] - movementRefs[0][d]) * 0.5; 
            a2[d] = (movementRefs[4][d] - movementRefs[5][d]) * 0.5; 
            a3[d] = (movementRefs[0][d] + movementRefs[1][d]) * 0.5; 
            a4[d] = (movementRefs[2][d] + movementRefs[3][d]) * 0.5; 
        }

        const cultEngine = CultivationEngine.getInstance();

        if (cultEngine.level === 1) {
            const C = [
                [dot(a0,a0), dot(a0,a1), dot(a0,a2)],
                [dot(a1,a0), dot(a1,a1), dot(a1,a2)],
                [dot(a2,a0), dot(a2,a1), dot(a2,a2)]
            ];
            
            const det = C[0][0]*(C[1][1]*C[2][2] - C[1][2]*C[2][1]) 
                      - C[0][1]*(C[1][0]*C[2][2] - C[1][2]*C[2][0]) 
                      + C[0][2]*(C[1][0]*C[2][1] - C[1][1]*C[2][0]);
                      
            let D0 = a0, D1 = a1, D2 = a2; 
            if (Math.abs(det) > 1e-6) {
                const inv = [
                    [
                        (C[1][1]*C[2][2] - C[1][2]*C[2][1]) / det,
                        (C[0][2]*C[2][1] - C[0][1]*C[2][2]) / det,
                        (C[0][1]*C[1][2] - C[0][2]*C[1][1]) / det
                    ],
                    [
                        (C[1][2]*C[2][0] - C[1][0]*C[2][2]) / det,
                        (C[0][0]*C[2][2] - C[0][2]*C[2][0]) / det,
                        (C[0][2]*C[1][0] - C[0][0]*C[1][2]) / det
                    ],
                    [
                        (C[1][0]*C[2][1] - C[1][1]*C[2][0]) / det,
                        (C[0][1]*C[2][0] - C[0][0]*C[2][1]) / det,
                        (C[0][0]*C[1][1] - C[0][1]*C[1][0]) / det
                    ]
                ];
                
                D0 = new Float32Array(dim);
                D1 = new Float32Array(dim);
                D2 = new Float32Array(dim);
                for(let d=0; d<dim; d++) {
                    D0[d] = a0[d]*inv[0][0] + a1[d]*inv[1][0] + a2[d]*inv[2][0];
                    D1[d] = a0[d]*inv[0][1] + a1[d]*inv[1][1] + a2[d]*inv[2][1];
                    D2[d] = a0[d]*inv[0][2] + a1[d]*inv[1][2] + a2[d]*inv[2][2];
                }
            }

            const norm_a3 = Math.sqrt(dot(a3,a3)) || 1;
            const norm_a4 = Math.sqrt(dot(a4,a4)) || 1;
            const D3 = new Float32Array(dim);
            const D4 = new Float32Array(dim);
            for(let d=0; d<dim; d++) {
                D3[d] = a3[d] / norm_a3;
                D4[d] = a4[d] / norm_a4;
            }

            setMovementAxes([D0, D1, D2, D3, D4]);
            
            for(let d=0; d<dim; d++) {
                p1[0 * dim + d] = a0[d]; 
                p1[1 * dim + d] = a1[d];
                p1[2 * dim + d] = a2[d];
            }
        } else {
            const exactLevel = cultEngine.level - 1 + cultEngine.progress;
            const chaosFactor = Math.min(1.0, exactLevel / 3.0); 
            
            const dot_a1_a0 = dot(a1, a0);
            const dot_a0_a0 = dot(a0, a0) || 1;
            const pure_u1 = new Float32Array(dim);
            for(let d=0; d<dim; d++) pure_u1[d] = a1[d] - a0[d] * (dot_a1_a0 / dot_a0_a0);
            
            const dot_a2_a0 = dot(a2, a0);
            const dot_a2_u1 = dot(a2, pure_u1);
            const dot_u1_u1 = dot(pure_u1, pure_u1) || 1;
            const pure_u2 = new Float32Array(dim);
            for(let d=0; d<dim; d++) pure_u2[d] = a2[d] - a0[d] * (dot_a2_a0 / dot_a0_a0) - pure_u1[d] * (dot_a2_u1 / dot_u1_u1);

            const u0 = new Float32Array(a0);
            const u1 = new Float32Array(dim);
            for(let d=0; d<dim; d++) u1[d] = pure_u1[d] * (1.0 - chaosFactor) + a1[d] * chaosFactor;
            const u2 = new Float32Array(dim);
            for(let d=0; d<dim; d++) u2[d] = pure_u2[d] * (1.0 - chaosFactor) + a2[d] * chaosFactor;

            const u3 = new Float32Array(dim);
            const u4 = new Float32Array(dim);
            for(let d=0; d<dim; d++) {
                u3[d] = a3[d] * chaosFactor; 
                u4[d] = a4[d] * chaosFactor;
            }

            const dot_u0_u0 = dot(u0, u0) || 1;
            const dot_u1_u1_blended = dot(u1, u1) || 1;
            const dot_u2_u2_blended = dot(u2, u2) || 1;
            const dot_u3_u3 = dot(u3, u3) || 1;
            const dot_u4_u4 = dot(u4, u4) || 1;

            const norm_u0 = Math.sqrt(dot_u0_u0);
            const norm_u1 = Math.sqrt(dot_u1_u1_blended);
            const norm_u2 = Math.sqrt(dot_u2_u2_blended);
            const norm_u3 = Math.sqrt(dot_u3_u3);
            const norm_u4 = Math.sqrt(dot_u4_u4);
            
            const norm_a0 = Math.sqrt(dot(a0,a0)) || 1;
            const norm_a1 = Math.sqrt(dot(a1,a1)) || 1;
            const norm_a2 = Math.sqrt(dot(a2,a2)) || 1;
            const norm_a3 = Math.sqrt(dot(a3,a3)) || 1;
            const norm_a4 = Math.sqrt(dot(a4,a4)) || 1;

            for(let d=0; d<dim; d++) {
                u0[d] = u0[d] / norm_u0 * norm_a0;
                u1[d] = u1[d] / norm_u1 * norm_a1;
                u2[d] = u2[d] / norm_u2 * norm_a2;
                u3[d] = u3[d] / norm_u3 * norm_a3;
                u4[d] = u4[d] / norm_u4 * norm_a4;
            }

            setMovementAxes([u0, u1, u2, u3, u4]);
            
            for(let d=0; d<dim; d++) {
                p1[0 * dim + d] = u0[d]; 
                p1[1 * dim + d] = u1[d];
                p1[2 * dim + d] = u2[d];
            }
        }
        projInputTo768Ref.current = p1;

        const bleStore = BleService.getInstance();
        const bleCount = bleStore.coherenceCount;
        const els = bleStore.electrodes;
        const channels = bleStore.numChannels;
        
        const pairDirs = [];
        for (let i = 0; i < channels; i++) {
             for (let j = i + 1; j < channels; j++) {
                  let dx = els[j].x - els[i].x;
                  let dy = els[j].y - els[i].y;
                  const len = Math.sqrt(dx*dx + dy*dy) || 1;
                  pairDirs.push({ dx: dx/len, dy: dy/len });
             }
        }

        const p2 = new Float32Array(bleCount * dim);
        const virtualAxesCount = mode2Refs.length - 16;
        for(let i=0; i<bleCount; i++) {
            const pDir = pairDirs[i];
            
            for(let k=0; k<virtualAxesCount; k++) {
                const vAngle = (k * Math.PI * 2) / virtualAxesCount;
                const vDx = Math.cos(vAngle);
                const vDy = Math.sin(vAngle);
                
                const alignment = Math.abs(pDir.dx * vDx + pDir.dy * vDy);
                
                if (alignment > 0.5) { 
                    const refIdx = 16 + k;
                    for(let d=0; d<dim; d++) {
                        p2[i * dim + d] += mode2Refs[refIdx][d] * alignment * 0.5; 
                    }
                }
            }
        }
        projBleTo768Ref.current = p2;
    }
  }, [mode2Refs, movementRefs]);

  useEffect(() => {
    if (isInitializing || !engineRef.current || !targetEmbeddings || !currentTarget) return;
    const engine = engineRef.current;
    engine.setMode(renderMode);
    engine.setAutoQuality(autoQuality);
    
    let logicTimer: number;
    let animFrame: number;
    let lastTime = performance.now();

    const mapSim = (sim: number) => {
        let s = (sim - 0.1) * 3.0;
        return Math.max(0.0, Math.min(2.0, s));
    };

    const loop = (time: number) => {
        let dt = (time - lastTime) / 1000.0;
        lastTime = time;
        if (dt > 0.1) dt = 0.016;

        engine.setPaused(activityModeRef.current !== 'Refining');

        InputService.getInstance().update();
        BleService.getInstance().process();

        const inputAxes = InputService.getInstance().rawAxes;
        const bleAxes = BleService.getInstance().rawAxes;
        const baseEmb = targetEmbeddings[currentTarget.id];
        if (!baseEmb) {
            animFrame = requestAnimationFrame(loop);
            return;
        }

        const dim = baseEmb.length;
        if (accumulatedDriftRef.current.length !== dim) {
            accumulatedDriftRef.current = new Float32Array(dim);
        }

        const drift = accumulatedDriftRef.current;
        const projIn = projInputTo768Ref.current;
        let projBle = projBleTo768Ref.current;
        const bleStore = BleService.getInstance();
        
        if (projBle && projBle.length !== bleAxes.length * dim && mode2Refs.length > 0) {
            const bleCount = bleStore.coherenceCount;
            const els = bleStore.electrodes;
            const channels = bleStore.numChannels;
            const pairDirs = [];
            for (let i = 0; i < channels; i++) {
                 for (let j = i + 1; j < channels; j++) {
                      let dx = els[j].x - els[i].x;
                      let dy = els[j].y - els[i].y;
                      const len = Math.sqrt(dx*dx + dy*dy) || 1;
                      pairDirs.push({ dx: dx/len, dy: dy/len });
                 }
            }
            const p2 = new Float32Array(bleCount * dim);
            const virtualAxesCount = mode2Refs.length - 16;
            for(let i=0; i<bleCount; i++) {
                const pDir = pairDirs[i];
                for(let k=0; k<virtualAxesCount; k++) {
                    const vAngle = (k * Math.PI * 2) / virtualAxesCount;
                    const vDx = Math.cos(vAngle);
                    const vDy = Math.sin(vAngle);
                    const alignment = Math.abs(pDir.dx * vDx + pDir.dy * vDy);
                    if (alignment > 0.5) {
                        const refIdx = 16 + k;
                        for(let d=0; d<dim; d++) {
                            p2[i * dim + d] += mode2Refs[refIdx][d] * alignment * 0.5; 
                        }
                    }
                }
            }
            projBleTo768Ref.current = p2;
            projBle = p2;
        }

        if (!projIn || !projBle) {
            animFrame = requestAnimationFrame(loop);
            return;
        }

        const inputS = InputService.getInstance();
        const isSerialMode = inputS.isSerialConnected && inputS.isSerialActive;
        // Если Web Serial активен, мы берем ввод геймпада напрямую без блокировок
        let activeInput = (bleConnected && !isSerialMode) ? bleAxes : inputAxes;

        const cultEngine = CultivationEngine.getInstance();
        if (bleConnected && !isSerialMode) {
            const bleS = BleService.getInstance();
            cultEngine.update(dt, bleS.pastAxes || activeInput);
        } else {
            cultEngine.update(dt, activeInput);
        }
        
        if (Math.random() < 0.1) {
            setCultivationState({
                levelName: cultEngine.getLevelName(),
                progress: cultEngine.progress,
                instability: cultEngine.instability,
                consensusVolume: cultEngine.consensusVolume,
                reqConsensus: cultEngine.reqConsensus,
                autoProgression: cultEngine.autoProgression
            });
        }

        let smoothedInput = smoothedInputRef.current;
        
        let velocity = new Float32Array(dim);
        for(let i=0; i<16; i++) {
            smoothedInput[i] = activeInput[i]; 
            if(Math.abs(smoothedInput[i]) > 0.01) {
                const proj = (bleConnected && !isSerialMode) ? projBle : projIn;
                for(let d=0; d<dim; d++) velocity[d] += smoothedInput[i] * proj[i * dim + d];
            }
        }
        const bleCount = bleAxes.length;
        if (bleConnected && !isSerialMode) {
            for(let i=16; i<bleCount; i++) {
                if(Math.abs(bleAxes[i]) > 0.01) {
                    for(let d=0; d<dim; d++) velocity[d] += bleAxes[i] * projBle[i * dim + d];
                }
            }
        }

        const exactLevel = cultEngine.level - 1 + cultEngine.progress;
        const chaosFactor = Math.min(1.0, Math.max(0.0, exactLevel / 3.0));

        let residue = latentResidueRef.current;
        const fb = 4.6692016; 
        const feigenR = chaosFactor > 0 ? 2.5 + chaosFactor * (fb - 2.5) : 0; 
        
        let currentDrift = driftRef.current;
        const currentPos768 = new Float32Array(dim);
        let normSq = 0;
        for(let d=0; d<dim; d++) {
            let instV = velocity[d] / 50.0; 
            
            if (chaosFactor > 0.01) {
                let n1 = Math.abs(residue[(d + 1) % dim]);
                let val = Math.abs(residue[d]) + Math.abs(instV) * 0.1;
                let nextVal = feigenR * val * (1.0 - Math.min(1.0, n1));
                residue[d] = Math.max(-1, Math.min(1, residue[d] * 0.95 + (nextVal - val) * Math.sign(instV || residue[d] || 1) * 0.1));
                instV += residue[d] * chaosFactor * 0.5;
            } else {
                residue[d] *= 0.9; 
            }

            currentDrift[d] = instV;
            currentPos768[d] = baseEmb[d] + currentDrift[d];
            normSq += currentPos768[d] * currentPos768[d];
            currentPosRef.current[d] = currentPos768[d];
            drift[d] = currentDrift[d]; 
        }

        const norm = Math.sqrt(normSq) || 1.0;
        for(let d=0; d<dim; d++) {
            currentPos768[d] = currentPos768[d] / norm;
        }

        const audioTriad = new Float32Array(32);
        if (mode1Refs.length === 32) {
            for (let i = 0; i < 32; i++) {
                audioTriad[i] = mapSim(dotProduct(currentPos768, mode1Refs[i]));
            }
        }

        let lastRaw = lastRawInputRef.current;
        let deltaSum = 0;
        let limit = Math.min(activeInput.length, lastRaw.length);
        for(let i=0; i<limit; i++) {
            deltaSum += Math.abs(activeInput[i] - lastRaw[i]);
            lastRaw[i] = activeInput[i];
        }

        let instantaneousSpikeRate = deltaSum / (dt * Math.max(1, limit));
        let smoothedSpikeRate = parseFloat(document.getElementById('spike-rate-text')?.innerText || "0");
        smoothedSpikeRate = instantaneousSpikeRate > smoothedSpikeRate ? instantaneousSpikeRate : smoothedSpikeRate * 0.95;
        let spikeRate = instantaneousSpikeRate; 
        
        const COOLDOWN_MS = drumCooldownRef.current;
        const SENSITIVITY = drumSensitivityRef.current;
        const HIT_THRESHOLD = drumThresholdRef.current;
        
        const bar = document.getElementById('spike-rate-bar');
        if (bar) {
            bar.style.width = `${Math.min(100, (smoothedSpikeRate / Math.max(0.1, HIT_THRESHOLD * 2)) * 100)}%`;
        }
        const text = document.getElementById('spike-rate-text');
        if (text) {
            text.innerText = smoothedSpikeRate.toFixed(1);
        }

        if (SENSITIVITY > 0.001 && spikeRate > HIT_THRESHOLD && time - lastDrumTriggerRef.current > COOLDOWN_MS) {
            lastDrumTriggerRef.current = time;
            drumVisualStateRef.current = 1.0;
        }
        drumVisualStateRef.current = Math.max(0, drumVisualStateRef.current - dt * 5.0);

        if (renderMode === 1) {
            audioTriad[21] = Math.max(audioTriad[21], drumVisualStateRef.current);
            audioTriad[25] = Math.max(audioTriad[25], drumVisualStateRef.current);
            audioTriad[27] = Math.max(audioTriad[27], 0.5); 
            engine.setLatentVector(audioTriad);
        } else if (renderMode === 2) {
            const vec = new Float32Array(64);
            if (mode2Refs.length === 64) {
                for (let i = 0; i < 64; i++) {
                    vec[i] = mapSim(dotProduct(currentPos768, mode2Refs[i]));
                }
            }
            engine.setLatentVector(vec);
        } else if (renderMode === 3) {
            const dim = currentPos768.length;
            const vec = new Float32Array(dim);
            for (let i = 0; i < dim; i++) {
                vec[i] = currentPos768[i] * 25.0; 
            }
            engine.setLatentVector(vec);
        }

        if (audioEngineRef.current) {
            const ce = CultivationEngine.getInstance();
            let blend = 0;
            if (controlMode === 'Semantic' as any) {
                blend = morphOverride === 'Auto' ? chaosFactor : manualBlend;
            }
            
            audioTriad[21] = Math.max(audioTriad[21], drumVisualStateRef.current);
            audioTriad[25] = Math.max(audioTriad[25], drumVisualStateRef.current);
            
            let audioRawAxes = new Float32Array(16);
            
            if (activityModeRef.current === 'RhythmDJ' || activityModeRef.current === 'Topology') {
                let allAxes: number[] = [];
                
                // Prioritize BLE Neuro headsets
                if (bleConnected && !isSerialMode) {
                    const bleS = BleService.getInstance();
                    for (let i = 0; i < bleS.devices.length; i++) {
                        let da = bleS.deviceAxes[i];
                        if (da) {
                            allAxes.push(da.vx * EngineConfig.Arena.intentMoveMagnitude);
                            allAxes.push(da.vy * EngineConfig.Arena.intentMoveMagnitude);
                            allAxes.push(da.tq * EngineConfig.Arena.intentTurnMagnitude);
                        }
                    }
                }
                
                // Add standard gamepads/keyboard mapped to chunks of 3 (X, Y, Rot)
                const devices = InputService.getInstance().getActiveDevices();
                for (let dev of devices) {
                    allAxes.push(dev.axes[0] || 0); // X
                    allAxes.push(dev.axes[1] || 0); // Y
                    allAxes.push(dev.axes[2] || 0); // Rot
                    // If gamepad has a 4th axis (e.g. Right Y), we could map it to a second avatar's X, 
                    // but to keep avatars distinct per physical device, we consume 3 axes here.
                    // (Actually, if user wants to test multi-device with one gamepad, they can't easily, 
                    // but they can test Avatar 1 perfectly).
                }
                
                // Fallback for keyboard mapping if no devices but keyboard used
                const inputS = InputService.getInstance();
                if (inputS.useKeyboardMouse && !isSerialMode && devices.length === 0) {
                     allAxes.push(inputS.rawAxes[0] || 0);
                     allAxes.push(inputS.rawAxes[1] || 0);
                     allAxes.push(inputS.rawAxes[2] || 0);
                }
                
                for(let i=0; i<16; i++) audioRawAxes[i] = allAxes[i] || 0;
                
                // Preserve D-Pad mappings on index 9 for toggles
                audioRawAxes[9] = inputS.rawAxes[9] || 0;
            } else {
                for(let i=0; i<16; i++) audioRawAxes[i] = activeInput[i];
                if (bleConnected && !isSerialMode) {
                    const bleS = BleService.getInstance();
                    audioRawAxes[0] = bleS.target_vy * EngineConfig.Arena.intentMoveMagnitude;
                    audioRawAxes[1] = bleS.target_vx * EngineConfig.Arena.intentMoveMagnitude;
                    audioRawAxes[2] = bleS.target_tq * EngineConfig.Arena.intentTurnMagnitude;
                }
            }
            
            if (activityModeRef.current === 'Refining') {
                const activeBoost = 1.0 + (bleConnected ? BleService.getInstance().synapticPersistence : InputService.getInstance().synapticPersistence) * 4.0;
                audioEngineRef.current.updateRefiningAudio(ce.progress, ce.instability, activeBoost);
            } else if (activityModeRef.current === 'RhythmDJ' || activityModeRef.current === 'Topology') {
                audioEngineRef.current.updateBlended(audioRawAxes, audioTriad, blend, ce.level, ce.instability);
            }
        }
        
        animFrame = requestAnimationFrame(loop);
    };

    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [currentTarget, renderMode, isInitializing, targetEmbeddings, mode1Refs, mode2Refs, audioEnabled, autoQuality, bleConnected, controlMode, morphOverride, manualBlend]);

  useEffect(() => {
    if (!bleConnected) return;
    let animFrame: number;
    const updateBar = () => {
        const bleService = BleService.getInstance();
        if (synapticBarRef.current) {
            const bleVal = bleService.synapticPersistence;
            const inputVal = InputService.getInstance().synapticPersistence;
            const val = Math.min(1.0, bleVal + inputVal);
            
            synapticBarRef.current.style.width = `${val * 100}%`;
            
            if (val > 0.8) synapticBarRef.current.style.backgroundColor = '#fbbf24'; 
            else if (val > 0.5) synapticBarRef.current.style.backgroundColor = '#34d399'; 
            else synapticBarRef.current.style.backgroundColor = '#22d3ee'; 
        }

        if (processTimeRef.current) {
            processTimeRef.current.innerText = bleService.processTimeMs.toFixed(1) + 'ms';
            if (bleService.processTimeMs > 16) {
                processTimeRef.current.className = "text-red-400 mr-2";
            } else if (bleService.processTimeMs > 5) {
                processTimeRef.current.className = "text-orange-300 mr-2";
            } else {
                processTimeRef.current.className = "text-emerald-300 mr-2";
            }
        }

        const gpx = GamepadExportService.getInstance();
        setGpExportConnected(gpx.isConnected);
        if (gpx.isConnected && bleConnected) {
             let energy = 0;
             if (bleService.pastAxes) {
               for(let i=0; i<bleService.pastAxes.length; i++) energy += Math.abs(bleService.pastAxes[i]);
             }
             const clamp = (v: number) => Math.max(-1.0, Math.min(1.0, v));
             
             const exportAxes = new Array(10).fill(0);
             
             if (bleService.sweep_mag > 0.05) {
                 // Working Memory / Theta-Gamma Sweep Mode (Full 4-Axis)
                 exportAxes[0] = clamp(bleService.sweep_vx / 24.0); 
                 exportAxes[1] = clamp(-bleService.sweep_vy / 24.0); 
                 exportAxes[2] = clamp(bleService.sweep_tq / 24.0); 
                 exportAxes[3] = clamp(bleService.sweep_pitch / 24.0); 
             } else {
                 // Motor / Beta Strike Mode (3-Axis)
                 exportAxes[0] = clamp(bleService.target_vx / 15.0); 
                 exportAxes[1] = clamp(-bleService.target_vy / 15.0); 
                 exportAxes[2] = clamp(bleService.target_tq / 15.0); 
                 exportAxes[3] = 0; 
             }
             
             if (energy > 0) exportAxes[4] = clamp(energy * 0.05); 
             
             if (bleService.rawAxes.length >= 12) {
                 exportAxes[5] = clamp(bleService.rawAxes[0] - bleService.rawAxes[1]); 
                 exportAxes[6] = clamp(bleService.rawAxes[2] - bleService.rawAxes[3]); 
                 exportAxes[7] = clamp(bleService.rawAxes[4] - bleService.rawAxes[5]); 
                 exportAxes[8] = clamp(bleService.rawAxes[6] - bleService.rawAxes[7]); 
                 exportAxes[9] = clamp(bleService.rawAxes[8] - bleService.rawAxes[9]); 
                 exportAxes[3] = clamp(bleService.rawAxes[10] - bleService.rawAxes[11]);
             }
             
             gpx.sendState(exportAxes);
        }

        animFrame = requestAnimationFrame(updateBar);
    };
    updateBar();
    return () => cancelAnimationFrame(animFrame);
  }, [bleConnected]);

  const initAudio = async () => {
    try {
        const audioExt = new NeuroAudioEngine();
        await audioExt.initialize();
        audioEngineRef.current = audioExt;
        audioEngineRef.current.setMode(activityModeRef.current);
        setAudioEnabled(true);
    } catch (e) {
        console.error("Failed to init audio", e);
    }
  };

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.isPaused = (activityMode !== 'Refining');
    }
    if (audioEngineRef.current) {
      audioEngineRef.current.setMode(activityMode);
    }
  }, [activityMode]);

  const connectBle = async () => {
    try {
      InputService.getInstance().requestSensorAccess();
      await BleService.getInstance().connect();
      setBleConnected(true);
      setActivityMode('BrainMaze');
      setIsMenuMinimized(true);
    } catch (e) {
      console.error(e);
      alert("BLE connection failed: " + e);
    }
  };

  const enableSensorsOnly = () => {
      InputService.getInstance().requestSensorAccess();
      setBleConnected(true); 
  };

  const getModeTitle = (mode: number) => {
    switch (mode) {
      case 1: return "SEMANTIC TRIAD (32-AXIS)";
      case 2: return "SPECTRAL RESONANCE (64-AXIS)";
      case 3: return `TRUE ${(Object.values(targetEmbeddings)[0] as Float32Array)?.length || 0}D SYNTHESIS`;
      default: return "";
    }
  };

  return (
    <div className="w-full h-screen bg-black overflow-hidden font-mono fixed">
      {isInitializing && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95">
            <div className="text-cyan-400 font-bold text-2xl animate-pulse mb-4 text-center">NEURO CULTIVATION ENGINE</div>
            
            {downloadState === 'pending' ? (
                <div className="border border-green-500/50 p-6 bg-green-950/20 max-w-sm rounded text-center">
                    <p className="text-green-400 text-sm mb-4">
                       The engine requires a local Semantic NLP model to generate geometry offline.
                       (<span className="font-bold text-yellow-500">{useQuantized ? NLP_MODELS.find(m => m.id === selectedModel)?.sizeQ : NLP_MODELS.find(m => m.id === selectedModel)?.sizeF}</span>)
                    </p>
                    
                    <div className="mb-2 text-left">
                      <label className="text-gray-400 text-xs block mb-1">Select Dimensionality Engine:</label>
                      <select 
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full bg-black/50 border border-green-500/30 text-green-400 text-xs p-2 rounded focus:outline-none focus:border-green-500">
                        {NLP_MODELS.map(model => (
                          <option key={model.id} value={model.id}>{model.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-4 text-left flex items-center justify-between border-b border-green-900/50 pb-2">
                       <label className="text-gray-400 text-xs">Use INT8 Quantized Model (Recommended):</label>
                       <button
                         onClick={() => setUseQuantized(!useQuantized)}
                         className={`px-3 py-1 text-xs rounded ${useQuantized ? 'bg-green-700 text-black font-bold' : 'bg-gray-800 text-gray-400 border border-gray-600'}`}>
                         {useQuantized ? 'YES (FAST)' : 'NO (FP32)'}
                       </button>
                    </div>

                    <p className="text-gray-400 text-xs mb-6">
                       This relies on your browser cache to prevent reloading across sessions. Avoid downloading over metered cellular connections.
                    </p>
                    
                    <div className="flex flex-col gap-3 w-full">
                        <button
                            onClick={async () => {
                                 try {
                                     InputService.getInstance().requestSensorAccess();
                                     await BleService.getInstance().connect();
                                     setBleConnected(true);
                                     setActivityMode('BrainMaze');
                                     setDownloadState('downloading');
                                 } catch (e) {
                                     console.error(e);
                                     alert("BLE connection failed: " + e);
                                 }
                            }}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold uppercase tracking-widest px-6 py-4 rounded animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                        >
                            {isCached ? 'Connect Device & Boot' : 'Connect Device & Initialize'}
                        </button>
                        <button
                            onClick={() => setDownloadState('downloading')}
                            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 text-[10px] font-bold uppercase tracking-widest px-6 py-2 border border-gray-600 rounded"
                        >
                            {isCached ? 'Boot Engine Without Device' : 'Initialize Without Device'}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="text-green-400 text-sm tracking-widest uppercase">{loadingProgress}</div>
                    <div className="mt-8 text-[10px] text-gray-600 max-w-sm text-center">
                      Real-time generation requires loading the local Transformers.js CLIP feature-extraction model. 
                      Subsequent runs will be cached.
                    </div>
                </>
            )}
        </div>
      )}

      <RawDiagnostics show={showRawDiagnostics} onClose={() => setShowRawDiagnostics(false)} />
      <WorkingMemoryDiagnostics show={showWorkingMemory} onClose={() => setShowWorkingMemory(false)} />
      <canvas ref={canvasRef} className={`absolute inset-0 z-0 w-full h-full ${activityMode === 'Refining' ? 'block' : 'hidden'}`} />
      
      {activityMode === 'Arena' && (
        <div className="absolute inset-0 z-0">
          <RobotArenaScene driftRef={driftRef} isActive={true} currentPosRef={currentPosRef} mode1Refs={mode1Refs} mode2Refs={mode2Refs} movementAxes={movementAxes} viewMode={viewMode} controlMode={controlMode} controlBlend={morphOverride === 'Auto' ? -1.0 : manualBlend} moveSensitivity={moveSensitivity} zoomLevel={zoomLevel} movementInput={movementInput} bladesInput={bladesInput} bladeCount={bladeCount} audioEngine={audioEngineRef.current} showIntentArrow={showIntentArrow} />
        </div>
      )}
      
      {activityMode === 'BrainMaze' && (
        <div className="absolute inset-0 z-0">
          <BrainMazeScene driftRef={driftRef} currentPosRef={currentPosRef} mode1Refs={mode1Refs} mode2Refs={mode2Refs} movementAxes={movementAxes} viewMode={viewMode} controlMode={controlMode} moveSensitivity={moveSensitivity} zoomLevel={zoomLevel} audioEngine={audioEngineRef.current} movementInput={movementInput} showIntentArrow={showIntentArrow} />
        </div>
      )}

      {activityMode === 'CzRailgun' && (
        <div className="absolute inset-0 z-0">
          <CzRailgunScene driftRef={driftRef} moveSensitivity={moveSensitivity} audioEngine={audioEngineRef.current} />
        </div>
      )}

      {activityMode === 'DlpfcMonolith' && (
        <div className="absolute inset-0 z-0">
          <DlpfcMonolithScene driftRef={driftRef} moveSensitivity={moveSensitivity} audioEngine={audioEngineRef.current} />
        </div>
      )}

      {activityMode === 'OzFractal' && (
        <div className="absolute inset-0 z-0 bg-black">
          <OzFractalScene driftRef={driftRef} moveSensitivity={moveSensitivity} audioEngine={audioEngineRef.current} />
        </div>
      )}

      {activityMode === 'FpQuantumShift' && (
        <div className="absolute inset-0 z-0">
          <FpQuantumShiftScene driftRef={driftRef} moveSensitivity={moveSensitivity} audioEngine={audioEngineRef.current} />
        </div>
      )}

      {activityMode === 'DroneRacing' && (
        <div className="absolute inset-0 z-0">
          <DroneRacingScene driftRef={driftRef} moveSensitivity={moveSensitivity} audioEngine={audioEngineRef.current} />
        </div>
      )}

      {activityMode === 'StuntRacing' && (
        <div className="absolute inset-0 z-0">
          <StuntRacingScene />
        </div>
      )}

      {activityMode === 'ArcAgi' && (
        <div className="absolute inset-0 z-0 bg-[#111111]">
          <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 8, 12], fov: 60 }}>
            <color attach="background" args={['#111']} />
            <ambientLight intensity={0.8} />
            <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />
            <ArcAgiScene moveSensitivity={moveSensitivity} showUI={!isMenuMinimized} />
          </Canvas>
        </div>
      )}

      {activityMode === 'PhaseVortex' && (
        <div className="absolute inset-0 z-0 bg-black">
          <Canvas>
            <color attach="background" args={['#000']} />
            <ambientLight intensity={1} />
            <PhaseVortexScene 
                showLines={phaseVortexShowLines} 
                showGamepad={phaseVortexShowGamepad}
                showProtoGamepads={phaseVortexShowProtoGamepads}
                moveSensitivity={moveSensitivity}
                audioEngine={audioEngineRef.current}
            />
          </Canvas>
        </div>
      )}

      {activityMode === 'RoboArm' && (
        <div className="absolute inset-0 z-0">
          <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 5, 10], fov: 60 }}>
            <color attach="background" args={['#1a1a2e']} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
            <RoboArmScene moveSensitivity={moveSensitivity} zoomLevel={zoomLevel} showUI={!isMenuMinimized} controlMode={roboControlMode} autoGrab={roboAutoGrab} cameraView={roboCameraView} />
          </Canvas>
        </div>
      )}

      {activityMode === 'Arena' && !isMenuMinimized && (
        <SemanticRadar driftRef={driftRef} movementAxes={movementAxes} />
      )}
      
      {activityMode === 'Refining' && (
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-10 drop-shadow-lg text-center" style={{ width: '80%' }}>
            <h2 className="text-xl text-yellow-400 font-bold mb-2 uppercase tracking-[0.2em]">{cultivationState.levelName}</h2>
            
            {bleConnected ? (
              <p className="text-sm text-yellow-100 max-w-lg mb-6 leading-relaxed">
                  <span className="font-bold">QUEST:</span> Achieve Topological Consensus. Generate high cortical structural density (Consensus {cultivationState.consensusVolume}/{cultivationState.reqConsensus}) while maintaining strict phase stability (low drift).
              </p>
            ) : (
              <p className="text-sm text-yellow-100 max-w-lg mb-6 leading-relaxed">
                  <span className="font-bold">QUEST (GAMEPAD):</span> Compress the True Qi into a Golden Core. <br />
                  <span className="text-yellow-300">How to refine:</span> Gently hold the joysticks in a stable, consistent direction. Do not let go to zero (loss of focus), and do not jerk wildly (instability). Let the compression complete exactly to 100%.
              </p>
            )}

            <div className="w-64 h-3 bg-gray-900 border border-gray-600 rounded overflow-hidden relative drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]">
               <div 
                 className={`h-full transition-all duration-300 ease-linear ${cultivationState.instability > 0.8 ? 'bg-red-500' : 'bg-yellow-400'}`} 
                 style={{ width: `${Math.min(100, Math.max(0, cultivationState.progress * 100))}%` }}
               />
               <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white mix-blend-difference">
                  CORE COMPRESSION: {(cultivationState.progress * 100).toFixed(1)}%
               </div>
            </div>

            {cultivationState.instability > 0.6 && (
                <div className="mt-4 text-red-400 animate-pulse font-bold tracking-widest text-sm">
                   WARNING: INSTABILITY HIGH - IMMINENT EXPLOSION
                </div>
            )}
        </div>
      )}

      {activityMode === 'RhythmDJ' && (
        <RhythmicLawPanel 
          audioEngine={audioEngineRef.current}
          cultivationState={cultivationState}
          setCultivationState={setCultivationState}
          visualsEnabled={true}
          controlMode={controlMode}
        />
      )}
      
      {!isInitializing && (
        <div className={`absolute top-4 left-4 z-10 text-green-400 bg-black/80 border border-green-500/50 rounded pointer-events-auto transition-all ${isMenuMinimized ? 'w-10 h-10 p-0 flex items-center justify-center overflow-hidden' : 'max-w-[340px] p-4 max-h-[90vh] overflow-y-auto'}`}>
          {isMenuMinimized ? (
             <button 
               onClick={() => {
                 setIsMenuMinimized(false);
                 document.exitPointerLock?.();
               }} 
               className="w-full h-full text-green-500 hover:text-green-300 font-bold focus:outline-none">
                ☰
             </button>
          ) : (
            <>
              <div className="flex justify-between items-start mb-1">
                <h1 className="text-xl font-bold uppercase">{ACTIVE_QUEST.title}</h1>
                <button 
                  onClick={() => {
                    setIsMenuMinimized(true);
                    document.body.requestPointerLock?.();
                  }} 
                  className="text-green-500 hover:text-green-300 ml-4 font-bold">✕</button>
              </div>
              <p className="text-[10px] text-green-600 mb-4 uppercase tracking-widest border-b border-green-900 pb-2">
                 Engine dims: {(Object.values(targetEmbeddings)[0] as Float32Array)?.length || ACTIVE_QUEST.dimensionality}D
              </p>

          <div className="mb-4 text-xs select-none">
            <p className="text-[10px] text-yellow-500 uppercase font-bold border-b border-yellow-900 pb-1 mb-2">Cultivation Rank (Working Memory 2.0)</p>
            <p className="font-bold text-sm text-yellow-400 mb-1">{cultivationState.levelName || "I: Qi Condensation"}</p>
            
            <div className="flex justify-between text-[9px] text-gray-500 mb-1">
              <span>Topological Consensus: {cultivationState.consensusVolume} / 120 pairs</span>
              <span>Req: {cultivationState.reqConsensus}</span>
            </div>
            <div className="flex items-center gap-2 mb-1 text-[10px]">
              <span className="w-16 text-gray-400 uppercase">Consensus:</span>
              <div className="flex-1 h-1.5 bg-black border border-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-400 transition-all duration-300" style={{ width: `${Math.min(100, (cultivationState.consensusVolume / Math.max(1, cultivationState.reqConsensus)) * 100)}%` }} />
              </div>
            </div>
            
            <div className="flex justify-between text-[9px] text-gray-500 mb-1 mt-1">
              <span>Phase Drift (Instability): {(cultivationState.instability * 100).toFixed(1)}%</span>
            </div>
            <div className="flex items-center gap-2 mb-2 text-[10px]">
              <span className="w-16 text-gray-400 uppercase">Drift:</span>
              <div className="flex-1 h-1.5 bg-black border border-gray-700 rounded-full overflow-hidden relative">
                <div className="absolute top-0 bottom-0 left-[50%] w-px bg-yellow-500/50 z-10" />
                <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${Math.min(100, cultivationState.instability * 100)}%` }} />
              </div>
            </div>
            <div className="text-[9px] text-gray-400 mt-1 italic border-l-2 border-gray-700 pl-2">
                {cultivationState.instability < 0.5 && cultivationState.consensusVolume >= cultivationState.reqConsensus ? (
                    <span className="text-green-400">Stable Phase-Locking achieved. Progressing... ({(cultivationState.progress * 100).toFixed(0)}%)</span>
                ) : (
                    <span className="text-yellow-600">High semantic chaos. Suppress mental noise to progress.</span>
                )}
            </div>
          </div>

          <div className="mb-4 text-xs select-none">
            <p>LOCUS: <span className="text-cyan-400 font-bold">{currentTarget.name}</span></p>
            <p className="text-gray-500 text-[10px] italic">"{currentTarget.description}"</p>
            <p className="text-yellow-400 font-bold mt-2">MODE: {getModeTitle(renderMode)}</p>
          </div>

          <div className="flex flex-col gap-2 mb-4">
            <p className="text-[10px] text-gray-400 uppercase border-b border-gray-700 pb-1">Dimensionality Engine</p>
            <div className="mb-2 w-full text-xs bg-black border border-gray-700 p-2 rounded">
              <span className="text-gray-400">Hardware Accel: </span>
              {hardwareType === 'webgpu' ? (
                <span className="text-green-400 font-bold">WebGPU (Enabled)</span>
              ) : (
                <span className="text-red-400 font-bold">CPU (Fallback WASM) -{'>'} Slower Realtime</span>
              )}
            </div>
            
            <div className="flex justify-between items-center mb-2">
               <span className="text-xs text-gray-300">GPU Optimization:</span>
               <button 
                 onClick={() => setAutoQuality(!autoQuality)}
                 className={`px-2 py-1 text-[10px] rounded ${autoQuality ? 'bg-indigo-900 border border-indigo-500 text-indigo-100' : 'bg-gray-800 border border-gray-600 text-gray-400'}`}>
                 {autoQuality ? 'AUTO (ADAPTIVE)' : 'FIXED (MAX HD)'}
               </button>
            </div>

            <div className="flex flex-col gap-2 mb-4 border-b border-gray-700 pb-2">
               <div className="flex justify-between items-center mb-1">
                 <span className="text-xs text-gray-300">Device Location:</span>
                 <select 
                   className="bg-gray-800 border border-gray-600 text-gray-400 text-[10px] px-2 py-1 rounded outline-none"
                   onChange={(e) => console.log('Device location changed:', e.target.value)}
                 >
                   <option value="Pz">Pz (Parietal - Spatial Navigation)</option>
                   <option value="Cz">Cz (Motor - Kinetic Railgun)</option>
                   <option value="Oz">Oz (Occipital - Fractal Zoom)</option>
                   <option value="Dlpfc">F3/F4 (DLPFC - Gravity Shield)</option>
                   <option value="Fp">Fp (Frontopolar - Quantum Shift)</option>
                 </select>
               </div>
               
               <div className="flex justify-between items-center mb-1">
                 <span className="text-xs text-gray-300">Control Paradigm:</span>
                 <button 
                   onClick={() => { if (controlMode === 'Motor') setControlMode('Sweep'); else if (controlMode === 'Sweep') setControlMode('Resonance'); else setControlMode('Motor'); }}
                   className={`px-2 py-1 text-[10px] rounded border transition-colors ${controlMode === 'Motor' ? 'border-yellow-500 text-yellow-400 bg-yellow-900/40' : controlMode === 'Sweep' ? 'border-cyan-500 text-cyan-400 bg-cyan-900/40' : 'border-green-500 text-green-400 bg-green-900/40'}`}>
                   {controlMode === 'Motor' ? 'MOTOR (18-36Hz)' : controlMode === 'Sweep' ? 'SWEEP (Look-Ahead)' : 'RESONANCE LOCK'}
                 </button>
               </div>
               
               <div className="flex justify-between items-center mb-1">
                 <span className="text-[10px] text-gray-400 uppercase">Input Blend: {morphOverride}</span>
                 <button 
                   onClick={() => setMorphOverride(morphOverride === 'Auto' ? 'Manual' : 'Auto')}
                   className={`px-2 py-1 text-[10px] rounded border transition-colors ${morphOverride === 'Manual' ? 'border-orange-500 text-orange-400 bg-orange-900/40' : 'border-gray-500 text-gray-400 bg-gray-900/40'}`}>
                   {morphOverride === 'Manual' ? 'MANUAL FIX' : 'CULTIVATION TIE'}
                 </button>
               </div>
               
               {morphOverride === 'Manual' && (
                 <div className="mb-1 text-[10px]">
                    <div className="flex justify-between mb-1 text-gray-400">
                        <span>Manual Blend:</span>
                        <span>{(manualBlend * 100).toFixed(0)}% Semantic</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.01" value={manualBlend} onChange={(e) => setManualBlend(parseFloat(e.target.value))} className="w-full accent-fuchsia-500 cursor-pointer" />
                 </div>
               )}
            </div>
            
            <div className="mb-4">
              <button 
                onClick={() => {
                  setIsMenuMinimized(true);
                  if (engineRef.current) engineRef.current.isPaused = false;
                  setTimeout(() => globalXrStore.enterVR(), 100);
                }}
                className="w-full py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded tracking-widest uppercase border border-green-400 shadow-[0_0_10px_rgba(34,197,94,0.5)] transition-all"
              >
                ENTER VIRTUAL REALITY
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-1 mb-4 text-[9px]">
              <button 
                onClick={() => setActivityMode('Refining')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'Refining' ? 'border-yellow-400 bg-yellow-900/40 text-yellow-200' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                PILL REFINING
              </button>
              <button 
                onClick={() => setActivityMode('Topology')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'Topology' ? 'border-orange-400 bg-orange-900/40 text-orange-200' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                TOPOLOGY CIRCLE
              </button>
              <button 
                onClick={() => setActivityMode('RhythmDJ')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'RhythmDJ' ? 'border-cyan-400 bg-cyan-900/40 text-cyan-200' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                RHYTHM LAW
              </button>
              <button 
                onClick={() => setActivityMode('BrainMaze')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'BrainMaze' ? 'border-green-400 bg-green-900/40 text-green-200' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                PZ MAZE
              </button>
              <button 
                onClick={() => setActivityMode('Arena')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'Arena' ? 'border-red-400 bg-red-900/40 text-red-200' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                PZ ARENA
              </button>
              <button 
                onClick={() => setActivityMode('CzRailgun')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'CzRailgun' ? 'border-blue-400 bg-blue-900/40 text-blue-200 shadow-[0_0_8px_blue]' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                CZ RAILGUN
              </button>
              <button 
                onClick={() => setActivityMode('DlpfcMonolith')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'DlpfcMonolith' ? 'border-amber-400 bg-amber-900/40 text-amber-200 shadow-[0_0_8px_amber]' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                DLPFC MONOLITH
              </button>
              <button 
                onClick={() => setActivityMode('OzFractal')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'OzFractal' ? 'border-indigo-400 bg-indigo-900/40 text-indigo-200 shadow-[0_0_8px_indigo]' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                OZ FRACTAL ZOOM
              </button>
              <button 
                onClick={() => setActivityMode('FpQuantumShift')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'FpQuantumShift' ? 'border-purple-400 bg-purple-900/40 text-purple-200 shadow-[0_0_8px_purple]' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                FP QUANTUM SHIFT
              </button>
              <button 
                onClick={() => setActivityMode('DroneRacing')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'DroneRacing' ? 'border-teal-400 bg-teal-900/40 text-teal-200 shadow-[0_0_8px_teal]' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                DRONE RACING
              </button>
              <button 
                onClick={() => setActivityMode('StuntRacing')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'StuntRacing' ? 'border-pink-400 bg-pink-900/40 text-pink-200 shadow-[0_0_8px_pink]' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                STUNT RC
              </button>
              <button 
                onClick={() => setActivityMode('RoboArm')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'RoboArm' ? 'border-sky-400 bg-sky-900/40 text-sky-200 shadow-[0_0_8px_sky]' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                ROBO ARM
              </button>
              <button 
                onClick={() => setActivityMode('ArcAgi')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'ArcAgi' ? 'border-fuchsia-400 bg-fuchsia-900/40 text-fuchsia-200 shadow-[0_0_8px_fuchsia]' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                ARC AGI 3
              </button>
              <button 
                onClick={() => setActivityMode('PhaseVortex')}
                className={`border py-1 text-center transition-colors cursor-pointer ${activityMode === 'PhaseVortex' ? 'border-lime-400 bg-lime-900/40 text-lime-200 shadow-[0_0_8px_lime]' : 'border-gray-700 hover:border-gray-500 text-gray-400'}`}>
                PHASE VORTEX
              </button>
            </div>

            {(activityMode === 'Arena' || activityMode === 'BrainMaze' || activityMode === 'RoboArm' || activityMode === 'PhaseVortex') && (
               <div className="flex flex-col gap-2 mb-4 border-b border-gray-700 pb-2">
                 {(activityMode === 'Arena' || activityMode === 'BrainMaze') && (
                   <>
                     <div className="flex justify-between items-center mb-1">
                       <span className="text-[10px] text-gray-400 uppercase">Camera View:</span>
                       <button 
                         onClick={() => setViewMode(viewMode === 'World' ? 'ThirdPerson' : 'World')}
                         className="px-2 py-1 text-[10px] border border-cyan-700 bg-cyan-900/30 text-cyan-300 rounded uppercase">
                         {viewMode}
                       </button>
                     </div>
                   </>
                 )}
                 {activityMode === 'Arena' && (
                   <>
                     <div className="border border-green-500/30 bg-green-950/20 rounded p-2 mb-2 mt-2">
                       <div className="flex justify-between items-center mb-1.5">
                         <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Morphing Arena:</span>
                         <button 
                           onClick={() => {
                             const nextMode = morphOverride === 'Auto' ? 'Manual' : 'Auto';
                             setMorphOverride(nextMode);
                           }}
                           className={`px-1.5 py-0.5 text-[9px] border rounded ${morphOverride === 'Auto' ? 'border-green-500 bg-green-950/50 text-green-300' : 'border-yellow-600 bg-yellow-950/30 text-yellow-300'}`}
                         >
                           {morphOverride === 'Auto' ? 'Auto Realm' : 'Manual Blend'}
                         </button>
                       </div>
                       
                       {morphOverride === 'Auto' ? (
                         <div className="text-[9px] text-gray-400 italic">
                           Smoothly blending 2D Gamepad with Semantic Anchor based on your active Realm ({(cultivationState.progress * 100).toFixed(0)}% to next breakthrough).
                         </div>
                       ) : (
                         <div className="flex flex-col gap-1">
                           <div className="flex justify-between items-center text-[10px]">
                             <span className="text-gray-400">Classic (2D)</span>
                             <span className="text-green-400 font-bold">{(manualBlend * 100).toFixed(0)}% Semantic</span>
                           </div>
                           <input 
                             type="range" 
                             min="0" 
                             max="1" 
                             step="0.01" 
                             value={manualBlend} 
                             onChange={(e) => setManualBlend(parseFloat(e.target.value))} 
                             className="w-full accent-green-400 cursor-pointer" 
                           />
                         </div>
                       )}
                     </div>
                   </>
                 )}
                 {activityMode === 'PhaseVortex' && (
                   <div className="flex flex-col gap-2 border border-green-500/30 bg-green-950/20 rounded p-2 mb-2 mt-2">
                     <button 
                         className={`px-2 py-1 text-[10px] border rounded uppercase ${phaseVortexShowLines ? 'border-cyan-500 bg-cyan-900/50 text-cyan-300' : 'border-gray-600 bg-gray-900/30 text-gray-400'}`}
                         onClick={() => setPhaseVortexShowLines(!phaseVortexShowLines)}
                     >
                         {phaseVortexShowLines ? 'HIDE COHERENCE' : 'SHOW COHERENCE'}
                     </button>
                     <button 
                         className={`px-2 py-1 text-[10px] border rounded uppercase ${phaseVortexShowGamepad ? 'border-yellow-500 bg-yellow-900/50 text-yellow-300' : 'border-gray-600 bg-gray-900/30 text-gray-400'}`}
                         onClick={() => setPhaseVortexShowGamepad(!phaseVortexShowGamepad)}
                     >
                         {phaseVortexShowGamepad ? 'HIDE GAMEPAD HYPOTHESIS' : 'SHOW GAMEPAD HYPOTHESIS'}
                     </button>
                     <button 
                         className={`px-2 py-1 text-[10px] border rounded uppercase ${phaseVortexShowProtoGamepads ? 'border-orange-500 bg-orange-900/50 text-orange-300' : 'border-gray-600 bg-gray-900/30 text-gray-400'}`}
                         onClick={() => setPhaseVortexShowProtoGamepads(!phaseVortexShowProtoGamepads)}
                     >
                         {phaseVortexShowProtoGamepads ? 'HIDE PROTO-GAMEPADS' : 'SHOW PROTO-GAMEPADS'}
                     </button>
                   </div>
                 )}
                 <div className="flex flex-col mb-1 mt-2">
                    <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase">
                        <span>Move Sensitivity:</span>
                        <span>{moveSensitivity.toFixed(3)}</span>
                    </div>
                    <input type="range" min="0.001" max="0.5" step="0.001" value={moveSensitivity} onChange={(e) => setMoveSensitivity(parseFloat(e.target.value))} className="w-full accent-green-500 cursor-pointer" />
                 </div>
                 <div className="flex flex-col mb-1 mt-2">
                      <div className="flex justify-between items-center bg-gray-900 border border-gray-800 rounded p-1 mb-1 mt-2">
                        <span className="text-[10px] text-gray-400 uppercase ml-1">Engine Precision</span>
                        <select 
                          value={BleService.getInstance().fastMode ? 'MAX_FPS' : BleService.getInstance().computeStride.toString()}
                          onChange={(e) => {
                            const val = e.target.value;
                            const bleS = BleService.getInstance();
                            if (val === 'MAX_FPS') {
                                bleS.fastMode = true;
                                bleS.computeStride = 8;
                            } else {
                                bleS.fastMode = false;
                                bleS.computeStride = parseInt(val, 10);
                            }
                            forceUpdate({});
                          }}
                          className="bg-black border border-gray-700 text-[10px] text-gray-300 rounded px-1 outline-none">
                          <option value="1">Ultra (1x)</option>
                          <option value="2">High (2x)</option>
                          <option value="4">Low (4x)</option>
                          <option value="MAX_FPS">Max FPS</option>
                        </select>
                      </div>
                 </div>
                      <div className="flex justify-between items-center bg-gray-900 border border-gray-800 rounded p-1 mb-1 mt-2">
                        <span className="text-[10px] text-gray-400 uppercase ml-1">BLE Gain</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowWorkingMemory(!showWorkingMemory)}
                                className={`text-[10px] px-2 py-0.5 rounded transition-colors uppercase font-bold border ${showWorkingMemory ? 'bg-cyan-900/50 text-cyan-300 border-cyan-500' : 'bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700'}`}
                            >
                                {showWorkingMemory ? 'Hide Vector' : 'Show Vector'}
                            </button>
                            <button
                                onClick={() => setShowRawDiagnostics(!showRawDiagnostics)}
                                className={`text-[10px] px-2 py-0.5 rounded transition-colors uppercase font-bold border ${showRawDiagnostics ? 'bg-fuchsia-900/50 text-fuchsia-300 border-fuchsia-500' : 'bg-gray-800 text-gray-400 border-gray-600 hover:bg-gray-700'}`}
                            >
                                {showRawDiagnostics ? 'Hide ADC' : 'Show ADC'}
                            </button>
                            <button 
                              onClick={() => {
                                  const nextGainMap: Record<number, 4 | 8 | 16 | 32> = { 4: 8, 8: 16, 16: 32, 32: 4 };
                                  const newGain = nextGainMap[bleGain];
                                  setBleGain(newGain);
                                  BleService.getInstance().setGain(newGain);
                              }}
                              className="bg-gray-800 hover:bg-gray-700 text-xs px-2 py-0.5 rounded transition-colors text-white"
                            >
                              x{bleGain}
                            </button>
                        </div>
                      </div>
                 {activityMode === 'Arena' && (
                    <>
                      <div className="flex justify-between items-center mb-1 mt-2">
                        <span className="text-[10px] text-gray-400 uppercase">Input: Movement</span>
                        <button 
                          onClick={() => setMovementInput(movementInput === 'BLE' ? 'Gamepad' : 'BLE')}
                          className={`px-2 py-1 text-[10px] border rounded uppercase ${movementInput === 'BLE' ? 'border-cyan-700 bg-cyan-900/30 text-cyan-300' : 'border-gray-500 bg-gray-900/30 text-gray-300'}`}>
                          {movementInput}
                        </button>
                      </div>
                      <div className="flex justify-between items-center mb-1 mt-2">
                        <span className="text-[10px] text-gray-400 uppercase">Input: Orbiters</span>
                        <button 
                          onClick={() => setBladesInput(bladesInput === 'BLE' ? 'Gamepad' : 'BLE')}
                          className={`px-2 py-1 text-[10px] border rounded uppercase ${bladesInput === 'BLE' ? 'border-fuchsia-700 bg-fuchsia-900/30 text-fuchsia-300' : 'border-gray-500 bg-gray-900/30 text-gray-300'}`}>
                          {bladesInput}
                        </button>
                      </div>
                      <div className="flex flex-col mb-1 mt-2">
                         <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase">
                             <span>Blade Count:</span>
                             <span>{bladeCount}</span>
                         </div>
                         <input type="range" min="4" max="64" step="4" value={bladeCount} onChange={(e) => setBladeCount(parseInt(e.target.value))} className="w-full accent-fuchsia-500 cursor-pointer" />
                      </div>
                    </>
                 )}
                 {activityMode === 'RoboArm' && (
                    <>
                      <div className="flex justify-between items-center mb-1 mt-2">
                        <span className="text-[10px] text-gray-400 uppercase">Control Mode:</span>
                        <button 
                          onClick={() => setRoboControlMode(roboControlMode === 'Arcade (IK)' ? 'Joint (Manual)' : 'Arcade (IK)')}
                          className="px-2 py-1 text-[10px] border border-blue-500 bg-blue-900/30 text-blue-300 rounded uppercase">
                          {roboControlMode}
                        </button>
                      </div>
                      {roboControlMode === 'Arcade (IK)' && (
                          <div className="flex justify-between items-center mb-1 mt-2">
                            <span className="text-[10px] text-gray-400 uppercase">Auto-Grab:</span>
                            <button 
                              onClick={() => setRoboAutoGrab(!roboAutoGrab)}
                              className={`px-2 py-1 text-[10px] border rounded uppercase ${roboAutoGrab ? 'border-purple-500 bg-purple-900/30 text-purple-300' : 'border-gray-500 bg-gray-900/30 text-gray-300'}`}>
                              {roboAutoGrab ? 'ON' : 'OFF'}
                            </button>
                          </div>
                      )}
                      <div className="flex justify-between items-center mb-1 mt-2">
                        <span className="text-[10px] text-gray-400 uppercase">Camera View:</span>
                        <button 
                          onClick={() => setRoboCameraView(roboCameraView === 'World' ? 'Gripper FPV' : 'World')}
                          className="px-2 py-1 text-[10px] border border-emerald-500 bg-emerald-900/30 text-emerald-300 rounded uppercase">
                          {roboCameraView}
                        </button>
                      </div>
                    </>
                 )}
                 <div className="flex flex-col mb-1 mt-2">
                    <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase">
                        <span>Auto-Cultivation Progression:</span>
                        <input
                           type="checkbox"
                           className="accent-yellow-500"
                           checked={cultivationState.autoProgression}
                           onChange={(e) => {
                               CultivationEngine.getInstance().autoProgression = e.target.checked;
                               setCultivationState(s => ({ ...s, autoProgression: e.target.checked }));
                           }}
                        />
                    </div>
                 </div>
                 <div className="flex flex-col mb-1 mt-2">
                    <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase">
                        <span>Camera Zoom:</span>
                        <span>{zoomLevel}</span>
                    </div>
                    <input type="range" min="10" max="150" step="1" value={zoomLevel} onChange={(e) => setZoomLevel(parseInt(e.target.value))} className="w-full accent-green-500 cursor-pointer" />
                 </div>
                 
                 <div className="flex flex-col border border-gray-600 bg-black p-2 mt-2">
                   <h3 className="text-xs mb-2 text-fuchsia-400">Multiplayer (P2P)</h3>
                   {peerState.id && !peerState.isHost && peerState.connected === 0 && (
                     <div className="flex gap-2 mb-2">
                       <button onClick={() => MultiplayerService.getInstance().hostGame()} className="bg-fuchsia-900 border border-fuchsia-400 px-2 py-1 text-[10px] flex-1">HOST SPA</button>
                     </div>
                   )}
                   {peerState.isHost && peerState.id && (
                     <div className="text-[10px] text-center mb-2">
                       <span className="text-gray-400 block mb-1">Your ID (Share this):</span>
                       <span className="font-mono text-fuchsia-300 select-all">{peerState.id}</span>
                       <div className="bg-white p-2 mt-2 mx-auto inline-block">
                          <QRCodeSVG value={getJoinUrl(peerState.id)} size={96} />
                       </div>
                     </div>
                   )}
                   {!peerState.isHost && peerState.connected === 0 && (
                     <div className="flex gap-2">
                       <input 
                         type="text" 
                         className="bg-gray-900 border border-gray-500 text-[10px] px-1 w-full text-white" 
                         placeholder="Enter Host ID"
                         value={peerState.joinId} 
                         onChange={(e) => setPeerState(s => ({ ...s, joinId: e.target.value }))} 
                       />
                       <button 
                         onClick={() => MultiplayerService.getInstance().joinGame(peerState.joinId)}
                         className="bg-cyan-900 border border-cyan-400 px-2 py-1 text-[10px]">JOIN</button>
                     </div>
                   )}
                   {peerState.connected > 0 && (
                     <span className="text-[10px] text-green-400 text-center block">Connected to {peerState.connected} peer(s)</span>
                   )}
                 </div>
               </div>
            )}

            <div className="flex flex-col border border-gray-600 bg-black p-2 mt-2 mb-2">
              <h3 className="text-xs mb-2 text-yellow-400">Multi-Device Brain Map</h3>
              <div className="flex gap-2 mb-2 items-center">
                <span className="text-[10px] text-gray-400 uppercase">Link Region:</span>
                <select className="bg-gray-900 border border-gray-500 text-[10px] px-1 h-6 text-white w-full">
                  <option value="dlpfc">DLPFC (Prefrontal)</option>
                  <option value="cz">Cz (Motor Core)</option>
                  <option value="oz">Oz (Visual Cortex)</option>
                  <option value="fp">Fp (Oribitofrontal)</option>
                </select>
              </div>
              <button className="bg-yellow-900/50 border border-yellow-700 px-2 py-1 text-[10px] uppercase w-full">
                Pair Additional Device
              </button>
            </div>

            <div className="flex flex-col border border-gray-600 bg-black p-2 mt-2 mb-2">
              <h3 className="text-xs mb-2 text-green-400">Input Devices</h3>
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" id="useGamepad" checked={useGamepad} onChange={(e) => setUseGamepad(e.target.checked)} />
                <label htmlFor="useGamepad" className="text-[10px] text-gray-300">Enable Gamepad</label>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" id="useKbMouse" checked={useKbMouse} onChange={(e) => setUseKbMouse(e.target.checked)} />
                <label htmlFor="useKbMouse" className="text-[10px] text-gray-300">Enable Keyboard/Mouse</label>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" id="useSensors" checked={useSensors} onChange={(e) => setUseSensors(e.target.checked)} />
                <label htmlFor="useSensors" className="text-[10px] text-gray-300">Enable Gyro/Compass (Sensors)</label>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" id="showIntentArrow" checked={showIntentArrow} onChange={(e) => setShowIntentArrow(e.target.checked)} />
                <label htmlFor="showIntentArrow" className="text-[10px] text-gray-300">Show Intent Arrow (Visual Ray)</label>
              </div>
              <div className="flex justify-between items-center bg-gray-900 border border-gray-800 rounded p-1 mb-2">
                <span className="text-[10px] text-gray-400 uppercase ml-1">Multi-Device Mode</span>
                <select 
                  value={multiDeviceMode}
                  onChange={(e) => setMultiDeviceMode(e.target.value as any)}
                  className="bg-gray-800 text-[10px] border border-gray-700 rounded text-cyan-300 outline-none px-1 py-0.5"
                >
                  <option value="append">Append (Separate)</option>
                  <option value="average">Average (Smooth)</option>
                  <option value="max">Max Amplitude</option>
                  <option value="primary">Primary Only</option>
                </select>
              </div>
              <div className="text-[9px] text-gray-500 mb-2">Hint: Left Ctrl toggles mouse lock (for look). WASD to move.</div>
            </div>

            <div className="flex flex-col border border-gray-600 bg-black p-2 mt-2 mb-2">
              <h3 className="text-xs mb-2 text-indigo-400">Virtual Gamepad (Export)</h3>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="bg-gray-900 border border-gray-500 text-[10px] px-1 w-full text-white outline-none focus:border-indigo-400" 
                    placeholder="ws://127.0.0.1:8765"
                    value={gpExportUrl} 
                    onChange={(e) => setGpExportUrl(e.target.value)} 
                  />
                  <button 
                    onClick={() => {
                        const gpx = GamepadExportService.getInstance();
                        if (gpx.isConnected || gpx.isConnecting) {
                            gpx.disconnect();
                            setGpExportConnected(false);
                        } else {
                            gpx.connect(gpExportUrl);
                        }
                    }}
                    className={`${gpExportConnected ? 'bg-red-900 border-red-400 text-red-100 hover:bg-red-800' : 'bg-indigo-900 border-indigo-400 text-indigo-100 hover:bg-indigo-800'} border px-2 py-1 text-[10px] uppercase font-bold transition-colors`}
                  >
                    {gpExportConnected ? 'STOP' : 'CONN'}
                  </button>
                </div>
                <details className="text-[10px] text-gray-400 cursor-pointer">
                  <summary className="hover:text-gray-300">Show Python Adapter Script (Win/Linux)</summary>
                  <pre className="mt-2 p-2 bg-gray-900 border border-gray-700 text-[9px] overflow-auto select-all max-h-48 text-gray-300 rounded custom-scrollbar">
{`import sys, asyncio, json, websockets
# Windows: pip install websockets vgamepad
# Linux: sudo apt install python3-uinput && pip install websockets python-uinput

IS_LINUX = sys.platform.startswith('linux')

if IS_LINUX:
    import uinput
    events = (
        uinput.BTN_SOUTH, uinput.BTN_EAST, uinput.BTN_WEST, uinput.BTN_NORTH,
        uinput.BTN_TL, uinput.BTN_TR,
        uinput.BTN_SELECT, uinput.BTN_START, uinput.BTN_MODE,
        uinput.BTN_THUMBL, uinput.BTN_THUMBR,
        uinput.BTN_DPAD_UP, uinput.BTN_DPAD_DOWN, uinput.BTN_DPAD_LEFT, uinput.BTN_DPAD_RIGHT,
        uinput.ABS_X + (-32768, 32767, 0, 0), uinput.ABS_Y + (-32768, 32767, 0, 0),
        uinput.ABS_RX + (-32768, 32767, 0, 0), uinput.ABS_RY + (-32768, 32767, 0, 0),
        uinput.ABS_Z + (0, 255, 0, 0), uinput.ABS_RZ + (0, 255, 0, 0),
    )
    device = uinput.Device(events, name="Microsoft X-Box 360 pad", vendor=0x045E, product=0x028E, version=0x0114)
else:
    import vgamepad as vg
    gamepad = vg.VX360Gamepad()

async def handler(ws):
    print("BLE Connected!")
    if IS_LINUX:
        device.emit(uinput.BTN_SOUTH, 1)
        device.emit(uinput.ABS_X, 0)
        device.emit(uinput.ABS_Y, 0)
        device.emit(uinput.ABS_RX, 0)
        device.emit(uinput.ABS_RY, 0)
        device.emit(uinput.ABS_Z, 0)
        device.emit(uinput.ABS_RZ, 0)
        await asyncio.sleep(0.1)
        device.emit(uinput.BTN_SOUTH, 0)
        
    async for msg in ws:
        try:
            d = json.loads(msg)
            axes = d.get('axes', [0]*16)
            
            def a(idx): return axes[idx] if idx < len(axes) else 0.0
            
            if IS_LINUX:
                def scale(v): return int(max(-1.0, min(1.0, v)) * 32767)
                device.emit(uinput.ABS_X, scale(a(0)))
                device.emit(uinput.ABS_Y, scale(a(1)))
                device.emit(uinput.ABS_RX, scale(a(2)))
                device.emit(uinput.ABS_RY, scale(a(3)))
                
                device.emit(uinput.ABS_Z, int(max(0, -a(4)) * 255)) # LT
                device.emit(uinput.ABS_RZ, int(max(0, a(4)) * 255)) # RT
                
                device.emit(uinput.BTN_TL, 1 if a(5) < -0.1 else 0) # L1
                device.emit(uinput.BTN_TR, 1 if a(5) > 0.1 else 0)  # R1
                
                device.emit(uinput.BTN_WEST, 1 if a(6) < -0.1 else 0) # X
                device.emit(uinput.BTN_EAST, 1 if a(6) > 0.1 else 0)  # B
                
                device.emit(uinput.BTN_SOUTH, 1 if a(7) < -0.1 else 0) # A
                device.emit(uinput.BTN_NORTH, 1 if a(7) > 0.1 else 0)  # Y
                
                device.emit(uinput.BTN_DPAD_LEFT, 1 if a(8) < -0.1 else 0)
                device.emit(uinput.BTN_DPAD_RIGHT, 1 if a(8) > 0.1 else 0)
                
                device.emit(uinput.BTN_DPAD_DOWN, 1 if a(9) < -0.1 else 0)
                device.emit(uinput.BTN_DPAD_UP, 1 if a(9) > 0.1 else 0)
            else:
                gamepad.left_joystick_float(x_value_float=a(0), y_value_float=-a(1))
                gamepad.right_joystick_float(x_value_float=a(2), y_value_float=-a(3))
                
                gamepad.left_trigger_float(value_float=max(0, -a(4)))
                gamepad.right_trigger_float(value_float=max(0, a(4)))
                
                if a(5) < -0.1: gamepad.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER)
                else: gamepad.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER)
                
                if a(5) > 0.1: gamepad.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER)
                else: gamepad.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER)
                
                if a(6) < -0.1: gamepad.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_X)
                else: gamepad.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_X)
                
                if a(6) > 0.1: gamepad.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_B)
                else: gamepad.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_B)
                
                if a(7) < -0.1: gamepad.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_A)
                else: gamepad.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_A)
                
                if a(7) > 0.1: gamepad.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_Y)
                else: gamepad.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_Y)
                
                if a(8) < -0.1: gamepad.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_LEFT)
                else: gamepad.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_LEFT)
                
                if a(8) > 0.1: gamepad.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_RIGHT)
                else: gamepad.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_RIGHT)
                
                if a(9) < -0.1: gamepad.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_DOWN)
                else: gamepad.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_DOWN)
                
                if a(9) > 0.1: gamepad.press_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_UP)
                else: gamepad.release_button(button=vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_UP)

                gamepad.update()
        except: pass

async def main():
    import logging
    async with websockets.serve(handler, "127.0.0.1", 8765, logger=logging.getLogger()):
        print("Waiting for ws://127.0.0.1:8765")
        await asyncio.Future()

asyncio.run(main())`}
                  </pre>
                </details>
              </div>
            </div>

            <button 
              onClick={() => setRenderMode(1)} 
              className={`border px-3 py-1 text-sm text-left transition-colors ${renderMode === 1 ? 'border-yellow-400 bg-yellow-900/50 text-yellow-200' : 'border-gray-600 hover:border-gray-400 text-gray-400'}`}>
              Stage I: 32 Axes (Triad)
            </button>
            <button 
              onClick={() => setRenderMode(2)} 
              className={`border px-3 py-1 text-sm text-left transition-colors ${renderMode === 2 ? 'border-blue-400 bg-blue-900/50 text-blue-200' : 'border-gray-600 hover:border-gray-400 text-gray-400'}`}>
              Stage II: 64 Axes (Spectral)
            </button>
            <button 
              onClick={() => setRenderMode(3)} 
              className={`border px-3 py-1 text-sm text-left transition-colors ${renderMode === 3 ? 'border-purple-400 bg-purple-900/50 text-purple-200 shadow-[0_0_8px_purple]' : 'border-gray-600 hover:border-gray-400 text-gray-400'}`}>
              Stage III: {(Object.values(targetEmbeddings)[0] as Float32Array)?.length || 0}D (Blind Synthesis)
            </button>
          </div>

          <div className="flex flex-col gap-2 mb-4">
            <p className="text-[10px] text-gray-400 uppercase border-b border-gray-700 pb-1">Audio Synthesis Integration</p>
            {!audioEnabled ? (
                <button 
                  onClick={initAudio} 
                  className="border px-3 py-1 text-sm text-left transition-colors border-fuchsia-600 bg-fuchsia-900/40 text-fuchsia-300 hover:bg-fuchsia-800 animate-pulse">
                  CHANNEL AUDIO RESONANCE
                </button>
            ) : (
                <div className="flex flex-col gap-2">
                  <div className="border px-3 py-1 text-sm text-left border-fuchsia-800 bg-fuchsia-950/50 text-fuchsia-500 italic">
                    AUDIO RESONANCE ACTIVE
                  </div>
                  <div className="flex flex-col gap-1 text-xs px-1 text-gray-400">
                    <div className="flex justify-between items-center">
                      <span>Signal Spike Rate</span>
                      <span id="spike-rate-text" className="font-mono text-cyan-400">0.000</span>
                    </div>
                    <div className="h-1 w-full bg-gray-800 rounded overflow-hidden relative">
                        <div id="spike-rate-bar" className="h-full bg-cyan-400 transition-all duration-75 ease-out" style={{ width: '0%' }}></div>
                    </div>
                    
                    <div className="flex justify-between mt-2">
                      <span>Sensitivity (Volume Multiplier)</span>
                      <span>{drumSensitivityUi.toFixed(3)}x</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" max="5" step="0.01" 
                      value={drumSensitivityUi}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setDrumSensitivityUi(val);
                        drumSensitivityRef.current = val;
                      }}
                    />
                    <div className="flex justify-between mt-2">
                      <span>Hit Threshold (Noise Gate)</span>
                      <span>{drumThresholdUi.toFixed(2)}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.1" max="15.0" step="0.1" 
                      value={drumThresholdUi}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setDrumThresholdUi(val);
                        drumThresholdRef.current = val;
                      }}
                    />
                    <div className="flex justify-between mt-1">
                      <span>Drum Cooldown (ms)</span>
                      <span>{drumCooldownUi}ms</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" max="500" step="1" 
                      value={drumCooldownUi}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setDrumCooldownUi(val);
                        drumCooldownRef.current = val;
                      }}
                    />
                    <div className="text-[9px] text-gray-600 mt-1 italic">
                      Sensitivity &lt; 0.1 disables drum.
                    </div>
                  </div>
                </div>
            )}
          </div>

          <div className="flex flex-col gap-2 mb-4">
            <p className="text-[10px] text-gray-400 uppercase border-b border-gray-700 pb-1">Neuro-Interface (BLE / Serial)</p>
            {!bleConnected && !InputService.getInstance().isSerialConnected ? (
                <div className="flex flex-col gap-1">
                  <button 
                    onClick={connectBle} 
                    className="border px-3 py-1 text-sm text-left transition-colors border-emerald-600 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800 animate-pulse">
                    CONNECT NEURO HEADSET DIRECTLY (BLE)
                  </button>
                  <button 
                    onClick={async () => {
                      await InputService.getInstance().connectSerial();
                      setActivityMode('BrainMaze');
                      setIsMenuMinimized(true);
                      forceUpdate({});
                    }} 
                    className="border px-3 py-1 text-sm text-left transition-colors border-cyan-600 bg-cyan-900/40 text-cyan-300 hover:bg-cyan-800 animate-pulse">
                    CONNECT ESP32 DONGLE VIA USB SERIAL (ZERO LAG)
                  </button>
                  <button 
                    onClick={enableSensorsOnly} 
                    className="border px-3 py-1 text-[10px] text-left transition-colors border-gray-600 bg-gray-900/40 text-gray-400 hover:bg-gray-800">
                    USE GAMEPAD / DEVICE SENSORS ONLY
                  </button>
                </div>
            ) : (
                <div className="border px-3 py-1 text-sm text-left border-emerald-800 bg-emerald-950/50 text-emerald-500 italic flex flex-col justify-between">
                  <div className="flex justify-between w-full">
                    <span className="flex items-center gap-2">
                       {InputService.getInstance().isSerialConnected ? 'USB SERIAL DONGLE ACTIVE' : 'NEURO LOCK ACTIVE'}
                       <span className="text-[10px] bg-emerald-900 not-italic px-1 rounded text-emerald-300">
                           {InputService.getInstance().isSerialConnected ? '115200' : `x${Math.max(1, BleService.getInstance().devices?.length || 0)}`}
                       </span>
                    </span>
                    <span className="text-[10px] uppercase">
                       <span ref={processTimeRef} className="text-emerald-300 mr-2">0.0ms</span>
                       Synaptic Flow
                    </span>
                  </div>
                  <div className="w-full h-1 bg-gray-900 mt-2 relative overflow-hidden">
                     <div 
                       ref={synapticBarRef}
                       className="h-full bg-cyan-400 absolute left-0 top-0 transition-all duration-100 ease-linear" 
                       style={{ width: '0%' }}
                     />
                  </div>
                  {InputService.getInstance().isSerialConnected ? (
                    <button onClick={async () => {
                      await InputService.getInstance().disconnectSerial();
                      forceUpdate({});
                    }} className="w-full mt-2 text-[10px] text-center bg-red-900/40 hover:bg-red-800 text-red-400 py-1 transition-colors not-italic border border-red-500/20 rounded">
                      DISCONNECT SERIAL DONGLE
                    </button>
                  ) : (
                    <button onClick={connectBle} className="w-full mt-2 text-[10px] text-center bg-emerald-900/40 hover:bg-emerald-800 text-emerald-400 py-1 transition-colors not-italic border border-emerald-500/20 rounded">
                       + ADD ANOTHER DEVICE
                    </button>
                  )}
                </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-gray-400 uppercase border-b border-gray-700 pb-1">Semantic Nav Targets</p>
            
            {ACTIVE_QUEST.targets.map(target => (
              <button 
                key={target.id}
                onClick={() => setCurrentTarget(target)} 
                className={`border px-3 py-1 text-sm text-left transition-colors ${currentTarget.id === target.id ? 'border-cyan-500 bg-cyan-900/50 text-cyan-200' : 'border-gray-600 bg-gray-900/30 text-gray-300 hover:bg-gray-800'}`}>
                {target.id === 'void' ? 'RETURN TO VOID' : `NAVIGATE TO: ${target.name}`}
              </button>
            ))}
          </div>
         </>
        )}
      </div>
    )}
    </div>
  );
}
