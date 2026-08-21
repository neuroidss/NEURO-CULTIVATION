import { InputService } from './InputService';
export const UV_SCALE = (1.2 / 4.0 / 8388607.0) * 1e6;
export const BUF_SIZE = 256;

function fft(re: Float32Array, im: Float32Array) { 
    const n = re.length;
    for (let i = 0, j = 0; i < n; i++) {
        if (j > i) {
            let tr = re[i], ti = im[i];
            re[i] = re[j]; im[i] = im[j];
            re[j] = tr; im[j] = ti;
        }
        let m = n >> 1; 
        while (m >= 1 && j >= m) { j -= m; m >>= 1; }
        j += m;
    }
    for (let s = 2; s <= n; s <<= 1) {
        let m = s >> 1, t = -2 * Math.PI / s, wr = Math.cos(t), wi = Math.sin(t);
        for (let i = 0; i < n; i += s) {
            let ar = 1, ai = 0;
            for (let j = 0; j < m; j++) {
                let u = i + j, v = u + m;
                let tr = ar * re[v] - ai * im[v], ti = ar * im[v] + ai * re[v];
                re[v] = re[u] - tr; im[v] = im[u] - ti; 
                re[u] += tr; im[u] += ti;
                let nar = ar * wr - ai * wi;
                ai = ar * wi + ai * wr;
                ar = nar;
            }
        }
    }
}

function ifft(re: Float32Array, im: Float32Array) {
    for (let i = 0; i < im.length; i++) im[i] = -im[i];
    fft(re, im);
    const n = re.length;
    for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] = -im[i] / n;
    }
}

function applyNotchFilters(re: Float32Array, im: Float32Array) {
    for(let k of [51, 102]) { 
        for(let i=-1; i<=1; i++) { 
            if(re[k+i]!==undefined) {
                re[k+i]=0;
                im[k+i]=0; 
            }
        } 
    }
}

export class BleService {
    private static instance: BleService | null = null;
    
    public numChannels = 16;
    public get coherenceCount() {
        return (this.numChannels * (this.numChannels - 1)) / 2;
    }
    
    public get electrodes() {
        if (this.numChannels === 8) {
            return [
                { x: 3.09, y: 9.51 },
                { x: 8.1, y: 5.89 },
                { x: 8.09, y: -5.88 },
                { x: 3.1, y: -9.51 },
                { x: -3.09, y: -9.5 },
                { x: -8.08, y: -5.87 },
                { x: -8.09, y: 5.89 },
                { x: -3.1, y: 9.51 }
            ];
        } else {
            return [
                { x: 10.14, y: -2.72 },
                { x: 7.43, y: -7.43 },
                { x: 2.75, y: -4.77 },
                { x: 2.72, y: -10.15 },
                { x: -2.72, y: -10.14 },
                { x: -2.75, y: -4.77 },
                { x: -7.42, y: -7.42 },
                { x: -10.14, y: -2.73 },
                { x: -10.14, y: 2.72 },
                { x: -7.43, y: 7.43 },
                { x: -2.75, y: 4.76 },
                { x: -2.72, y: 10.14 },
                { x: 2.72, y: 10.15 },
                { x: 2.75, y: 4.77 },
                { x: 7.43, y: 7.42 },
                { x: 10.14, y: 2.71 }
            ];
        }
    }
    
    public get referenceElectrode() {
        if (this.numChannels === 8) {
            return { x: 10, y: 0 };
        } else {
            return { x: 5.5, y: 0 };
        }
    }
    
    public get groundElectrode() {
        if (this.numChannels === 8) {
            return { x: -10, y: 0 };
        } else {
            return { x: -5.49, y: 0 };
        }
    }
    
    public eegBuffer: Float32Array[] = [];
    public reArr: Float32Array[] = [];
    public imArr: Float32Array[] = [];
    public centered: Float32Array[] = [];
    public normRe: Float32Array[] = [];
    public normIm: Float32Array[] = [];
    
