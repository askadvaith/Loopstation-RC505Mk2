/**
 * AudioEngine — Singleton managing the global AudioContext and audio routing.
 *
 * Signal flow:
 *   Mic/Input → InputGainNode → [InputFX chain] → per-track recording
 *   per-track playback → [TrackFX chain] → TrackGainNode → MasterGain → destination
 */

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

    this.inputGain.connect(this.inputAnalyser);
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
}
