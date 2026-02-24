/**
 * LoopTrack — One of 5 stereo loop tracks (Phase 3: Full Loop Engine).
 *
 * Features:
 *   - DUB MODE: overdub (layer), replace1 (overwrite + monitor), replace2 (overwrite silent)
 *   - REVERSE playback
 *   - 1SHOT mode (play once, retrigger)
 *   - LOOP SYNC (align to master loop)
 *   - QUANTIZE (snap record start/stop to measure)
 *   - AUTO REC (threshold-triggered recording)
 *   - MEASURE (auto/free/manual bar count)
 *   - TEMPO SYNC + SPEED (half/normal/double)
 *   - Undo/Redo (single-level per track)
 *   - Mark Back (snapshot recall)
 *   - REC Back (return to post-first-recording state)
 *   - Fade in/out (START MODE / STOP MODE)
 *   - BOUNCE (mix other tracks into recording)
 *
 * State machine:
 *   EMPTY → REC-STANDBY → RECORDING → PLAYING ↔ OVERDUBBING → STOPPED
 *   Stop modes: → FADING-OUT → STOPPED  |  → STOPPING-AT-LOOP-END → STOPPED
 */

import { AudioEngine } from './AudioEngine';

/* ─── Types ─── */

export type TrackState =
  | 'empty'
  | 'rec-standby'
  | 'recording'
  | 'playing'
  | 'overdubbing'
  | 'stopped'
  | 'fading-out'
  | 'stopping-at-loop-end';

export type DubMode = 'overdub' | 'replace1' | 'replace2';
export type StartMode = 'immediate' | 'fade';
export type StopMode = 'immediate' | 'fade' | 'loop';
export type SpeedMode = 'half' | 'normal' | 'double';
export type MeasureSetting = 'auto' | 'free' | number;
export type QuantizeMode = 'off' | 'measure';
export type RecAction = 'rec-dub' | 'rec-play';

export interface TrackSettings {
  reverse: boolean;
  oneShot: boolean;
  dubMode: DubMode;
  startMode: StartMode;
  stopMode: StopMode;
  fadeTimeIn: number;        // measures (1–64)
  fadeTimeOut: number;       // measures (1–64)
  loopSync: boolean;
  tempoSyncSw: boolean;
  tempoSyncMode: 'pitch' | 'xfade';
  speed: SpeedMode;
  measure: MeasureSetting;
  quantize: QuantizeMode;
  autoRecSw: boolean;
  autoRecSens: number;       // 1–100
  bounceIn: boolean;
  recAction: RecAction;
}

export interface LoopTrackOptions {
  id: number;
  onStateChange?: (id: number, state: TrackState) => void;
}

const DEFAULT_SETTINGS: TrackSettings = {
  reverse: false,
  oneShot: false,
  dubMode: 'overdub',
  startMode: 'immediate',
  stopMode: 'immediate',
  fadeTimeIn: 2,
  fadeTimeOut: 2,
  loopSync: true,
  tempoSyncSw: false,
  tempoSyncMode: 'pitch',
  speed: 'normal',
  measure: 'auto',
  quantize: 'off',
  autoRecSw: false,
  autoRecSens: 50,
  bounceIn: false,
  recAction: 'rec-play',
};

/* ─── LoopTrack Class ─── */

export class LoopTrack {
  readonly id: number;

  /* State */
  private _state: TrackState = 'empty';
  private onStateChange?: (id: number, state: TrackState) => void;

  /* Settings */
  private _settings: TrackSettings;

  /* Audio engine reference */
  private engine: AudioEngine;

  /* Audio data (stereo Float32Arrays) */
  private channelData: Float32Array[] = [];
  private recordLength = 0;
  private _originalTempo = 120;

  /* Undo/Redo — single-level */
  private undoChannelData: Float32Array[] = [];
  private undoRecordLength = 0;
  private _canUndo = false;
  private _canRedo = false;
  private redoChannelData: Float32Array[] = [];
  private redoRecordLength = 0;

  /* Mark Back snapshot */
  private markChannelData: Float32Array[] = [];
  private markRecordLength = 0;
  private _hasMark = false;

  /* REC Back snapshot (state right after first recording) */
  private recBackChannelData: Float32Array[] = [];
  private recBackRecordLength = 0;
  private _hasRecBack = false;