    // Time-domain Normalized Phase signals
    public ptRe: Float32Array[] = [];
    public ptIm: Float32Array[] = [];
    public plgRe: Float32Array[] = [];
    public plgIm: Float32Array[] = [];
    public phgRe: Float32Array[] = [];
    public phgIm: Float32Array[] = [];
    public prevFuturePhasorRe: Float32Array = new Float32Array(120);
    public prevFuturePhasorIm: Float32Array = new Float32Array(120);
    
    public isConnected = false;
    
    public synapticPersistence = 0;
    public rawAxes: Float32Array; // dynamically initialized (Movement / Beta 18-36 Hz)
    public pastAxes: Float32Array; // dynamically initialized (Past/Low Gamma 31-51 Hz)
    public futureAxes: Float32Array; // dynamically initialized (Future/High Gamma 61-102 Hz)
    
    public target_vx = 0;
    public target_vy = 0;
    public target_tq = 0;
    public sweep_vx = 0;
    public sweep_vy = 0;
    public sweep_tq = 0;
    public sweep_pitch = 0;
    public sweep_mag = 0;
    public sweep_persistence = 0;
    public chain_continuity = 0;
    public lastSweepX = 0;
    public lastSweepY = 0;
    
    public deviceAxes: {vx: number, vy: number, tq: number, pitch?: number}[] = [];
    
    public lastTargetX = 0;
    public lastTargetY = 0;

    public processTimeMs = 0;
    public fastMode = false;
    public computeStride = /Mobi|Android/i.test(navigator.userAgent) ? 4 : 1; // Auto-scale for mobile vs desktop

    private lastEegProcess = 0;
    
    private constructor() {
        this.initBuffers(this.numChannels);
    }

    private initBuffers(channels: number) {
        this.numChannels = channels;
        this.rawAxes = new Float32Array(this.coherenceCount);
        this.pastAxes = new Float32Array(this.coherenceCount);
        this.futureAxes = new Float32Array(this.coherenceCount);
        this.eegBuffer = [];
        this.reArr = [];
        this.imArr = [];
        this.centered = [];
        this.normRe = [];
        this.normIm = [];
        this.ptRe = [];
        this.ptIm = [];
        this.plgRe = [];
        this.plgIm = [];
        this.phgRe = [];
        this.phgIm = [];
        for(let i=0; i<channels; i++) {
            this.eegBuffer.push(new Float32Array(BUF_SIZE));
            this.reArr.push(new Float32Array(BUF_SIZE));
            this.imArr.push(new Float32Array(BUF_SIZE));
            this.centered.push(new Float32Array(BUF_SIZE));
            this.normRe.push(new Float32Array(BUF_SIZE));
            this.normIm.push(new Float32Array(BUF_SIZE));
            this.ptRe.push(new Float32Array(BUF_SIZE));
            this.ptIm.push(new Float32Array(BUF_SIZE));
            this.plgRe.push(new Float32Array(BUF_SIZE));
            this.plgIm.push(new Float32Array(BUF_SIZE));
            this.phgRe.push(new Float32Array(BUF_SIZE));
            this.phgIm.push(new Float32Array(BUF_SIZE));
        }
    }

    public static getInstance() {
        if (!BleService.instance) {
            BleService.instance = new BleService();
        }
        return BleService.instance;
    }

    private get_band_ciPLV(idxA: number, idxB: number, k_start: number, k_end: number) {
        let sumIm = 0;
        let count = k_end - k_start + 1;
        for (let k = k_start; k <= k_end; k++) {
            let pA_re = this.normRe[idxA][k], pA_im = this.normIm[idxA][k];
            let pB_re = this.normRe[idxB][k], pB_im = this.normIm[idxB][k];
            sumIm += pA_im * pB_re - pA_re * pB_im;
        }
        return sumIm / count;
    }

    public topologicalConsensus = 0;
    public phaseDrift = 1.0;
    private recentDriftSamples: number[] = [];

