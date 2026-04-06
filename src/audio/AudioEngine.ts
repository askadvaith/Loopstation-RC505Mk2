/**
 * AudioEngine — Singleton managing the global AudioContext and audio routing.
 *
 * Signal flow:
 *   Mic/Input → InputGainNode → [InputFX chain] → per-track recording
 *   per-track playback → [TrackFX chain] → TrackGainNode → MasterGain → destination
 */

import { EffectsChain, FXSequencer, createDefaultChainState, createDefaultSequenceState } from './effects';
import type { FXBankId, FXChainState, FXSequenceState } from './effects';

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  public ctx: AudioContext;
  public masterGain: GainNode;
  public inputGain: GainNode;
  public micStream: MediaStream | null = null;
  public micSource: MediaStreamAudioSourceNode | null = null;

  /* Analysis */
  public inputAnalyser: AnalyserNode;
  public masterAnalyser: AnalyserNode;

  /* Input FX Chain (Phase 4) */
  public inputFXChain: EffectsChain;
  public inputFXSequencer: FXSequencer;
  public inputFXOutput: GainNode;

  /* Track FX Chains (Phase 4) — one per track, instantiated when tracks register */
  public trackFXChains: Map<number, EffectsChain> = new Map();
  public trackFXSequencers: Map<number, FXSequencer> = new Map();

  private constructor() {
    this.ctx = new AudioContext({ sampleRate: 44100 });

    // Master output chain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;

    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    // Input chain
    this.inputGain = this.ctx.createGain();
    this.inputGain.gain.value = 1.0;

    this.inputAnalyser = this.ctx.createAnalyser();
    this.inputAnalyser.fftSize = 2048;

    // Input FX chain: inputGain → inputFXChain → inputFXOutput → inputAnalyser
    this.inputFXChain = new EffectsChain(this.ctx, false);
    this.inputFXSequencer = new FXSequencer(this.inputFXChain);

    this.inputFXOutput = this.ctx.createGain();
    this.inputFXOutput.gain.value = 1.0;

    this.inputGain.connect(this.inputFXChain.inputNode);
    this.inputFXChain.outputNode.connect(this.inputFXOutput);
    this.inputFXOutput.connect(this.inputAnalyser);
  }

  static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  /** Ensure the AudioContext is running (must be called from user gesture). */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /** Request microphone access and wire it into the input chain. */
  async connectMicrophone(): Promise<void> {
    if (this.micStream) return; // already connected

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100,
        },
      });
      this.micSource = this.ctx.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.inputGain);
    } catch (err) {
      console.error('[AudioEngine] Microphone access denied:', err);
      throw err;
    }
  }

  /** Disconnect and release the microphone. */
  disconnectMicrophone(): void {
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micStream) {
      for (const track of this.micStream.getTracks()) {
        track.stop();
      }
      this.micStream = null;
    }
  }

  /** Set the master output volume (0–2, where 1 = unity). */
  setMasterVolume(value: number): void {
    this.masterGain.gain.setTargetAtTime(
      Math.max(0, Math.min(2, value)),
      this.ctx.currentTime,
      0.01
    );
  }

  /** Set the input gain (0–2). */
  setInputGain(value: number): void {
    this.inputGain.gain.setTargetAtTime(
      Math.max(0, Math.min(2, value)),
      this.ctx.currentTime,
      0.01
    );
  }

  /** Get the current time from the AudioContext (seconds). */
  get currentTime(): number {
    return this.ctx.currentTime;
  }

  /** Get the sample rate. */
  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  /* ═══════════════════════════════════════════════════════════════
   * Phase 3 — Loop Coordination, Tempo, Play Mode, Bounce
   * ═══════════════════════════════════════════════════════════════ */

  /* Tempo & Time Signature */
  private _tempo = 120;
  private _timeSignature = 4; // beats per measure

  get tempo(): number { return this._tempo; }
  set tempo(bpm: number) { this._tempo = Math.max(40, Math.min(300, bpm)); }

  get timeSignature(): number { return this._timeSignature; }
  set timeSignature(ts: number) { this._timeSignature = Math.max(1, Math.min(15, ts)); }

  get samplesPerBeat(): number {
    return Math.round((60 / this._tempo) * this.sampleRate);
  }

  get samplesPerMeasure(): number {
    return this.samplesPerBeat * this._timeSignature;
  }

  /* Master Loop (established by first loop-synced recording) */
  private _masterLoopLengthSamples = 0;
  private _masterLoopStartTime = 0;

  get masterLoopLengthSamples(): number { return this._masterLoopLengthSamples; }

  setMasterLoopLength(samples: number): void {
    this._masterLoopLengthSamples = samples;
  }

  setMasterLoopStartTime(time: number): void {
    this._masterLoopStartTime = time;
  }

  /** Get current position within the master loop (0–1 normalized). */
  getMasterLoopPosition(): number {
    if (this._masterLoopLengthSamples === 0) return 0;
    const elapsed = this.ctx.currentTime - this._masterLoopStartTime;
    const loopDuration = this._masterLoopLengthSamples / this.sampleRate;
    if (loopDuration <= 0) return 0;
    return (elapsed % loopDuration) / loopDuration;
  }

  /** Reset master loop (e.g. when all tracks are cleared). */
  resetMasterLoop(): void {
    this._masterLoopLengthSamples = 0;
    this._masterLoopStartTime = 0;
  }

  /* Play Mode */
  private _playMode: 'multi' | 'single' = 'multi';
  get playMode(): 'multi' | 'single' { return this._playMode; }
  set playMode(mode: 'multi' | 'single') { this._playMode = mode; }

  /* Track Registration (for bounce & cross-track coordination) */
  private trackOutputNodes: Map<number, { node: AudioNode; getState: () => string }> = new Map();

  /** Register a track's output node and state getter (called from LoopTrack constructor). */
  registerTrack(id: number, outputNode: AudioNode, getState: () => string): void {
    this.trackOutputNodes.set(id, { node: outputNode, getState });
  }

  /** Get output nodes of other tracks that are currently playing (for bounce). */
  getOtherTrackOutputNodes(excludeId: number): AudioNode[] {
    const nodes: AudioNode[] = [];
    for (const [id, info] of this.trackOutputNodes) {
      if (id !== excludeId) {
        const state = info.getState();
        if (state === 'playing' || state === 'overdubbing') {
          nodes.push(info.node);
        }
      }
    }
    return nodes;
  }

  /* Quantize Helpers */

  /** Calculate the AudioContext time of the next measure boundary. */
  quantizeToNextMeasure(): number {
    const measureDuration = this.samplesPerMeasure / this.sampleRate;
    if (measureDuration <= 0) return this.ctx.currentTime;

    if (this._masterLoopLengthSamples > 0) {
      const loopDuration = this._masterLoopLengthSamples / this.sampleRate;
      const elapsed = this.ctx.currentTime - this._masterLoopStartTime;
      const pos = ((elapsed % loopDuration) + loopDuration) % loopDuration;
      const nextBoundary = Math.ceil(pos / measureDuration) * measureDuration;
      const delay = nextBoundary - pos;
      return this.ctx.currentTime + (delay < 0.01 ? measureDuration : delay);
    }

    // No master loop — use absolute time
    return this.ctx.currentTime + measureDuration;
  }

  /** Snap a sample length to the nearest whole number of measures. */
  quantizeLengthToMeasures(lengthSamples: number): number {
    const spm = this.samplesPerMeasure;
    if (spm <= 0) return lengthSamples;
    return Math.max(spm, Math.round(lengthSamples / spm) * spm);
  }

  /* ═══════════════════════════════════════════════════════════════
   * Phase 4 — Input FX Chain Control
   * ═══════════════════════════════════════════════════════════════ */

  /** Set the active bank for Input FX. */
  setInputFXActiveBank(bankId: FXBankId): void {
    this.inputFXChain.setActiveBank(bankId);
  }

  /** Toggle an Input FX bank on/off. */
  toggleInputFXBank(bankId: FXBankId): void {
    this.inputFXChain.toggleBankSw(bankId);
  }

  /** Set an Input FX bank on/off. */
  setInputFXBankSw(bankId: FXBankId, sw: boolean): void {
    this.inputFXChain.setBankSw(bankId, sw);
  }

  /** Set a slot's FX type on the Input FX chain. */
  setInputFXSlotType(bankId: FXBankId, slotIdx: number, fxType: string): void {
    this.inputFXChain.setSlotFXType(bankId, slotIdx, fxType);
  }

  /** Toggle a slot's sw on the Input FX chain. */
  setInputFXSlotSw(bankId: FXBankId, slotIdx: number, sw: boolean): void {
    this.inputFXChain.setSlotSw(bankId, slotIdx, sw);
  }

  /** Set a slot's parameter on the Input FX chain. */
  setInputFXSlotParam(bankId: FXBankId, slotIdx: number, paramName: string, value: number): void {
    this.inputFXChain.setSlotParam(bankId, slotIdx, paramName, value);
  }

  /** Get the Input FX chain state for persistence/UI sync. */
  getInputFXState(): FXChainState {
    return this.inputFXChain.exportState();
  }

  /** Load a complete Input FX chain state. */
  loadInputFXState(state: FXChainState): void {
    this.inputFXChain.loadState(state);
  }

  /* ═══════════════════════════════════════════════════════════════
   * Phase 4 — Track FX Chain Control
   * ═══════════════════════════════════════════════════════════════ */

  /** Create a Track FX chain for a given track (called from LoopTrack). */
  createTrackFXChain(trackId: number): EffectsChain {
    if (this.trackFXChains.has(trackId)) {
      return this.trackFXChains.get(trackId)!;
    }
    const chain = new EffectsChain(this.ctx, true);
    const seq = new FXSequencer(chain);
    this.trackFXChains.set(trackId, chain);
    this.trackFXSequencers.set(trackId, seq);
    return chain;
  }

  /** Get the Track FX chain for a given track. */
  getTrackFXChain(trackId: number): EffectsChain | undefined {
    return this.trackFXChains.get(trackId);
  }

  /** Set the active bank for a Track FX chain. */
  setTrackFXActiveBank(trackId: number, bankId: FXBankId): void {
    this.trackFXChains.get(trackId)?.setActiveBank(bankId);
  }

  /** Toggle a Track FX bank on/off. */
  toggleTrackFXBank(trackId: number, bankId: FXBankId): void {
    this.trackFXChains.get(trackId)?.toggleBankSw(bankId);
  }

  /** Set a Track FX bank on/off. */
  setTrackFXBankSw(trackId: number, bankId: FXBankId, sw: boolean): void {
    this.trackFXChains.get(trackId)?.setBankSw(bankId, sw);
  }

  /** Set a slot's FX type on a Track FX chain. */
  setTrackFXSlotType(trackId: number, bankId: FXBankId, slotIdx: number, fxType: string): void {
    this.trackFXChains.get(trackId)?.setSlotFXType(bankId, slotIdx, fxType);
  }

  /** Toggle a slot's sw on a Track FX chain. */
  setTrackFXSlotSw(trackId: number, bankId: FXBankId, slotIdx: number, sw: boolean): void {
    this.trackFXChains.get(trackId)?.setSlotSw(bankId, slotIdx, sw);
  }

  /** Set a slot's parameter on a Track FX chain. */
  setTrackFXSlotParam(trackId: number, bankId: FXBankId, slotIdx: number, paramName: string, value: number): void {
    this.trackFXChains.get(trackId)?.setSlotParam(bankId, slotIdx, paramName, value);
  }

  /** Get a Track FX chain state. */
  getTrackFXState(trackId: number): FXChainState | undefined {
    return this.trackFXChains.get(trackId)?.exportState();
  }

  /** Load a complete Track FX chain state. */
  loadTrackFXState(trackId: number, state: FXChainState): void {
    this.trackFXChains.get(trackId)?.loadState(state);
  }
}
