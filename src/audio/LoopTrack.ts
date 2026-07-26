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
import { GranularPitchShifter } from './effects/PitchShifter';
import type { EffectsChain } from './effects/EffectsChain';

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
  // OFF, matching the hardware default. Tracks are then independent in length
  // and start time — record a 1-bar hihat on one track and an 8-bar pad on
  // another with neither constraining the other. Turning it ON aligns phrase
  // starts and rounds new recordings to a whole multiple of the first
  // loop-synced phrase, which is what you want for a tight rhythmic stack.
  loopSync: false,
  // ON by default: like the hardware, recorded phrases follow the song tempo,
  // so changing BPM (knob or TAP) re-rates existing loops.
  tempoSyncSw: true,
  // XFADE (pitch-preserving) by default — a BPM change should move the tempo,
  // not transpose the phrase. Switch to PITCH in Track Edit for tape-style
  // varispeed, where speeding up also raises pitch.
  tempoSyncMode: 'xfade',
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
  /**
   * AudioContext time at which capture began. Used to verify capture integrity:
   * ScriptProcessorNode runs onaudioprocess on the main thread, so a stall drops
   * buffers *silently* and we store less audio than was actually played. That
   * makes the phrase short, which makes MEASURE:AUTO derive a far-too-high tempo.
   */
  private recordStartCtxTime = 0;

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
  private trackFXChain: EffectsChain;
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

  /* Tempo subscription teardown */
  private unsubscribeTempo: (() => void) | null = null;
  /** Playback rate currently applied to playbackSource (drives all loop-phase math). */
  private appliedRate = 1;
  /** TEMPO SYNC: XFADE mode cancels the varispeed pitch shift. Built on demand. */
  private tempoShifter: GranularPitchShifter | null = null;
  private shifterEngaged = false;

  constructor(options: LoopTrackOptions) {
    this.id = options.id;
    this.onStateChange = options.onStateChange;
    this._settings = { ...DEFAULT_SETTINGS };
    this.engine = AudioEngine.getInstance();

    // Per-track gain → FX chain → pan → master output
    this.gainNode = this.engine.ctx.createGain();
    this.gainNode.gain.value = this._volume;

    this.panNode = this.engine.ctx.createStereoPanner();
    this.panNode.pan.value = this._pan;

    // Create Track FX chain (Phase 4)
    this.trackFXChain = this.engine.createTrackFXChain(this.id);

    // Signal flow: gainNode → trackFXChain → panNode → masterGain
    this.gainNode.connect(this.trackFXChain.inputNode);
    this.trackFXChain.outputNode.connect(this.panNode);
    this.panNode.connect(this.engine.masterGain);

    // Register with engine for cross-track coordination (bounce)
    this.engine.registerTrack(this.id, this.panNode, () => this._state);

    // Follow global tempo changes: re-rate live playback so an already-recorded
    // loop speeds up / slows down with the BPM knob and TAP TEMPO.
    this.unsubscribeTempo = this.engine.onTempoChange(() => this.applyTempoChange());
  }

  /**
   * Re-apply the playback rate to a currently-playing source after a tempo
   * change. Safe to call every frame: it no-ops unless the target rate has
   * actually moved, so the position-tracking loop can use it as a self-heal
   * for any tempo change that didn't arrive via onTempoChange.
   */
  private applyTempoChange(): void {
    if (!this.playbackSource) return;
    const rate = this.getPlaybackRate();
    if (rate <= 0) return;

    if (Math.abs(rate - this.appliedRate) >= 1e-4) {
      // Keep the loop phase continuous: anchor loopStartTime to the position we
      // are at right now (computed at the OLD rate), then let the new rate take
      // over from here.
      const position = this.playbackPositionNormalized();
      this.playbackSource.playbackRate.setTargetAtTime(
        rate,
        this.engine.ctx.currentTime,
        0.02
      );
      this.appliedRate = rate;
      const newDuration = this.loopDurationAtRate(rate);
      this.loopStartTime = this.engine.ctx.currentTime - position * newDuration;
    }

    // Always re-check routing: switching PITCH↔XFADE changes the graph without
    // changing the rate, so this must not sit behind the rate check above.
    this.routePlayback(rate);
  }

  /**
   * Route playbackSource → [pitch compensation] → gainNode according to
   * TEMPO SYNC MODE.
   *
   * PITCH: straight varispeed — speeding the loop up raises its pitch, like
   * tape. XFADE: the hardware's pitch-preserving mode, so a tempo change does
   * not transpose the phrase. We get that by keeping the varispeed rate and
   * transposing back by the exact amount it introduced.
   *
   * The shifter is bypassed entirely at rate 1 so an untouched tempo stays
   * bit-clean — granular shifting is never free of warble.
   */
  private routePlayback(rate: number): void {
    if (!this.playbackSource) return;

    const wantShift =
      this._settings.tempoSyncSw &&
      this._settings.tempoSyncMode === 'xfade' &&
      Math.abs(rate - 1) > 1e-3;

    if (wantShift) {
      if (!this.tempoShifter) {
        this.tempoShifter = new GranularPitchShifter(this.engine.ctx);
        this.tempoShifter.output.connect(this.gainNode);
      }
      // Rate r raises pitch by 12·log2(r); cancel exactly that.
      this.tempoShifter.setSemitones(-12 * Math.log2(rate));
      if (!this.shifterEngaged) {
        try { this.playbackSource.disconnect(); } catch { /* not connected */ }
        this.playbackSource.connect(this.tempoShifter.input);
        this.shifterEngaged = true;
      }
    } else if (this.shifterEngaged) {
      try { this.playbackSource.disconnect(); } catch { /* not connected */ }
      this.playbackSource.connect(this.gainNode);
      this.shifterEngaged = false;
    }
  }

  /** Audible loop duration (seconds) at a given playback rate. */
  private loopDurationAtRate(rate: number): number {
    const base = this.recordLength / this.engine.sampleRate;
    return rate > 0 ? base / rate : base;
  }

  /** Current position within the loop, normalized 0–1. */
  private playbackPositionNormalized(): number {
    // Use the rate actually running on the source, not the freshly-computed
    // target — during a tempo change those differ, and phase must be measured
    // under the rate that produced the elapsed time.
    const duration = this.loopDurationAtRate(this.appliedRate);
    if (duration <= 0) return 0;
    const elapsed = this.engine.ctx.currentTime - this.loopStartTime;
    return (((elapsed % duration) + duration) % duration) / duration;
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
    if (
      this.playbackSource &&
      (partial.speed !== undefined ||
        partial.tempoSyncSw !== undefined ||
        partial.tempoSyncMode !== undefined)
    ) {
      this.applyTempoChange();
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
          this.checkCaptureIntegrity();
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
    console.info(
      `[LoopTrack ${this.id}] AUTO REC is ON — armed and waiting for input. ` +
        `Nothing is being recorded yet (state: rec-standby).`
    );
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
        console.info(
          `[LoopTrack ${this.id}] AUTO REC triggered: level ${rms.toFixed(4)} > ` +
            `threshold ${threshold.toFixed(4)}. NOTE: the detector listens AFTER the ` +
            `Input FX chain, so a Robot carrier or Slicer output can trip it on its own.`
        );
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
    this.recordStartCtxTime = this.engine.ctx.currentTime;

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

    console.info(
      `[LoopTrack ${this.id}] Recording ended after ` +
        `${(this.recordLength / this.engine.sampleRate).toFixed(3)}s raw.`
    );

    // Apply measure constraints (quantize length, master loop sync, etc.)
    this.checkCaptureIntegrity();
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
      console.info(
        `[LoopTrack ${this.id}] Became the MASTER LOOP at ` +
          `${(this.recordLength / this.engine.sampleRate).toFixed(3)}s. Every later ` +
          `LOOP SYNC track rounds to a whole multiple of this.`
      );
      this.engine.setMasterLoopLength(this.recordLength, this.id);
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

  /**
   * Compare captured audio against wall-clock recording time.
   *
   * These should match to within one buffer (~93 ms at 4096 frames). If we
   * captured materially less, the ScriptProcessorNode dropped callbacks because
   * the main thread was busy — the phrase is then shorter than what was played,
   * every derived tempo is wrong by that ratio, and the audio itself has gaps.
   * No amount of tempo maths downstream can fix that; the capture has to move
   * off the main thread (AudioWorklet).
   */
  private checkCaptureIntegrity(): void {
    if (this.recordStartCtxTime <= 0 || this.recordLength === 0) return;

    const elapsed = this.engine.ctx.currentTime - this.recordStartCtxTime;
    const captured = this.recordLength / this.engine.sampleRate;
    if (elapsed <= 0) return;

    const ratio = captured / elapsed;
    // One buffer of slack at each end, plus 2%.
    const tolerance = (2 * 4096) / this.engine.sampleRate + elapsed * 0.02;

    if (elapsed - captured > tolerance) {
      console.warn(
        `[LoopTrack ${this.id}] Capture dropout: held REC for ${elapsed.toFixed(3)}s ` +
          `but only stored ${captured.toFixed(3)}s (${(ratio * 100).toFixed(1)}% of the ` +
          `performance). The ScriptProcessorNode is missing buffers, so this phrase is ` +
          `too short and any tempo derived from it will be too high by ~${(1 / ratio).toFixed(2)}×.`
      );
    }
  }

  /** Snap recording length to measure constraints. */
  private applyMeasureConstraints(): void {
    const spm = this.engine.samplesPerMeasure;
    if (spm <= 0) return;

    const measure = this._settings.measure;

    if (measure === 'auto') {
      if (this._settings.loopSync && this.engine.masterLoopLengthSamples > 0) {
        // Round to the nearest WHOLE MULTIPLE of the base loop (minimum 1×), so
        // this track can be 1×, 2×, 4×… the length of the first one and still
        // line up every cycle. Clamping to exactly 1× would force every track to
        // the same duration, which the hardware does not do.
        const master = this.engine.masterLoopLengthSamples;
        const multiple = Math.max(1, Math.round(this.recordLength / master));
        this.recordLength = Math.min(multiple * master, this.channelData[0].length);
      } else if (this._settings.quantize === 'measure') {
        this.recordLength = this.engine.quantizeLengthToMeasures(this.recordLength);
      } else {
        // AUTO with no master loop: the RC-505 does NOT force your first phrase
        // onto the existing grid — it keeps the audio exactly as played and
        // derives the tempo FROM it (power-of-two measures, 80–160 BPM). The
        // memory tempo then follows what you actually played, which is why the
        // hardware lands on values like 107 rather than snapping to 120.
        // Only the FIRST phrase in the memory sets the tempo; a later track
        // re-deriving would re-rate every loop recorded before it.
        if (!this.engine.memoryTempoDerived) {
          const derived = this.engine.deriveTempoFromLength(this.recordLength);
          if (derived && derived.inRange) {
            this.engine.tempo = derived.bpm;
            this.engine.markMemoryTempoDerived();
            // Playing back at the tempo it was derived from means rate = 1, so
            // the phrase is heard exactly as recorded until the tempo is moved.
            this._originalTempo = derived.bpm;
          } else {
            // No power-of-two measure count landed in the documented 80–160
            // window. Perfectly normal for a deliberately short phrase (a
            // one-bar hihat is under a second) — the phrase is kept exactly as
            // played, we just can't infer a tempo from it, so the existing
            // memory tempo stands rather than being replaced by a clamped guess.
            console.info(
              `[LoopTrack ${this.id}] MEASURE:AUTO found no tempo in a ` +
                `${(this.recordLength / this.engine.sampleRate).toFixed(3)}s phrase; ` +
                `keeping ${this.engine.tempo} BPM. The audio is unchanged.`
            );
          }
        }
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

    // Calculate write position from the current (rate-aware) loop position.
    this.recordStartSample = Math.floor(this.playbackPositionNormalized() * this.recordLength);

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
              if (this._state === 'recording') {
                console.info(
                  `[LoopTrack ${this.id}] Auto-stop: reached the fixed MEASURE count ` +
                    `(${this._settings.measure} measures = ` +
                    `${(targetLength / this.engine.sampleRate).toFixed(3)}s at ` +
                    `${this.engine.tempo} BPM).`
                );
                this.stopRecording();
              }
            });
          }
        }

        // NOTE: MEASURE=AUTO deliberately does NOT auto-stop at the master loop
        // length. Tracks may be longer than the base loop — a 4-bar part over a
        // 2-bar one is normal — they just have to stay a whole multiple of it to
        // remain phase-locked. The rounding happens in applyMeasureConstraints()
        // when you stop. Hard-stopping here capped every track at exactly 1×,
        // which is far more restrictive than the hardware.
      }

      // Pass audio through (silent — for ScriptProcessor keep-alive)
      const outputL = e.outputBuffer.getChannelData(0);
      const outputR = e.outputBuffer.getChannelData(1);
      outputL.set(inputL);
      outputR.set(inputR);
    };

    // Connect: inputFXOutput → mixer → recorder → silentGain → destination
    this.engine.inputFXOutput.connect(this.recorderMixer);
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
      try { this.engine.inputFXOutput.disconnect(this.recorderMixer!); } catch { /* noop */ }
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
    this.appliedRate = this.getPlaybackRate();
    this.playbackSource.playbackRate.value = this.appliedRate;
    // Fresh source starts on the direct path; routePlayback re-routes it through
    // the pitch compensator if XFADE mode needs it.
    this.playbackSource.connect(this.gainNode);
    this.shifterEngaged = false;
    this.routePlayback(this.appliedRate);

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
    // startOffset is buffer-time; convert to wall-clock via the playback rate.
    const rate = this.appliedRate;
    this.loopStartTime = this.engine.ctx.currentTime - (rate > 0 ? startOffset / rate : startOffset);

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

    // TEMPO SYNC: follow the memory tempo relative to the tempo we recorded at.
    // This applies in BOTH modes — the rate change is what makes the loop track
    // the tempo at all. tempoSyncMode only decides what happens to the pitch:
    // PITCH lets it ride along (varispeed), XFADE has routePlayback() transpose
    // it back. Gating this on mode === 'pitch' silently disables tempo sync.
    if (this._settings.tempoSyncSw && this._originalTempo > 0) {
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

    const loopDuration = this.loopDurationAtRate(this.appliedRate);
    if (loopDuration <= 0) {
      this.stopPlaybackSource();
      this.setState('stopped');
      return;
    }

    const remaining = loopDuration * (1 - this.playbackPositionNormalized());

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

  /** Release engine subscriptions held by this track. */
  dispose(): void {
    this.unsubscribeTempo?.();
    this.unsubscribeTempo = null;
    this.tempoShifter?.dispose();
    this.tempoShifter = null;
    this.shifterEngaged = false;
    this.clear();
  }

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
        // Self-heal: if the target rate has moved (tempo/speed change) and the
        // source hasn't caught up yet, re-rate here. applyTempoChange no-ops
        // when nothing changed, so this is cheap.
        this.applyTempoChange();

        // Use the rate-adjusted duration so the indicator stays accurate when
        // the tempo (and therefore playback rate) changes.
        const loopDuration = this.loopDurationAtRate(this.appliedRate);
        if (loopDuration > 0) {
          const elapsed = this.engine.ctx.currentTime - this.loopStartTime;
          this._playbackPosition = (((elapsed % loopDuration) + loopDuration) % loopDuration) / loopDuration;
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