    public process() {
        if (!this.isConnected) {
            this.simulateFromGamepad();
            return;
        }
        const time = performance.now();
        if (time - this.lastEegProcess > 33) {
            this.lastEegProcess = time;
            const t0 = performance.now();
            for(let t=0; t<BUF_SIZE; t++) {
                let avg = 0; 
                for(let c=0; c<this.numChannels; c++) avg += this.eegBuffer[c][t]; 
                avg /= this.numChannels;
                for(let c=0; c<this.numChannels; c++) this.centered[c][t] = this.eegBuffer[c][t] - avg;
            }
            
            const f_t = new Float32Array(BUF_SIZE/2);
            const f_lg = new Float32Array(BUF_SIZE/2);
            const f_hg = new Float32Array(BUF_SIZE/2);
            for(let k=0; k<BUF_SIZE/2; k++) {
                 let freq = k * 250.0 / BUF_SIZE;
                 f_t[k] = Math.exp(-0.5 * Math.pow((freq - 6.0) / 1.5, 2)) * 2.0;
                 f_lg[k] = Math.exp(-0.5 * Math.pow((freq - 36.0) / 6.0, 2)) * 2.0;
                 f_hg[k] = Math.exp(-0.5 * Math.pow((freq - 72.0) / 12.0, 2)) * 2.0;
            }

            for(let c=0; c<this.numChannels; c++) {
                for(let t=0; t<BUF_SIZE; t++) { 
                    this.reArr[c][t] = this.centered[c][t]; 
                    this.imArr[c][t] = 0; 
                }
                fft(this.reArr[c], this.imArr[c]); 
                applyNotchFilters(this.reArr[c], this.imArr[c]);
                
                for (let k = 0; k < BUF_SIZE / 2; k++) {
                    let mag = Math.sqrt(this.reArr[c][k] ** 2 + this.imArr[c][k] ** 2) || 1e-6;
                    this.normRe[c][k] = this.reArr[c][k] / mag;
                    this.normIm[c][k] = this.imArr[c][k] / mag;
                }
                
                for(let t=0; t<BUF_SIZE; t++) { this.ptRe[c][t] = 0; this.ptIm[c][t] = 0; }
                for(let k=0; k<BUF_SIZE/2; k++) {
                    this.ptRe[c][k] = this.reArr[c][k] * f_t[k];
                    this.ptIm[c][k] = this.imArr[c][k] * f_t[k];
                }
                ifft(this.ptRe[c], this.ptIm[c]);
                for(let t=0; t<BUF_SIZE; t++) {
                     let mag = Math.sqrt(this.ptRe[c][t]**2 + this.ptIm[c][t]**2) || 1e-6;
                     this.ptRe[c][t] /= mag; this.ptIm[c][t] /= mag;
                }
                
                for(let t=0; t<BUF_SIZE; t++) { this.plgRe[c][t] = 0; this.plgIm[c][t] = 0; }
                for(let k=0; k<BUF_SIZE/2; k++) {
                    this.plgRe[c][k] = this.reArr[c][k] * f_lg[k];
                    this.plgIm[c][k] = this.imArr[c][k] * f_lg[k];
                }
                ifft(this.plgRe[c], this.plgIm[c]);
                for(let t=0; t<BUF_SIZE; t++) {
                     let mag = Math.sqrt(this.plgRe[c][t]**2 + this.plgIm[c][t]**2) || 1e-6;
                     this.plgRe[c][t] /= mag; this.plgIm[c][t] /= mag;
                }
                
                for(let t=0; t<BUF_SIZE; t++) { this.phgRe[c][t] = 0; this.phgIm[c][t] = 0; }
                for(let k=0; k<BUF_SIZE/2; k++) {
                    this.phgRe[c][k] = this.reArr[c][k] * f_hg[k];
                    this.phgIm[c][k] = this.imArr[c][k] * f_hg[k];
                }
                ifft(this.phgRe[c], this.phgIm[c]);
                for(let t=0; t<BUF_SIZE; t++) {
                     let mag = Math.sqrt(this.phgRe[c][t]**2 + this.phgIm[c][t]**2) || 1e-6;
                     this.phgRe[c][t] /= mag; this.phgIm[c][t] /= mag;
                }
            }
            
            const INNER = [5, 2, 10, 13];
            const w_past = new Float32Array(BUF_SIZE);
            const w_future = new Float32Array(BUF_SIZE);
            let sum_past = 0;
            let sum_future = 0;
            
            for(let t=0; t<BUF_SIZE; t++) {
                let re = 0, im = 0;
                for(let c of INNER) {
                    if (c < this.numChannels) {
                        re += this.ptRe[c][t];
                        im += this.ptIm[c][t];
                    }
                }
                let phi = Math.atan2(im, re);
                let wp = Math.max(0, -Math.sin(phi));
                let wf = Math.max(0, Math.sin(phi));
                w_past[t] = wp;
                w_future[t] = wf;
                sum_past += wp;
                sum_future += wf;
            }
            
            for(let t=0; t<BUF_SIZE; t++) {
                 w_past[t] /= (sum_past + 1e-6);
                 w_future[t] /= (sum_future + 1e-6);
            }
            
            let pairIdx = 0;
            let normSq = 0;
            let tvx = 0;
            let tvy = 0;
            let ttq = 0;
            let svx = 0;
            let svy = 0;
            let stq = 0;
            let spitch = 0;
            let inter_chain = 0;
            let norm_past = 0;
            let norm_prev_fut = 0;
            let consensusCount = 0;
            let driftSum = 0;
            
            let sum_move_w = 0, move_cx = 0, move_cy = 0;
            let sum_sweep_w = 0, sweep_cx = 0, sweep_cy = 0;

            const RADIUS = 10;
            const PARAMS = this.electrodes;

            const newDeviceAxes = [];
            const numDevices = this.devices.length || 1; 
            
            let currentOffset = 0;
            for (let d = 0; d < numDevices; d++) {
                let d_vx = 0, d_vy = 0, d_tq = 0;
                let d_channels = this.deviceChannelCounts[d];
                if (!d_channels) {
                     // If device is not yet initialized (waiting for first packet), fallback if it's the only device
                     if (numDevices === 1) d_channels = this.numChannels;
                     else continue; // Otherwise skip uninitialized device
                }
                let d_pairIdx = 0;
                
                for (let i = 0; i < d_channels; i++) {
                    for (let j = i + 1; j < d_channels; j++) {
                         if (currentOffset + i >= this.numChannels || currentOffset + j >= this.numChannels) continue;
                         
                         let move_val = this.get_band_ciPLV(currentOffset + i, currentOffset + j, 18, 36);
                         if (PARAMS[currentOffset + i] && PARAMS[currentOffset + j]) {
                             let dx = PARAMS[currentOffset + j].x - PARAMS[currentOffset + i].x;
                             let dy = PARAMS[currentOffset + j].y - PARAMS[currentOffset + i].y;
                             d_vx += move_val * dx;
                             d_vy += move_val * dy;
                             d_tq += (move_val * (PARAMS[currentOffset + i].x * dy - PARAMS[currentOffset + i].y * dx)) / (RADIUS * 10);
                         }
                         d_pairIdx++;
                    }
                }
                const d_scale = 28.0 / Math.max(1, d_pairIdx);
                newDeviceAxes.push({ vx: d_vx * d_scale, vy: d_vy * d_scale, tq: d_tq * d_scale });
                currentOffset += d_channels;
            }
            this.deviceAxes = newDeviceAxes;

            for(let i=0; i<this.numChannels; i++) {
                for(let j=i+1; j<this.numChannels; j++) {
                    let move_val = this.get_band_ciPLV(i, j, 18, 36); 
                    
                    let psi_past_re = 0, psi_past_im = 0;
                    let psi_future_re = 0, psi_future_im = 0;
                    
                    if (!this.fastMode) {
                        for(let t=0; t<BUF_SIZE; t+=this.computeStride) {
                             let cross_lg_re = this.plgRe[i][t] * this.plgRe[j][t] + this.plgIm[i][t] * this.plgIm[j][t];
                             let cross_lg_im = this.plgIm[i][t] * this.plgRe[j][t] - this.plgRe[i][t] * this.plgIm[j][t];
                             psi_past_re += cross_lg_re * w_past[t] * this.computeStride;
                             psi_past_im += cross_lg_im * w_past[t] * this.computeStride;
                             
                             let cross_hg_re = this.phgRe[i][t] * this.phgRe[j][t] + this.phgIm[i][t] * this.phgIm[j][t];
                             let cross_hg_im = this.phgIm[i][t] * this.phgRe[j][t] - this.phgRe[i][t] * this.phgIm[j][t];
                             psi_future_re += cross_hg_re * w_future[t] * this.computeStride;
                             psi_future_im += cross_hg_im * w_future[t] * this.computeStride;
                        }
                    }
                    
                    let sweep_iplv = psi_future_im * psi_past_re - psi_future_re * psi_past_im;
                    
                    let prev_fut_re = this.prevFuturePhasorRe[pairIdx] || 0;
                    let prev_fut_im = this.prevFuturePhasorIm[pairIdx] || 0;
                    inter_chain += psi_past_re * prev_fut_re + psi_past_im * prev_fut_im;
                    norm_past += psi_past_re*psi_past_re + psi_past_im*psi_past_im;
                    norm_prev_fut += prev_fut_re*prev_fut_re + prev_fut_im*prev_fut_im;
                    
                    this.prevFuturePhasorRe[pairIdx] = psi_future_re;
                    this.prevFuturePhasorIm[pairIdx] = psi_future_im;
                    
                    if (PARAMS[i] && PARAMS[j]) {
                        let dx = PARAMS[j].x - PARAMS[i].x;
                        let dy = PARAMS[j].y - PARAMS[i].y;
                        
                        let w_move = Math.abs(move_val);
                        sum_move_w += w_move;
                        move_cx += w_move * PARAMS[i].x;
                        move_cy += w_move * PARAMS[i].y;
                        
                        tvx += move_val * dx;
                        tvy += move_val * dy;
                        ttq += (move_val * (PARAMS[i].x * dy - PARAMS[i].y * dx)) / (RADIUS * 10);
                        
                        let sweep_val = sweep_iplv * 12.0;
                        let w_sweep = Math.abs(sweep_val);
                        sum_sweep_w += w_sweep;
                        sweep_cx += w_sweep * PARAMS[i].x;
                        sweep_cy += w_sweep * PARAMS[i].y;
                        
                        svx += sweep_val * dx;
                        svy += sweep_val * dy;
                        stq += (sweep_val * (PARAMS[i].x * dy - PARAMS[i].y * dx)) / (RADIUS * 10);
                        spitch += (sweep_val * (PARAMS[i].x * dx + PARAMS[i].y * dy)) / (RADIUS * 10);
                    }

                    if (Math.abs(move_val) > 0.3) {
                        consensusCount++;
                    }

                    driftSum += Math.abs(move_val - this.rawAxes[pairIdx]);
                    
                    this.rawAxes[pairIdx] = move_val; 
                    this.pastAxes[pairIdx] = psi_past_im; 
                    this.futureAxes[pairIdx] = psi_future_im; 
                    normSq += move_val * move_val;
                    pairIdx++;
                }
            }
            
            // --- CENTROID CORRECTION ---
            // Remove linear translation artifacts from rotation (Sagitta)
            if (sum_sweep_w > 0.001) {
                sweep_cx /= sum_sweep_w;
                sweep_cy /= sum_sweep_w;
                stq -= (sweep_cx * svy - sweep_cy * svx) / (RADIUS * 10);
                spitch -= (sweep_cx * svx + sweep_cy * svy) / (RADIUS * 10);
            }
            if (sum_move_w > 0.001) {
                move_cx /= sum_move_w;
                move_cy /= sum_move_w;
                ttq -= (move_cx * tvy - move_cy * tvx) / (RADIUS * 10);
            }
            
            this.topologicalConsensus = consensusCount;
            this.recentDriftSamples.push(driftSum);
            if (this.recentDriftSamples.length > 50) this.recentDriftSamples.shift();
            let avgDrift = this.recentDriftSamples.reduce((a, b) => a + b, 0) / this.recentDriftSamples.length;
            this.phaseDrift = Math.min(1.0, avgDrift * 0.5);

            const scale = 28.0 / Math.max(1, pairIdx);
            
            this.target_vx = tvx * scale;
            this.target_vy = tvy * scale;
            this.target_tq = ttq * scale;
            
            norm_past = Math.sqrt(norm_past);
            norm_prev_fut = Math.sqrt(norm_prev_fut);
            let chain_coherence = Math.max(-1.0, Math.min(1.0, inter_chain / (norm_past * norm_prev_fut + 1e-6)));
            let chain_weight = Math.max(0.0, Math.min(1.0, 0.3 + 0.7 * chain_coherence));
            this.chain_continuity = chain_coherence;
            
            this.sweep_vx = svx * scale * chain_weight;
            this.sweep_vy = svy * scale * chain_weight;
            this.sweep_tq = stq * scale * chain_weight;
            this.sweep_pitch = spitch * scale * chain_weight;
            
            this.sweep_mag = Math.sqrt(this.sweep_vx ** 2 + this.sweep_vy ** 2);
            let dot_sw = this.sweep_vx * this.lastSweepX + this.sweep_vy * this.lastSweepY;
            let cos_sw = dot_sw / (this.sweep_mag * Math.sqrt(this.lastSweepX ** 2 + this.lastSweepY ** 2) + 1e-6);
            if (this.sweep_mag > 0.05 && cos_sw > 0.8) {
                this.sweep_persistence = Math.min(1.0, this.sweep_persistence + 0.05);
            } else {
                this.sweep_persistence *= 0.95;
            }
            this.lastSweepX = this.sweep_vx;
            this.lastSweepY = this.sweep_vy;

            let mag = Math.sqrt(this.target_vx ** 2 + this.target_vy ** 2);
            let dot = this.target_vx * this.lastTargetX + this.target_vy * this.lastTargetY;
            let cosTheta = dot / (mag * Math.sqrt(this.lastTargetX ** 2 + this.lastTargetY ** 2) + 1e-6);
            
            if (mag > 0.05 && cosTheta > 0.8) {
                this.synapticPersistence = Math.min(1.0, this.synapticPersistence + 0.05);
            } else {
                this.synapticPersistence *= 0.95;
            }
            this.lastTargetX = this.target_vx;
            this.lastTargetY = this.target_vy;
            
            this.processTimeMs = performance.now() - t0;
        }
    }

