/**
 * LoopTrack — One of 5 stereo loop tracks.
 *
 * Handles recording, overdubbing, playback, undo/redo for a single track.
 * Audio is stored as a Float32Array per channel and played back via an
 * AudioBufferSourceNode that is re-created each loop cycle.
 *
 * State machine:
 *   EMPTY → RECORDING → PLAYING ↔ OVERDUBBING → STOPPED → PLAYING ...
 */

import { AudioEngine } from './AudioEngine';

export type TrackState = 'empty' | 'recording' | 'playing' | 'overdubbing' | 'stopped';

export interface LoopTrackOptions {
  id: number;
  onStateChange?: (id: number, state: TrackState) => void;
}

export class LoopTrack {
  readonly id: number;

  /* State */
  private _state: TrackState = 'empty';
  private onStateChange?: (id: number, state: TrackState) => void;

  /* Audio engine ref */
  private engine: AudioEngine;

  /* Recording buffers (interleaved Float32Arrays per channel) */
  private channelData: Float32Array[] = []; // [left, right]
  private recordLength = 0; // in samples

  /* Undo buffer — stores previous overdub state */
  private undoChannelData: Float32Array[] = [];
  private undoRecordLength = 0;
  private canUndo = false;
  private canRedo = false;
  private redoChannelData: Float32Array[] = [];
  private redoRecordLength = 0;

  /* Playback */
  private playbackSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode;
  private panNode: StereoPannerNode;
  private _volume = 1.0; // 0–2
  private _pan = 0; // -1 to 1

  /* Recording infrastructure */
  private recorder: ScriptProcessorNode | null = null;
  private recordStartSample = 0;
  private isOverdubbing = false;

  /* Loop position tracking */
  private loopStartTime = 0;
  private _playbackPosition = 0; // 0-1 normalized

  constructor(options: LoopTrackOptions) {
    this.id = options.id;
    this.onStateChange = options.onStateChange;

    this.engine = AudioEngine.getInstance();

    // Per-track gain and pan
    this.gainNode = this.engine.ctx.createGain();
    this.gainNode.gain.value = this._volume;

    this.panNode = this.engine.ctx.createStereoPanner();
    this.panNode.pan.value = this._pan;

    this.gainNode.connect(this.panNode);
    this.panNode.connect(this.engine.masterGain);
  }

  /* ─── Public API ─── */

  get state(): TrackState {
    return this._state;
  }

  get volume(): number {
    return this._volume;
  }

  get pan(): number {
    return this._pan;
  }

  get duration(): number {
    return this.recordLength / this.engine.sampleRate;
  }

  get playbackPosition(): number {
    return this._playbackPosition;
  }

  get hasUndo(): boolean {
    return this.canUndo;
  }

  get hasRedo(): boolean {
    return this.canRedo;
  }

  /** True if this track has recorded audio. */
  get hasPhrase(): boolean {
    return this.recordLength > 0;
  }

  setVolume(value: number): void {
    this._volume = Math.max(0, Math.min(2, value));
    this.gainNode.gain.setTargetAtTime(this._volume, this.engine.ctx.currentTime, 0.01);
  }

  setPan(value: number): void {
    this._pan = Math.max(-1, Math.min(1, value));
    this.panNode.pan.setTargetAtTime(this._pan, this.engine.ctx.currentTime, 0.01);
  }

  /**
   * Primary control: cycle through states.
   * Empty → Record → Play → Overdub → Play → …
   */
  toggleRecordPlay(): void {
    switch (this._state) {
      case 'empty':
        this.startRecording();
        break;
      case 'recording':
        this.stopRecording();
        break;
      case 'playing':
        this.startOverdub();
        break;
      case 'overdubbing':
        this.stopOverdub();
        break;
      case 'stopped':
        this.startPlayback();
        break;
    }
  }

  /** Stop playback or recording. */
  stop(): void {
    if (this._state === 'recording' || this._state === 'overdubbing') {
      this.teardownRecorder();
    }
    this.stopPlaybackSource();
    this.setState('stopped');
  }

  /** Clear all audio data and reset to empty. */
  clear(): void {
    this.stop();
    this.channelData = [];
    this.recordLength = 0;
    this.undoChannelData = [];
    this.undoRecordLength = 0;
    this.redoChannelData = [];
    this.redoRecordLength = 0;
    this.canUndo = false;
    this.canRedo = false;
    this._playbackPosition = 0;
    this.setState('empty');
  }

  /** Undo the last overdub. */
  undo(): void {
    if (!this.canUndo) return;

    // Save current state as redo
    this.redoChannelData = this.channelData.map(ch => new Float32Array(ch));
    this.redoRecordLength = this.recordLength;
    this.canRedo = true;

    // Restore previous state
    this.channelData = this.undoChannelData.map(ch => new Float32Array(ch));
    this.recordLength = this.undoRecordLength;
    this.canUndo = false;

    // Restart playback with restored data
    if (this._state === 'playing' || this._state === 'overdubbing') {
      this.stopPlaybackSource();
      this.startPlayback();
    }
  }

  /** Redo a previously undone overdub. */
  redo(): void {
    if (!this.canRedo) return;

    // Save current as undo
    this.undoChannelData = this.channelData.map(ch => new Float32Array(ch));
    this.undoRecordLength = this.recordLength;
    this.canUndo = true;

    // Restore redo state
    this.channelData = this.redoChannelData.map(ch => new Float32Array(ch));
    this.recordLength = this.redoRecordLength;
    this.canRedo = false;

    if (this._state === 'playing' || this._state === 'overdubbing') {
      this.stopPlaybackSource();
      this.startPlayback();
    }
  }