  /* Playback nodes */
  private playbackSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode;
  private panNode: StereoPannerNode;
  private _volume = 1.0;   // 0–2, 1 = unity
  private _pan = 0;         // -1 to +1

  /* Recording infrastructure */
  private recorder: ScriptProcessorNode | null = null;
  private recorderMixer: GainNode | null = null; // Summing bus for mic + bounce inputs
  private recordStartSample = 0;
  private isOverdubbing = false;
  private bounceConnections: AudioNode[] = [];

  /* Loop position tracking */
  private loopStartTime = 0;
  private _playbackPosition = 0;
  private positionRAF: number | null = null;

  /* Quantize / Auto-rec timers */
  private quantizeTimer: ReturnType<typeof setTimeout> | null = null;
  private autoRecRAF: number | null = null;

  /* Stop-mode timers */
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private loopEndTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: LoopTrackOptions) {
    this.id = options.id;
    this.onStateChange = options.onStateChange;
    this._settings = { ...DEFAULT_SETTINGS };
    this.engine = AudioEngine.getInstance();

    // Per-track gain → pan → master output
    this.gainNode = this.engine.ctx.createGain();
    this.gainNode.gain.value = this._volume;

    this.panNode = this.engine.ctx.createStereoPanner();
    this.panNode.pan.value = this._pan;

    this.gainNode.connect(this.panNode);
    this.panNode.connect(this.engine.masterGain);

    // Register with engine for cross-track coordination (bounce)
    this.engine.registerTrack(this.id, this.panNode, () => this._state);
  }

  /* ═══════════════════════════════════════════════════════════
   * Public Getters
   * ═══════════════════════════════════════════════════════════ */

  get state(): TrackState { return this._state; }
  get settings(): TrackSettings { return { ...this._settings }; }
  get volume(): number { return this._volume; }
  get pan(): number { return this._pan; }
  get duration(): number { return this.recordLength / this.engine.sampleRate; }
  get playbackPosition(): number { return this._playbackPosition; }
  get hasUndo(): boolean { return this._canUndo; }
  get hasRedo(): boolean { return this._canRedo; }
  get hasMark(): boolean { return this._hasMark; }
  get hasRecBack(): boolean { return this._hasRecBack; }
  get hasPhrase(): boolean { return this.recordLength > 0; }
  get originalTempo(): number { return this._originalTempo; }

  /* ═══════════════════════════════════════════════════════════
   * Settings
   * ═══════════════════════════════════════════════════════════ */

  updateSettings(partial: Partial<TrackSettings>): void {
    this._settings = { ...this._settings, ...partial };

    // Apply live speed/tempo-sync rate change
    if (this.playbackSource && (partial.speed !== undefined || partial.tempoSyncSw !== undefined)) {
      this.playbackSource.playbackRate.value = this.getPlaybackRate();
    }

    // Restart playback if reverse changed while playing
    if (partial.reverse !== undefined && this._state === 'playing') {
      this.stopPlaybackSource();
      this.startPlayback();
    }
  }

  setVolume(value: number): void {
    this._volume = Math.max(0, Math.min(2, value));
    this.gainNode.gain.setTargetAtTime(this._volume, this.engine.ctx.currentTime, 0.01);
  }

  setPan(value: number): void {
    this._pan = Math.max(-1, Math.min(1, value));
    this.panNode.pan.setTargetAtTime(this._pan, this.engine.ctx.currentTime, 0.01);
  }

  /* ═══════════════════════════════════════════════════════════
   * State Machine — Primary Controls
   * ═══════════════════════════════════════════════════════════ */

  /**
   * Primary button: cycle through record → play → overdub states.
   * Exact cycle depends on recAction setting.
   */
  toggleRecordPlay(): void {
    switch (this._state) {
      case 'empty':
        this.initiateRecording();
        break;

      case 'rec-standby':
        this.cancelStandby();
        break;

      case 'recording':
        this.stopRecording();
        break;

      case 'playing':
        if (this._settings.oneShot) {
          // Retrigger: restart from beginning
          this.stopPlaybackSource();
          this.startPlayback();
        } else if (this._settings.reverse) {
          // No overdub allowed with reverse
          return;
        } else {
          this.startOverdub();
        }
        break;

      case 'overdubbing':
        this.stopOverdub();
        break;

      case 'stopped':
        this.startPlayback();
        break;

      case 'fading-out':
      case 'stopping-at-loop-end':
        // Force immediate stop
        this.cancelPendingStop();
        this.stopPlaybackSource();
        this.setState('stopped');
        break;
    }
  }

  /** Stop playback or recording, respecting STOP MODE. */
  stop(): void {
    if (this._state === 'empty') return;

    if (this._state === 'rec-standby') {
      this.cancelStandby();
      return;
    }

    // Teardown active recording/overdubbing
    if (this._state === 'recording' || this._state === 'overdubbing') {
      if (this._state === 'recording') {
        // End the recording first
        this.teardownRecorder();
        this.disconnectBounce();
        if (this.recordLength > 0) {
          this.applyMeasureConstraints();
          this.channelData = [
            this.channelData[0].slice(0, this.recordLength),
            this.channelData[1].slice(0, this.recordLength),
          ];
          if (!this._hasRecBack) {
            this.saveRecBackState();
          }
        }
      } else {
        this.teardownRecorder();
        this.disconnectBounce();
        if (this._settings.dubMode === 'replace2') {
          this.gainNode.gain.setValueAtTime(this._volume, this.engine.ctx.currentTime);
        }
      }
    }

    if (this.recordLength === 0) {
      this.channelData = [];
      this.setState('empty');
      return;
    }

    // Apply STOP MODE
    switch (this._settings.stopMode) {
      case 'immediate':
        this.cancelPendingStop();
        this.stopPlaybackSource();
        this.setState('stopped');
        break;
      case 'fade':
        this.fadeOutAndStop();
        break;
      case 'loop':
        this.stopAtLoopEnd();
        break;
    }
  }

  /** Clear all audio data and reset to empty. */
  clear(): void {
    this.cancelStandby();
    this.cancelPendingStop();
    this.teardownRecorder();
    this.disconnectBounce();
    this.stopPlaybackSource();

    this.channelData = [];
    this.recordLength = 0;

    this.undoChannelData = [];
    this.undoRecordLength = 0;
    this.redoChannelData = [];
    this.redoRecordLength = 0;
    this._canUndo = false;
    this._canRedo = false;

    this.markChannelData = [];
    this.markRecordLength = 0;
    this._hasMark = false;

    this.recBackChannelData = [];
    this.recBackRecordLength = 0;
    this._hasRecBack = false;

    this._playbackPosition = 0;
    this.setState('empty');
  }

  /* ═══════════════════════════════════════════════════════════
   * Recording
   * ═══════════════════════════════════════════════════════════ */

  /** Entry point: decide whether to start immediately, quantize, or auto-rec. */
  private initiateRecording(): void {
    // QUANTIZE: delay start to next measure boundary
    if (this._settings.quantize === 'measure' && this.engine.masterLoopLengthSamples > 0) {
      const now = this.engine.ctx.currentTime;
      const startTime = this.engine.quantizeToNextMeasure();
      const delay = startTime - now;
      if (delay > 0.01) {
        this.setState('rec-standby');
        this.quantizeTimer = setTimeout(() => {
          this.quantizeTimer = null;
          if (this._state !== 'rec-standby') return;
          if (this._settings.autoRecSw) {
            this.enterAutoRecStandby();
          } else {
            this.startRecordingImmediate();
          }
        }, delay * 1000);
        return;
      }
    }

    // AUTO REC: wait for audio threshold
    if (this._settings.autoRecSw) {
      this.enterAutoRecStandby();
      return;
    }

    this.startRecordingImmediate();
  }

  /** Enter auto-rec standby: monitor input level and start when threshold exceeded. */
  private enterAutoRecStandby(): void {
    this.setState('rec-standby');
    const analyser = this.engine.inputAnalyser;
    const dataArray = new Float32Array(analyser.fftSize);
    // Threshold: sensitivity mapped to an RMS threshold (higher sens = lower threshold)
    const threshold = (1.01 - this._settings.autoRecSens / 100) * 0.05;

    const check = () => {
      if (this._state !== 'rec-standby') return;
      analyser.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);

      if (rms > threshold) {
        this.autoRecRAF = null;
        this.startRecordingImmediate();
        return;
      }
      this.autoRecRAF = requestAnimationFrame(check);
    };
    this.autoRecRAF = requestAnimationFrame(check);
  }

  /** Cancel rec-standby (quantize wait or auto-rec). */
  private cancelStandby(): void {
    if (this.quantizeTimer) {
      clearTimeout(this.quantizeTimer);
      this.quantizeTimer = null;
    }
    if (this.autoRecRAF) {
      cancelAnimationFrame(this.autoRecRAF);
      this.autoRecRAF = null;
    }
    this.setState('empty');
  }

  /** Actually start capturing audio samples. */
  private startRecordingImmediate(): void {
    const sampleRate = this.engine.sampleRate;
    // Allocate buffer for up to 5 minutes of stereo audio
    const maxSamples = sampleRate * 300;
    this.channelData = [new Float32Array(maxSamples), new Float32Array(maxSamples)];
    this.recordLength = 0;
    this.recordStartSample = 0;
    this.isOverdubbing = false;
    this._originalTempo = this.engine.tempo;

    this.setupRecorder(4096);

    // Connect bounce sources if enabled (must be after setupRecorder so this.recorder exists)
    if (this._settings.bounceIn) {
      this.connectBounce();
    }

    this.setState('recording');
  }

  /** Stop recording and transition to playback (or overdub if recAction=rec-dub). */
  private stopRecording(): void {
    this.teardownRecorder();
    this.disconnectBounce();

    if (this.recordLength === 0) {
      this.channelData = [];
      this.setState('empty');
      return;
    }

    // Apply measure constraints (quantize length, master loop sync, etc.)
    this.applyMeasureConstraints();

    // Trim buffer to actual recorded length
    this.channelData = [
      this.channelData[0].slice(0, this.recordLength),
      this.channelData[1].slice(0, this.recordLength),
    ];

    // Save REC BACK state (snapshot right after first recording)
    if (!this._hasRecBack) {
      this.saveRecBackState();
    }

    // Register as master loop if first synced track
    if (this._settings.loopSync && this.engine.masterLoopLengthSamples === 0) {
      this.engine.setMasterLoopLength(this.recordLength);
      this.engine.setMasterLoopStartTime(this.engine.ctx.currentTime);
    }

    // Transition based on REC ACTION
    if (this._settings.recAction === 'rec-dub') {
      this.startPlayback();
      // Immediately enter overdub
      if (!this._settings.oneShot && !this._settings.reverse) {
        this.startOverdub();
      }
    } else {
      this.startPlayback();
    }
  }

  /** Snap recording length to measure constraints. */
  private applyMeasureConstraints(): void {
    const spm = this.engine.samplesPerMeasure;
    if (spm <= 0) return;

    const measure = this._settings.measure;

    if (measure === 'auto') {
      if (this._settings.loopSync && this.engine.masterLoopLengthSamples > 0) {
        // Match master loop length
        this.recordLength = Math.min(
          this.engine.masterLoopLengthSamples,
          this.channelData[0].length
        );
      } else if (this._settings.quantize === 'measure') {
        this.recordLength = this.engine.quantizeLengthToMeasures(this.recordLength);
      }
    } else if (measure === 'free') {
      if (this._settings.quantize === 'measure') {
        this.recordLength = this.engine.quantizeLengthToMeasures(this.recordLength);
      }
      // Otherwise keep the raw length
    } else if (typeof measure === 'number') {
      // Fixed number of measures
      const targetLength = measure * spm;
      this.recordLength = Math.min(targetLength, this.channelData[0].length);
    }

    // Final bounds check
    if (this.channelData.length > 0) {
      this.recordLength = Math.min(this.recordLength, this.channelData[0].length);
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * Overdubbing
   * ═══════════════════════════════════════════════════════════ */

  private startOverdub(): void {
    if (this._settings.oneShot || this._settings.reverse) return;

    // Save current state for undo
    this.undoChannelData = this.channelData.map(ch => new Float32Array(ch));
    this.undoRecordLength = this.recordLength;
    this._canUndo = true;
    this._canRedo = false;

    this.isOverdubbing = true;

    // Calculate write position from current loop position
    const elapsed = this.engine.ctx.currentTime - this.loopStartTime;
    const loopDuration = this.recordLength / this.engine.sampleRate;
    const posInLoop = loopDuration > 0 ? elapsed % loopDuration : 0;
    this.recordStartSample = Math.floor(posInLoop * this.engine.sampleRate);

    // REPLACE2: mute playback during overdub (record over silently)
    if (this._settings.dubMode === 'replace2' && this.playbackSource) {
      this.gainNode.gain.setTargetAtTime(0, this.engine.ctx.currentTime, 0.01);
    }

    this.setupRecorder(4096);

    // Connect bounce if enabled (must be after setupRecorder so this.recorder exists)
    if (this._settings.bounceIn) {
      this.connectBounce();
    }

    this.setState('overdubbing');
  }

  private stopOverdub(): void {
    this.teardownRecorder();
    this.disconnectBounce();
    this.isOverdubbing = false;

    // Restore volume if REPLACE2 muted it
    if (this._settings.dubMode === 'replace2') {
      this.gainNode.gain.setTargetAtTime(this._volume, this.engine.ctx.currentTime, 0.01);
    }

    this.setState('playing');
  }

  /* ═══════════════════════════════════════════════════════════
   * Recorder Node Management
   * ═══════════════════════════════════════════════════════════ */

  private setupRecorder(bufferSize: number): void {
    // ScriptProcessorNode: deprecated but universally supported.
    // AudioWorklet upgrade planned for Phase 4.
    this.recorder = this.engine.ctx.createScriptProcessor(bufferSize, 2, 2);

    // Use a GainNode as a summing bus so that mic input + bounce sources
    // are properly mixed before reaching the ScriptProcessorNode.
    // (ScriptProcessorNode has unreliable multi-source summing in some browsers.)
    this.recorderMixer = this.engine.ctx.createGain();
    this.recorderMixer.gain.value = 1.0;

    let writePos = this.isOverdubbing ? this.recordStartSample : 0;
    const dubMode = this._settings.dubMode;

    this.recorder.onaudioprocess = (e: AudioProcessingEvent) => {
      const inputL = e.inputBuffer.getChannelData(0);
      const inputR = e.inputBuffer.getChannelData(1);

      for (let i = 0; i < inputL.length; i++) {
        if (this.isOverdubbing) {
          const idx = writePos % this.recordLength;
          switch (dubMode) {
            case 'overdub':
              // Layer: add new audio on top of existing
              this.channelData[0][idx] += inputL[i];
              this.channelData[1][idx] += inputR[i];
              break;
            case 'replace1':
            case 'replace2':
              // Overwrite: replace existing with new
              this.channelData[0][idx] = inputL[i];
              this.channelData[1][idx] = inputR[i];
              break;
          }
        } else {
          // First recording — write directly
          if (writePos < this.channelData[0].length) {
            this.channelData[0][writePos] = inputL[i];
            this.channelData[1][writePos] = inputR[i];
          }
        }
        writePos++;
      }

      if (!this.isOverdubbing) {
        this.recordLength = Math.min(writePos, this.channelData[0].length);

        // Auto-stop: fixed measure count
        if (typeof this._settings.measure === 'number') {
          const targetLength = this._settings.measure * this.engine.samplesPerMeasure;
          if (this.recordLength >= targetLength) {
            this.recordLength = targetLength;
            requestAnimationFrame(() => {
              if (this._state === 'recording') this.stopRecording();
            });
          }
        }

        // Auto-stop: MEASURE=AUTO with existing master loop
        if (
          this._settings.measure === 'auto' &&
          this._settings.loopSync &&
          this.engine.masterLoopLengthSamples > 0
        ) {
          if (this.recordLength >= this.engine.masterLoopLengthSamples) {
            this.recordLength = this.engine.masterLoopLengthSamples;
            requestAnimationFrame(() => {
              if (this._state === 'recording') this.stopRecording();
            });
          }
        }
      }

      // Pass audio through (silent — for ScriptProcessor keep-alive)
      const outputL = e.outputBuffer.getChannelData(0);
      const outputR = e.outputBuffer.getChannelData(1);
      outputL.set(inputL);
      outputR.set(inputR);
    };

    // Connect: inputGain → mixer → recorder → silentGain → destination
    this.engine.inputGain.connect(this.recorderMixer);
    this.recorderMixer.connect(this.recorder);

    // Silent output to keep the ScriptProcessor alive
    const silentGain = this.engine.ctx.createGain();
    silentGain.gain.value = 0;
    this.recorder.connect(silentGain);
    silentGain.connect(this.engine.ctx.destination);
  }

  private teardownRecorder(): void {
    if (this.recorder) {
      this.recorder.onaudioprocess = null;
      try { this.engine.inputGain.disconnect(this.recorderMixer!); } catch { /* noop */ }
      if (this.recorderMixer) {
        this.recorderMixer.disconnect();
        this.recorderMixer = null;
      }
      this.recorder.disconnect();
      this.recorder = null;
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * Bounce (record other tracks' output)
   * ═══════════════════════════════════════════════════════════ */

  private connectBounce(): void {
    if (!this._settings.bounceIn || !this.recorderMixer) return;
    const otherNodes = this.engine.getOtherTrackOutputNodes(this.id);
    for (const node of otherNodes) {
      node.connect(this.recorderMixer);
      this.bounceConnections.push(node);
    }
  }

  private disconnectBounce(): void {
    if (this.recorderMixer) {
      for (const node of this.bounceConnections) {
        try { node.disconnect(this.recorderMixer); } catch { /* noop */ }
      }
    }
    this.bounceConnections = [];
  }

  /* ═══════════════════════════════════════════════════════════
   * Playback
   * ═══════════════════════════════════════════════════════════ */

  private startPlayback(): void {
    if (this.recordLength === 0) {
      this.setState('empty');
      return;
    }

    this.stopPlaybackSource();
    this.cancelPendingStop();

    const buffer = this.getAudioBuffer();
    if (!buffer) return;

    // REVERSE: reverse the buffer data
    if (this._settings.reverse) {
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        data.reverse();
      }
    }

    this.playbackSource = this.engine.ctx.createBufferSource();
    this.playbackSource.buffer = buffer;
    this.playbackSource.loop = !this._settings.oneShot;
    this.playbackSource.playbackRate.value = this.getPlaybackRate();
    this.playbackSource.connect(this.gainNode);

    // LOOP SYNC: calculate start offset to align with master loop
    let startOffset = 0;
    if (this._settings.loopSync && this.engine.masterLoopLengthSamples > 0) {
      const position = this.engine.getMasterLoopPosition();
      const trackDuration = this.recordLength / this.engine.sampleRate;
      startOffset = position * trackDuration;
      // Clamp to valid range
      startOffset = Math.max(0, Math.min(startOffset, trackDuration - 0.001));
    }

    // START MODE: fade-in
    if (this._settings.startMode === 'fade') {
      const fadeInDuration = this.getFadeInDuration();
      this.gainNode.gain.cancelScheduledValues(this.engine.ctx.currentTime);
      this.gainNode.gain.setValueAtTime(0, this.engine.ctx.currentTime);
      this.gainNode.gain.linearRampToValueAtTime(
        this._volume,
        this.engine.ctx.currentTime + fadeInDuration
      );
    } else {
      this.gainNode.gain.cancelScheduledValues(this.engine.ctx.currentTime);
      this.gainNode.gain.setValueAtTime(this._volume, this.engine.ctx.currentTime);
    }

    this.playbackSource.start(0, startOffset);
    this.loopStartTime = this.engine.ctx.currentTime - startOffset;

    // 1SHOT: auto-stop at end
    if (this._settings.oneShot) {
      this.playbackSource.onended = () => {
        this._playbackPosition = 0;
        this.setState('stopped');
      };
    }

    this.startPositionTracking();
    this.setState('playing');
  }

  /** Calculate the effective playback rate from speed + tempo sync settings. */
  private getPlaybackRate(): number {
    let rate = 1.0;

    // SPEED setting
    switch (this._settings.speed) {
      case 'half': rate = 0.5; break;
      case 'double': rate = 2.0; break;
      default: rate = 1.0;
    }

    // TEMPO SYNC (pitch mode): adjust rate to match current tempo
    if (
      this._settings.tempoSyncSw &&
      this._settings.tempoSyncMode === 'pitch' &&
      this._originalTempo > 0
    ) {
      rate *= this.engine.tempo / this._originalTempo;
    }

    return rate;
  }

  /* ═══════════════════════════════════════════════════════════
   * Stop Modes (fade-out, loop-end)
   * ═══════════════════════════════════════════════════════════ */

  private getFadeInDuration(): number {
    const measuresPerSecond = this.engine.tempo / (60 * this.engine.timeSignature);
    if (measuresPerSecond <= 0) return 1;
    return this._settings.fadeTimeIn / measuresPerSecond;
  }

  private getFadeOutDuration(): number {
    const measuresPerSecond = this.engine.tempo / (60 * this.engine.timeSignature);
    if (measuresPerSecond <= 0) return 1;
    return this._settings.fadeTimeOut / measuresPerSecond;
  }

  private fadeOutAndStop(): void {
    if (this._state === 'fading-out') return;
    this.setState('fading-out');

    const fadeOutDuration = this.getFadeOutDuration();
    this.gainNode.gain.cancelScheduledValues(this.engine.ctx.currentTime);
    this.gainNode.gain.setValueAtTime(
      this.gainNode.gain.value || this._volume,
      this.engine.ctx.currentTime
    );
    this.gainNode.gain.linearRampToValueAtTime(0, this.engine.ctx.currentTime + fadeOutDuration);

    this.fadeTimer = setTimeout(() => {
      this.fadeTimer = null;
      this.stopPlaybackSource();
      this.gainNode.gain.cancelScheduledValues(this.engine.ctx.currentTime);
      this.gainNode.gain.setValueAtTime(this._volume, this.engine.ctx.currentTime);
      this.setState('stopped');
    }, fadeOutDuration * 1000 + 50);
  }

  private stopAtLoopEnd(): void {
    if (this._state === 'stopping-at-loop-end') return;
    this.setState('stopping-at-loop-end');

    const loopDuration = this.recordLength / this.engine.sampleRate;
    if (loopDuration <= 0) {
      this.stopPlaybackSource();
      this.setState('stopped');
      return;
    }

    const elapsed = this.engine.ctx.currentTime - this.loopStartTime;
    const posInLoop = ((elapsed % loopDuration) + loopDuration) % loopDuration;
    const remaining = loopDuration - posInLoop;

    this.loopEndTimer = setTimeout(() => {
      this.loopEndTimer = null;
      this.stopPlaybackSource();
      this.setState('stopped');
    }, remaining * 1000 + 50);
  }

  private cancelPendingStop(): void {
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    if (this.loopEndTimer) {
      clearTimeout(this.loopEndTimer);
      this.loopEndTimer = null;
    }
    // Restore gain if we were fading
    this.gainNode.gain.cancelScheduledValues(this.engine.ctx.currentTime);
    this.gainNode.gain.setValueAtTime(this._volume, this.engine.ctx.currentTime);
  }

  private stopPlaybackSource(): void {
    this.stopPositionTracking();
    if (this.playbackSource) {
      // Clear onended BEFORE stop() to prevent stale callbacks (critical for 1SHOT retrigger)
      this.playbackSource.onended = null;
      try { this.playbackSource.stop(); } catch { /* already stopped */ }
      this.playbackSource.disconnect();
      this.playbackSource = null;
    }
    this._playbackPosition = 0;
  }

  /* ═══════════════════════════════════════════════════════════
   * Undo / Redo (single-level per track)
   * ═══════════════════════════════════════════════════════════ */

  undo(): void {
    if (!this._canUndo) return;

    // Save current state as redo
    this.redoChannelData = this.channelData.map(ch => new Float32Array(ch));
    this.redoRecordLength = this.recordLength;
    this._canRedo = true;

    // Restore previous state
    this.channelData = this.undoChannelData.map(ch => new Float32Array(ch));
    this.recordLength = this.undoRecordLength;
    this._canUndo = false;

    // Restart playback with restored data
    if (this._state === 'playing' || this._state === 'overdubbing') {
      this.teardownRecorder();
      this.stopPlaybackSource();
      this.startPlayback();
    }
  }

  redo(): void {
    if (!this._canRedo) return;

    // Save current as undo
    this.undoChannelData = this.channelData.map(ch => new Float32Array(ch));
    this.undoRecordLength = this.recordLength;
    this._canUndo = true;

    // Restore redo state
    this.channelData = this.redoChannelData.map(ch => new Float32Array(ch));
    this.recordLength = this.redoRecordLength;
    this._canRedo = false;

    if (this._state === 'playing' || this._state === 'overdubbing') {
      this.teardownRecorder();
      this.stopPlaybackSource();
      this.startPlayback();
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * Mark Back / REC Back
   * ═══════════════════════════════════════════════════════════ */

  /** Set a mark at the current overdub state. */
  setMark(): void {
    if (this.recordLength === 0) return;
    this.markChannelData = this.channelData.map(ch => new Float32Array(ch));
    this.markRecordLength = this.recordLength;
    this._hasMark = true;
  }

  /** Delete the mark. */
  clearMark(): void {
    this.markChannelData = [];
    this.markRecordLength = 0;
    this._hasMark = false;
  }

  /** Restore to the marked overdub state (or to post-first-recording if no mark). */
  markBack(): void {
    if (!this._hasMark) {
      this.recBack();
      return;
    }

    this.channelData = this.markChannelData.map(ch => new Float32Array(ch));
    this.recordLength = this.markRecordLength;

    if (this._state === 'playing' || this._state === 'overdubbing') {
      this.teardownRecorder();
      this.disconnectBounce();
      this.stopPlaybackSource();
      this.startPlayback();
    }
  }

  /** Save a snapshot right after first recording (called internally). */
  private saveRecBackState(): void {
    this.recBackChannelData = this.channelData.map(ch => new Float32Array(ch));
    this.recBackRecordLength = this.recordLength;
    this._hasRecBack = true;
  }

  /** Restore to the state right after first recording. */
  recBack(): void {
    if (!this._hasRecBack) return;

    this.channelData = this.recBackChannelData.map(ch => new Float32Array(ch));
    this.recordLength = this.recBackRecordLength;

    if (this._state === 'playing' || this._state === 'overdubbing') {
      this.teardownRecorder();
      this.disconnectBounce();
      this.stopPlaybackSource();
      this.startPlayback();
    }
  }

  /* ═══════════════════════════════════════════════════════════
   * Import / Export
   * ═══════════════════════════════════════════════════════════ */

  /** Export the track audio as a stereo AudioBuffer. */
  getAudioBuffer(): AudioBuffer | null {
    if (this.recordLength === 0) return null;
    const buffer = this.engine.ctx.createBuffer(2, this.recordLength, this.engine.sampleRate);
    buffer.copyToChannel(this.channelData[0].slice(0, this.recordLength), 0);
    buffer.copyToChannel(this.channelData[1].slice(0, this.recordLength), 1);
    return buffer;
  }

  /** Import audio from raw channel arrays (e.g. loading from IndexedDB). */
  loadFromChannelData(left: Float32Array, right: Float32Array, length: number): void {
    this.clear();
    this.channelData = [new Float32Array(left), new Float32Array(right)];
    this.recordLength = length;
    this.setState('stopped');
  }

  /** Get raw channel data for persistence. */
  getRawChannelData(): { left: Float32Array; right: Float32Array; length: number } | null {
    if (this.recordLength === 0) return null;
    return {
      left: this.channelData[0].slice(0, this.recordLength),
      right: this.channelData[1].slice(0, this.recordLength),
      length: this.recordLength,
    };
  }

  /* ═══════════════════════════════════════════════════════════
   * Private Helpers
   * ═══════════════════════════════════════════════════════════ */

  private setState(state: TrackState): void {
    this._state = state;
    this.onStateChange?.(this.id, state);
  }

  /* ── Position tracking ── */

  private startPositionTracking(): void {
    this.stopPositionTracking();
    const tick = () => {
      if (
        this._state === 'playing' ||
        this._state === 'overdubbing' ||
        this._state === 'fading-out' ||
        this._state === 'stopping-at-loop-end'
      ) {
        const elapsed = this.engine.ctx.currentTime - this.loopStartTime;
        const loopDuration = this.recordLength / this.engine.sampleRate;
        if (loopDuration > 0) {
          this._playbackPosition = (elapsed % loopDuration) / loopDuration;
        }
        this.positionRAF = requestAnimationFrame(tick);
      }
    };
    this.positionRAF = requestAnimationFrame(tick);
  }

  private stopPositionTracking(): void {
    if (this.positionRAF !== null) {
      cancelAnimationFrame(this.positionRAF);
      this.positionRAF = null;
    }
  }
}