    public simulateFromGamepad() {
        const time = performance.now();
        if (time - this.lastEegProcess > 33) {
            this.lastEegProcess = time;
            const input = InputService.getInstance();
            let pairIdx = 0;
            let consensusCount = 0;

            for(let i=0; i<this.numChannels; i++) {
                for(let j=i+1; j<this.numChannels; j++) {
                    let move_val = input.rawAxes[0] * Math.sin(i+j) + input.rawAxes[1] * Math.cos(i-j);
                    
                    let valPast = 0.5 + Math.sin(i * 2 + j) * 0.5 * Math.abs(input.rawAxes[4] + 0.1); 
                    
                    let isShift = Math.abs(input.rawAxes[6]) > 0.5 || Math.abs(input.rawAxes[7]) > 0.5;
                    let valFuture = isShift ? (Math.cos(i - j * 2) * 0.5) : (valPast + Math.cos(time/1000 + i) * 0.1);
                    
                    if (Math.abs(move_val) > 0.3) {
                        consensusCount++;
                    }
                    
                    this.rawAxes[pairIdx] = move_val;
                    this.pastAxes[pairIdx] = valPast;
                    this.futureAxes[pairIdx] = valFuture;
                    
                    pairIdx++;
                }
            }
            
            this.topologicalConsensus = consensusCount;
            this.target_vx = input.rawAxes[0] * 5.0;
            this.target_vy = input.rawAxes[1] * 5.0;
            this.target_tq = input.rawAxes[2] * 2.0;
            let isAuto = Math.abs(input.rawAxes[6]) > 0.5 || Math.abs(input.rawAxes[7]) > 0.5;
            this.sweep_vx = (isAuto ? input.rawAxes[0] : input.rawAxes[2]) * 5.0;
            this.sweep_vy = (isAuto ? input.rawAxes[1] : input.rawAxes[3]) * 5.0;
            this.sweep_tq = 0.0;
            
            this.sweep_mag = Math.sqrt(this.sweep_vx ** 2 + this.sweep_vy ** 2);
            let dot_sw = this.sweep_vx * this.lastSweepX + this.sweep_vy * this.lastSweepY;
            let cos_sw = dot_sw / (this.sweep_mag * Math.sqrt(this.lastSweepX ** 2 + this.lastSweepY ** 2) + 1e-6);
            if (this.sweep_mag > 0.05 && cos_sw > 0.8) {
                this.sweep_persistence = Math.min(1.0, this.sweep_persistence + 0.05);
            } else {
                this.sweep_persistence *= 0.95;
            }
            this.lastSweepX = this.sweep_vx;
            this.lastSweepY = this.sweep_vy;
            this.chain_continuity = isAuto ? 0.85 : (this.sweep_mag > 0.1 ? 0.6 : 0.1);

            this.deviceAxes = [
                { vx: input.rawAxes[0] * 5.0, vy: input.rawAxes[1] * 5.0, tq: input.rawAxes[2] * 2.0 },
                { vx: input.rawAxes[2] * 5.0, vy: input.rawAxes[3] * 5.0, tq: input.rawAxes[4] * 2.0 }
            ];

            let mag = Math.sqrt(this.target_vx ** 2 + this.target_vy ** 2);
            if (mag > 0.05 || Math.abs(input.rawAxes[4]) > 0.1) {
                this.synapticPersistence = Math.min(1.0, this.synapticPersistence + 0.05);
            } else {
                this.synapticPersistence *= 0.95;
            }
            this.processTimeMs = 1.2; 
        }
    }
    