  /**
   * Export the track audio as a stereo AudioBuffer.
   */
  getAudioBuffer(): AudioBuffer | null {
    if (this.recordLength === 0) return null;
    const buffer = this.engine.ctx.createBuffer(2, this.recordLength, this.engine.sampleRate);
    buffer.copyToChannel(this.channelData[0].slice(0, this.recordLength), 0);
    buffer.copyToChannel(this.channelData[1].slice(0, this.recordLength), 1);
    return buffer;
  }

  /**
   * Import audio data from raw channel arrays.
   * Used when loading from IndexedDB.
   */
  loadFromChannelData(left: Float32Array, right: Float32Array, length: number): void {
    this.clear();
    this.channelData = [new Float32Array(left), new Float32Array(right)];
    this.recordLength = length;
    this.setState('stopped');
  }

  /**
   * Get raw channel data for persistence.
   */
  getRawChannelData(): { left: Float32Array; right: Float32Array; length: number } | null {
    if (this.recordLength === 0) return null;
    return {
      left: this.channelData[0].slice(0, this.recordLength),
      right: this.channelData[1].slice(0, this.recordLength),
      length: this.recordLength,
    };
  }

  /* ─── Private Methods ─── */

  private setState(state: TrackState): void {
    this._state = state;
    this.onStateChange?.(this.id, state);
  }

  /* ── Recording ── */

  private startRecording(): void {
    const bufferSize = 4096;
    const sampleRate = this.engine.sampleRate;

    // Allocate buffer for up to 5 minutes of stereo audio
    const maxSamples = sampleRate * 300;
    this.channelData = [new Float32Array(maxSamples), new Float32Array(maxSamples)];
    this.recordLength = 0;
    this.recordStartSample = 0;
    this.isOverdubbing = false;

    this.setupRecorder(bufferSize);
    this.setState('recording');
  }

  private stopRecording(): void {
    this.teardownRecorder();

    // Trim buffer to actual length
    if (this.recordLength > 0) {
      this.channelData = [
        this.channelData[0].slice(0, this.recordLength),
        this.channelData[1].slice(0, this.recordLength),
      ];
    }

    this.startPlayback();
  }

  /* ── Overdubbing ── */

  private startOverdub(): void {
    // Save current state for undo
    this.undoChannelData = this.channelData.map(ch => new Float32Array(ch));
    this.undoRecordLength = this.recordLength;
    this.canUndo = true;
    this.canRedo = false;

    this.isOverdubbing = true;

    // Figure out current position in the loop for the overdub write offset
    const elapsed = this.engine.ctx.currentTime - this.loopStartTime;
    const loopDuration = this.recordLength / this.engine.sampleRate;
    const posInLoop = elapsed % loopDuration;
    this.recordStartSample = Math.floor(posInLoop * this.engine.sampleRate);

    this.setupRecorder(4096);
    this.setState('overdubbing');
  }

  private stopOverdub(): void {
    this.teardownRecorder();
    this.isOverdubbing = false;
    this.setState('playing');
  }

  /* ── Recorder node management ── */

  private setupRecorder(bufferSize: number): void {
    // ScriptProcessorNode is deprecated but universally supported.
    // AudioWorklet version will follow in Phase 4.
    this.recorder = this.engine.ctx.createScriptProcessor(bufferSize, 2, 2);

    let writePos = this.isOverdubbing ? this.recordStartSample : 0;

    this.recorder.onaudioprocess = (e: AudioProcessingEvent) => {
      const inputL = e.inputBuffer.getChannelData(0);
      const inputR = e.inputBuffer.getChannelData(1);

      for (let i = 0; i < inputL.length; i++) {
        if (this.isOverdubbing) {
          // Mix (layer) incoming audio on top of existing data
          const idx = writePos % this.recordLength;
          this.channelData[0][idx] += inputL[i];
          this.channelData[1][idx] += inputR[i];
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
      }

      // Pass audio through for monitoring
      const outputL = e.outputBuffer.getChannelData(0);
      const outputR = e.outputBuffer.getChannelData(1);
      outputL.set(inputL);
      outputR.set(inputR);
    };

    // Connect: input → recorder → (silent output to keep node alive)
    this.engine.inputGain.connect(this.recorder);
    // Connect to a gain of 0 to keep the ScriptProcessor alive without doubling output
    const silentGain = this.engine.ctx.createGain();
    silentGain.gain.value = 0;
    this.recorder.connect(silentGain);
    silentGain.connect(this.engine.ctx.destination);
  }

  private teardownRecorder(): void {
    if (this.recorder) {
      this.recorder.onaudioprocess = null;
      this.recorder.disconnect();
      this.recorder = null;
    }
  }

  /* ── Playback ── */

  private startPlayback(): void {
    if (this.recordLength === 0) {
      this.setState('empty');
      return;
    }

    this.stopPlaybackSource();

    const buffer = this.getAudioBuffer();
    if (!buffer) return;

    this.playbackSource = this.engine.ctx.createBufferSource();
    this.playbackSource.buffer = buffer;
    this.playbackSource.loop = true;
    this.playbackSource.connect(this.gainNode);
    this.playbackSource.start();
    this.loopStartTime = this.engine.ctx.currentTime;

    // Update position tracking
    this.startPositionTracking();

    this.setState('playing');
  }

  private stopPlaybackSource(): void {
    this.stopPositionTracking();
    if (this.playbackSource) {
      try {
        this.playbackSource.stop();
      } catch {
        // Already stopped
      }
      this.playbackSource.disconnect();
      this.playbackSource = null;
    }
    this._playbackPosition = 0;
  }

  /* ── Position tracking ── */

  private positionRAF: number | null = null;

  private startPositionTracking(): void {
    this.stopPositionTracking();
    const tick = () => {
      if (this._state === 'playing' || this._state === 'overdubbing') {
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