    public cmdChar: any | null = null;
    public devices: any[] = [];
    public dataChars: any[] = [];
    public deviceChannelCounts: number[] = [];
    
    private pendingReadResolve: ((val: number) => void) | null = null;
    private pendingReadReg: number = -1;

    public async readRegister(reg: number): Promise<number> {
        if (!this.cmdChar) return -1;
        return new Promise((resolve) => {
            this.pendingReadReg = reg;
            this.pendingReadResolve = resolve;
            this.cmdChar.writeValue(new Uint8Array([reg])).catch(() => resolve(-1));
            // timeout
            setTimeout(() => {
                if (this.pendingReadResolve) {
                    this.pendingReadResolve(-1);
                    this.pendingReadResolve = null;
                }
            }, 500);
        });
    }

    public async setGain(gainValue: 4 | 8 | 16 | 32) {
        if (!this.cmdChar) return;
        let hex = 0x22;
        if (gainValue === 8) hex = 0x33;
        else if (gainValue === 16) hex = 0x44;
        else if (gainValue === 32) hex = 0x55;
        const expectedVal = (hex << 8) | hex;
        
        for (let attempts = 0; attempts < 5; ++attempts) {
            await this.cmdChar.writeValue(new Uint8Array([0x04, hex, hex])).catch(()=>{});
            await new Promise(r => setTimeout(r, 50));
            const val1 = await this.readRegister(0x04);
            
            await this.cmdChar.writeValue(new Uint8Array([0x05, hex, hex])).catch(()=>{});
            await new Promise(r => setTimeout(r, 50));
            const val2 = await this.readRegister(0x05);
            
            if (val1 === expectedVal && val2 === expectedVal) {
                console.log(`[BleService] Successfully set gain to ${gainValue} (0x${hex.toString(16)})`);
                return;
            }
            console.warn(`[BleService] Failed to set gain to ${gainValue}, retrying... (val1=${val1}, val2=${val2})`);
        }
        console.error(`[BleService] Failed to set gain to ${gainValue} after 5 attempts.`);
    }

    public get totalChannels() {
        return this.deviceChannelCounts.reduce((a, b) => a + b, 0);
    }

    public async connect() {
        try {
            const device = await (navigator as any).bluetooth.requestDevice({ 
                filters: [{ services:["4fafc201-1fb5-459e-8fcc-c5c9c331914b"] }] 
            });
            const server = await device.gatt?.connect();
            if (!server) throw new Error("GATT Server not found");
            
            const service = await server.getPrimaryService("4fafc201-1fb5-459e-8fcc-c5c9c331914b");
            const dataChar = await service.getCharacteristic("beb5483e-36e1-4688-b7f5-ea07361b26a8");
            const cmdChar = await service.getCharacteristic("c0de0001-36e1-4688-b7f5-ea07361b26a8");
            if (!this.cmdChar) {
                this.cmdChar = cmdChar;
                await this.cmdChar.startNotifications();
                this.cmdChar.addEventListener('characteristicvaluechanged', (e: any) => {
                    const b = new Uint8Array(e.target.value.buffer);
                    if (b.length === 3) {
                         const reg = b[0];
                         const val = (b[1] << 8) | b[2];
                         if (this.pendingReadResolve && this.pendingReadReg === reg) {
                             this.pendingReadResolve(val);
                             this.pendingReadResolve = null;
                         }
                    }
                });
            }
            
            await this.setGain(16);
            
            const deviceIndex = this.devices.length;
            this.devices.push(server);
            this.dataChars.push(dataChar);
            this.deviceChannelCounts.push(0);

            await dataChar.startNotifications();
            dataChar.addEventListener('characteristicvaluechanged', (e: any) => {
                const b = new Uint8Array(e.target.value.buffer);
                if(b[0] === 0xA0) {
                    const expectedChannels = Math.floor((b.length - 2) / 3);
                    
                    // Initialize channel count for this device on first packet
                    if (this.deviceChannelCounts[deviceIndex] === 0) {
                         // Default to 16 if expectedChannels is >= 16, otherwise 8
                         const activeChannels = expectedChannels >= 16 ? 16 : (expectedChannels >= 8 ? 8 : expectedChannels);
                         this.deviceChannelCounts[deviceIndex] = activeChannels;
                         
                         const newTotal = this.totalChannels;
                         if (this.numChannels !== newTotal) {
                             this.initBuffers(newTotal);
                         }
                    }
                    
                    const activeChannels = this.deviceChannelCounts[deviceIndex];
                    
                    let channelOffset = 0;
                    for (let d = 0; d < deviceIndex; d++) {
                        channelOffset += this.deviceChannelCounts[d];
                    }

                    for(let i=0; i<activeChannels; i++) {
                        const targetChannel = channelOffset + i;
                        if (targetChannel >= this.numChannels) break;
                        
                        if (4+i*3 >= b.length) break;
                        let v = (b[2+i*3]<<16) | (b[3+i*3]<<8) | b[4+i*3];
                        if(v & 0x800000) v -= 0x1000000;
                        this.eegBuffer[targetChannel].set(this.eegBuffer[targetChannel].subarray(1)); 
                        this.eegBuffer[targetChannel][BUF_SIZE-1] = v * UV_SCALE;
                    }
                    this.process();
                }
            });
            
            this.isConnected = true;
            return true;
        } catch(e) {
            console.error("BLE Connect failed:", e);
            throw e;
        }
    }
}
