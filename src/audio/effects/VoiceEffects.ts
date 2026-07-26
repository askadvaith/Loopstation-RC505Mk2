/**
 * Voice Effects — Vocoder, OSC Vocoder, Harmonist (Manual/Auto), OSC Bot
 * These effects process voice/pitch in creative ways
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * VOCODER — Classic vocoder effect using analysis/synthesis banks
 * ═══════════════════════════════════════════════════════════════ */

export class VocoderEffect extends BaseEffect {
  readonly type = 'VOCODER';

  // Band analysis and synthesis
  private analysisBands: BiquadFilterNode[] = [];
  private synthBands: BiquadFilterNode[] = [];
  private bandGains: GainNode[] = [];
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private carrierGain!: GainNode;
  private carrierOsc!: OscillatorNode;

  /**
   * External carrier support (Goal 2a): the synthesis bank can be driven either
   * by the internal oscillator OR by an external audio source (e.g. another
   * loop track). `carrierInput` is the entry point an external source connects
   * to; `carrierBus` sums whichever carrier is active and feeds all synth bands.
   */
  readonly carrierInput: GainNode;
  private carrierBus!: GainNode;
  private oscBusGain!: GainNode;
  /** Bookkeeping for EffectsChain: the node currently wired into carrierInput. */
  carrierSrc: AudioNode | null = null;

  private static readonly BAND_COUNT = 12;
  private static readonly BAND_FREQS = [
    100, 200, 400, 630, 900, 1200, 1600, 2200, 3000, 4000, 5500, 8000
  ];

  constructor(ctx: AudioContext) {
    super(ctx);
    // Created here (not buildGraph) so an external source can be wired even
    // before/independently of the DSP graph being (re)built.
    this.carrierInput = ctx.createGain();
    this.carrierInput.gain.value = 0; // off until external carrier selected
  }

  getParamDefs(): EffectParamDef[] {
    return [
      // 0–2 = internal oscillator; 3–7 = external carrier from TRACK 1–5.
      { name: 'carrier', label: 'CARRIER', min: 0, max: 7, default: 0, choices: ['SAW', 'SQUARE', 'NOISE', 'TRK1', 'TRK2', 'TRK3', 'TRK4', 'TRK5'] },
      { name: 'tone', label: 'TONE', min: 0, max: 100, default: 50 },
      { name: 'attack', label: 'ATTACK', min: 0, max: 100, default: 30 },
      { name: 'modSens', label: 'MOD SENS', min: 0, max: 100, default: 50 },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'carrierThru', label: 'CARRIER THRU', min: 0, max: 100, default: 0 },
    ];
  }

  /** True when the carrier param selects a track (external) rather than an OSC. */
  static carrierIsExternal(value: number): boolean {
    return Math.round(value) >= 3;
  }

  /** Track index (0-based) for an external carrier value, or null for internal. */
  static carrierTrackId(value: number): number | null {
    const idx = Math.round(value);
    return idx >= 3 ? idx - 3 : null;
  }

  /** Switch the synth bank between the internal oscillator and the external input. */
  setExternalCarrier(on: boolean): void {
    const t = this.ctx.currentTime;
    this.oscBusGain.gain.setTargetAtTime(on ? 0 : 1, t, 0.01);
    this.carrierInput.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.carrierGain = this.ctx.createGain();
    this.carrierGain.gain.value = 0;

    // Carrier bus: whichever carrier is active feeds all synth bands from here.
    this.carrierBus = this.ctx.createGain();
    this.carrierBus.gain.value = 1;

    // Internal carrier oscillator (sawtooth default — rich harmonics).
    this.carrierOsc = this.ctx.createOscillator();
    this.carrierOsc.type = 'sawtooth';
    this.carrierOsc.frequency.value = 110;
    this.carrierOsc.start();
    this.oscBusGain = this.ctx.createGain();
    this.oscBusGain.gain.value = 1; // internal carrier on by default
    this.carrierOsc.connect(this.oscBusGain);
    this.oscBusGain.connect(this.carrierBus);

    // External carrier (a track's audio) routes in through carrierInput.
    this.carrierInput.connect(this.carrierBus);

    // Create analysis (modulator) and synthesis (carrier) filter banks
    for (let i = 0; i < VocoderEffect.BAND_COUNT; i++) {
      const freq = VocoderEffect.BAND_FREQS[i];

      // Analysis band: extracts envelope from input (modulator)
      const analysisBP = this.ctx.createBiquadFilter();
      analysisBP.type = 'bandpass';
      analysisBP.frequency.value = freq;
      analysisBP.Q.value = 5;
      this.analysisBands.push(analysisBP);

      // Synthesis band: filters the carrier bus at same frequency
      const synthBP = this.ctx.createBiquadFilter();
      synthBP.type = 'bandpass';
      synthBP.frequency.value = freq;
      synthBP.Q.value = 5;
      this.synthBands.push(synthBP);

      // Gain node for each band (modulated by analysis envelope)
      const bandGain = this.ctx.createGain();
      bandGain.gain.value = 0;
      this.bandGains.push(bandGain);

      // Route: input → analysis band (amplitude tracking done via JS)
      // Carrier bus → synth band → bandGain → effectGain → output
      this.inputNode.connect(analysisBP);
      this.carrierBus.connect(synthBP);
      synthBP.connect(bandGain);
      bandGain.connect(this.effectGain);
    }

    // Dry path
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Wet path
    this.effectGain.connect(this.outputNode);

    // Carrier thru (monitors the raw carrier bus)
    this.carrierBus.connect(this.carrierGain);
    this.carrierGain.connect(this.outputNode);

    // Start envelope follower (uses requestAnimationFrame for simple tracking)
    this.startEnvelopeFollower();
  }

  private envelopeFollowerActive = false;
  private analysers: AnalyserNode[] = [];

  private startEnvelopeFollower(): void {
    this.envelopeFollowerActive = true;

    // Attach analysers to each analysis band
    for (let i = 0; i < this.analysisBands.length; i++) {
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 256;
      this.analysisBands[i].connect(analyser);
      this.analysers.push(analyser);
    }

    this.followEnvelope();
  }

  private followEnvelope = (): void => {
    if (!this.envelopeFollowerActive) return;

    const buffer = new Float32Array(128);
    const sensitivity = (this.getParam('modSens') ?? 50) / 25; // 0-4x

    for (let i = 0; i < this.analysers.length; i++) {
      this.analysers[i].getFloatTimeDomainData(buffer);
      // Simple RMS envelope detection
      let rms = 0;
      for (let j = 0; j < buffer.length; j++) {
        rms += buffer[j] * buffer[j];
      }
      rms = Math.sqrt(rms / buffer.length) * sensitivity;
      rms = Math.min(rms, 1);

      this.bandGains[i].gain.setTargetAtTime(rms, this.ctx.currentTime, 0.01);
    }

    requestAnimationFrame(this.followEnvelope);
  };

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'carrier':
        {
          if (VocoderEffect.carrierIsExternal(value)) {
            // Track carrier: actual source wiring is done by EffectsChain.
            this.setExternalCarrier(true);
          } else {
            const types: OscillatorType[] = ['sawtooth', 'square', 'triangle'];
            this.carrierOsc.type = types[Math.round(value)] || 'sawtooth';
            this.setExternalCarrier(false);
          }
        }
        break;
      case 'tone':
        {
          const q = this.mapLinear(value, 1, 15);
          for (const band of this.synthBands) {
            band.Q.setTargetAtTime(q, this.ctx.currentTime, 0.02);
          }
        }
        break;
      case 'balance':
        this.directGain.gain.setTargetAtTime(1 - value / 100, this.ctx.currentTime, 0.01);
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'carrierThru':
        this.carrierGain.gain.setTargetAtTime(value / 200, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.envelopeFollowerActive = false;
    this.carrierOsc.stop();
    this.carrierOsc.disconnect();
    this.carrierGain.disconnect();
    this.oscBusGain.disconnect();
    this.carrierBus.disconnect();
    try { this.carrierInput.disconnect(); } catch { /* ok */ }
    for (const b of this.analysisBands) b.disconnect();
    for (const b of this.synthBands) b.disconnect();
    for (const g of this.bandGains) g.disconnect();
    for (const a of this.analysers) a.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    this.analysisBands = [];
    this.synthBands = [];
    this.bandGains = [];
    this.analysers = [];
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * OSC VOCODER — Vocoder with dedicated oscillator carrier
 * ═══════════════════════════════════════════════════════════════ */

export class OSCVocoderEffect extends BaseEffect {
  readonly type = 'OSC_VOCODER';

  private analysisBands: BiquadFilterNode[] = [];
  private synthBands: BiquadFilterNode[] = [];
  private bandGains: GainNode[] = [];
  private analysers: AnalyserNode[] = [];
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private carrier!: OscillatorNode;
  private carrierGain!: GainNode;
  private envelopeActive = false;

  private static readonly FREQS = [100, 200, 400, 630, 900, 1200, 1600, 2200, 3000, 4000, 5500, 8000];

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'oscPitch', label: 'OSC PITCH', min: 0, max: 100, default: 50 },
      { name: 'oscWave', label: 'OSC WAVE', min: 0, max: 3, default: 0, choices: ['SAW', 'SQR', 'TRI', 'SIN'] },
      { name: 'tone', label: 'TONE', min: 0, max: 100, default: 50 },
      { name: 'modSens', label: 'MOD SENS', min: 0, max: 100, default: 50 },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    // Oscillator carrier
    this.carrier = this.ctx.createOscillator();
    this.carrier.type = 'sawtooth';
    this.carrier.frequency.value = 110;
    this.carrierGain = this.ctx.createGain();
    this.carrierGain.gain.value = 1;
    this.carrier.connect(this.carrierGain);
    this.carrier.start();

    for (let i = 0; i < OSCVocoderEffect.FREQS.length; i++) {
      const freq = OSCVocoderEffect.FREQS[i];

      const analysisBP = this.ctx.createBiquadFilter();
      analysisBP.type = 'bandpass';
      analysisBP.frequency.value = freq;
      analysisBP.Q.value = 5;
      this.analysisBands.push(analysisBP);

      const synthBP = this.ctx.createBiquadFilter();
      synthBP.type = 'bandpass';
      synthBP.frequency.value = freq;
      synthBP.Q.value = 5;
      this.synthBands.push(synthBP);

      const bandGain = this.ctx.createGain();
      bandGain.gain.value = 0;
      this.bandGains.push(bandGain);

      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 256;
      this.analysers.push(analyser);

      this.inputNode.connect(analysisBP);
      analysisBP.connect(analyser);
      this.carrierGain.connect(synthBP);
      synthBP.connect(bandGain);
      bandGain.connect(this.effectGain);
    }

    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);
    this.effectGain.connect(this.outputNode);

    this.envelopeActive = true;
    this.followEnvelope();
  }

  private followEnvelope = (): void => {
    if (!this.envelopeActive) return;
    const buffer = new Float32Array(128);
    const sens = (this.getParam('modSens') ?? 50) / 25;

    for (let i = 0; i < this.analysers.length; i++) {
      this.analysers[i].getFloatTimeDomainData(buffer);
      let rms = 0;
      for (let j = 0; j < buffer.length; j++) rms += buffer[j] * buffer[j];
      rms = Math.min(Math.sqrt(rms / buffer.length) * sens, 1);
      this.bandGains[i].gain.setTargetAtTime(rms, this.ctx.currentTime, 0.01);
    }
    requestAnimationFrame(this.followEnvelope);
  };

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'oscPitch':
        this.carrier.frequency.setTargetAtTime(
          this.mapLinear(value, 55, 880), this.ctx.currentTime, 0.01
        );
        break;
      case 'oscWave': {
        const types: OscillatorType[] = ['sawtooth', 'square', 'triangle', 'sine'];
        this.carrier.type = types[Math.round(value)] || 'sawtooth';
        break;
      }
      case 'balance':
        this.directGain.gain.setTargetAtTime(1 - value / 100, this.ctx.currentTime, 0.01);
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.envelopeActive = false;
    this.carrier.stop();
    this.carrier.disconnect();
    this.carrierGain.disconnect();
    for (const n of [...this.analysisBands, ...this.synthBands, ...this.bandGains, ...this.analysers]) n.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    this.analysisBands = [];
    this.synthBands = [];
    this.bandGains = [];
    this.analysers = [];
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * HARMONIST (MANUAL) — Pitch-shifted harmonies at fixed intervals
 * ═══════════════════════════════════════════════════════════════ */

export class HarmonistManualEffect extends BaseEffect {
  readonly type = 'HARMONIST_MANUAL';

  private directGain!: GainNode;
  private harmonyGain!: GainNode;
  private delay!: DelayNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private feedbackGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'harmony', label: 'HARMONY', min: -24, max: 24, default: 0, step: 1 },
      { name: 'preDelay', label: 'PRE DELAY', min: 0, max: 100, default: 0 },
      { name: 'feedback', label: 'FEEDBACK', min: 0, max: 100, default: 0, sequenceable: true },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 50 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;

    this.harmonyGain = this.ctx.createGain();
    this.harmonyGain.gain.value = 0.5;

    // Pitch shifting via modulated delay
    this.delay = this.ctx.createDelay(0.1);
    this.delay.delayTime.value = 0.02;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sawtooth';
    this.lfo.frequency.value = 50; // Modulation rate for pitch shift
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.001; // Corresponds to ~0 semitones shift
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0;

    // Dry path
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Harmony path
    this.inputNode.connect(this.delay);
    this.delay.connect(this.harmonyGain);
    this.harmonyGain.connect(this.outputNode);
    this.delay.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'harmony': {
        // Semitone shift: adjust LFO depth for pitch change
        const semitones = Math.round(value);
        const ratio = Math.pow(2, semitones / 12) - 1;
        const depth = Math.abs(ratio) * 0.01;
        this.lfoGain.gain.setTargetAtTime(depth, this.ctx.currentTime, 0.01);
        if (semitones < 0) {
          this.lfo.frequency.setTargetAtTime(-50, this.ctx.currentTime, 0.01);
        } else {
          this.lfo.frequency.setTargetAtTime(50, this.ctx.currentTime, 0.01);
        }
        break;
      }
      case 'feedback':
        this.feedbackGain.gain.setTargetAtTime(value / 120, this.ctx.currentTime, 0.01);
        break;
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.harmonyGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.delay.disconnect();
    this.feedbackGain.disconnect();
    this.directGain.disconnect();
    this.harmonyGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * HARMONIST (AUTO) — Automatic key-aware harmonies
 * Same as manual but with key/scale awareness (simplified)
 * ═══════════════════════════════════════════════════════════════ */

export class HarmonistAutoEffect extends BaseEffect {
  readonly type = 'HARMONIST_AUTO';

  private directGain!: GainNode;
  private harmonyGain!: GainNode;
  private delay!: DelayNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'key', label: 'KEY', min: 0, max: 11, default: 0, step: 1, choices: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] },
      { name: 'harmony', label: 'HARMONY', min: -12, max: 12, default: 4, step: 1, sequenceable: true },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 50 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;

    this.harmonyGain = this.ctx.createGain();
    this.harmonyGain.gain.value = 0.5;

    this.delay = this.ctx.createDelay(0.1);
    this.delay.delayTime.value = 0.02;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sawtooth';
    this.lfo.frequency.value = 50;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.002; // Small pitch shift
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();

    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.inputNode.connect(this.delay);
    this.delay.connect(this.harmonyGain);
    this.harmonyGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'harmony': {
        const semitones = Math.round(value);
        const ratio = Math.pow(2, semitones / 12) - 1;
        this.lfoGain.gain.setTargetAtTime(Math.abs(ratio) * 0.01, this.ctx.currentTime, 0.01);
        break;
      }
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.harmonyGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.delay.disconnect();
    this.directGain.disconnect();
    this.harmonyGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * OSC BOT — Oscillator that plays a NOTE (for melodies + the sequencer)
 *
 * Hardware: "Plays the oscillator to match the value in the NOTE parameter.
 * This plays melodies and other phrases in combination with the sequencer."
 * So OSC BOT is a SYNTH whose pitch is set by NOTE (a real note range, driven
 * live via ← → or stepped by the FX Sequencer). The audio input only *modulates*
 * it (MOD SENS); BALANCE mixes in the dry voice.
 *
 * The old implementation kept 50% dry voice regardless of BALANCE (the "voice
 * in the background") and had no note range, so it could not play a melody.
 * This version outputs a clean oscillator (default BALANCE = full effect, no
 * dry) and uses a pure audio-graph envelope so it renders offline too.
 * ═══════════════════════════════════════════════════════════════ */

const OSC_PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OSC_BOT_MIN_MIDI = 36; // C2
const OSC_BOT_MAX_MIDI = 84; // C6
const OSC_BOT_NOTE_NAMES = Array.from(
  { length: OSC_BOT_MAX_MIDI - OSC_BOT_MIN_MIDI + 1 },
  (_, i) => {
    const m = OSC_BOT_MIN_MIDI + i;
    return OSC_PITCH_NAMES[m % 12] + (Math.floor(m / 12) - 1);
  }
);
/** Frequency (Hz) for an OSC BOT NOTE index (0 = C2). */
function oscBotNoteFreq(noteIdx: number): number {
  const midi = OSC_BOT_MIN_MIDI + Math.round(noteIdx);
  return 440 * Math.pow(2, (midi - 69) / 12);
}
/** WaveShaper curve: full-wave rectify (|x|), for a graph-based envelope. */
function absCurve(n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.abs(x); }
  return c;
}
/** WaveShaper curve: clamp to [0,1]. */
function clamp01Curve(n = 2048) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.min(1, Math.max(0, x)); }
  return c;
}

export class OSCBotEffect extends BaseEffect {
  readonly type = 'OSC_BOT';

  private osc!: OscillatorNode;
  private toneFilter!: BiquadFilterNode;
  private oscVCA!: GainNode;
  private directGain!: GainNode;   // dry voice (BALANCE)
  private effectGain!: GainNode;   // wet oscillator (BALANCE)
  // Offline-safe envelope follower (no AnalyserNode / requestAnimationFrame).
  private envRectify!: WaveShaperNode;
  private envSmooth!: BiquadFilterNode;
  private envScale!: GainNode;
  private envClamp!: WaveShaperNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      // NOTE spans a real melodic range and is ★-sequenceable, so the FX
      // Sequence (or live ← →) can play a melody. Default D#3 matches the
      // reference performance's starting note.
      { name: 'note', label: 'NOTE', min: 0, max: OSC_BOT_NOTE_NAMES.length - 1, default: 15, step: 1, choices: OSC_BOT_NOTE_NAMES, sequenceable: true },
      { name: 'oscWave', label: 'OSC', min: 0, max: 4, default: 0, choices: ['SAW', 'VINT SAW', 'DTNE SAW', 'SQR', 'RECT'] },
      { name: 'tone', label: 'TONE', min: -50, max: 50, default: 0 },
      { name: 'attack', label: 'ATTACK', min: 0, max: 100, default: 0 },
      { name: 'modSens', label: 'MOD SENS', min: 0, max: 100, default: 50 },
      // BALANCE 100 = pure oscillator (no dry voice). The hardware default is 50,
      // but that bleeds the raw voice; turn it down to blend your voice back in.
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 100, sequenceable: true },
    ];
  }

  private noteFreq(): number {
    return oscBotNoteFreq(this.getParam('note') ?? 15);
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // BALANCE mixes dry voice (direct) against the oscillator (effect).
    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0; // full effect by default (set by balance)
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 1;
    this.effectGain.connect(this.outputNode);

    // Oscillator at NOTE.
    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = this.noteFreq();
    this.osc.start();

    this.toneFilter = this.ctx.createBiquadFilter();
    this.toneFilter.type = 'lowpass';
    this.toneFilter.frequency.value = 6000;
    this.toneFilter.Q.value = 0.7;

    // The oscillator plays at a floor level; the voice envelope opens it further
    // (MOD SENS = how much). So it works stepped by the sequencer (no input) AND
    // gated by singing "ah".
    this.oscVCA = this.ctx.createGain();
    this.oscVCA.gain.value = 0.35;

    this.osc.connect(this.toneFilter);
    this.toneFilter.connect(this.oscVCA);
    this.oscVCA.connect(this.effectGain);

    // Offline-safe envelope follower feeding oscVCA.gain (adds to the floor).
    this.envRectify = this.ctx.createWaveShaper();
    this.envRectify.curve = absCurve();
    this.envSmooth = this.ctx.createBiquadFilter();
    this.envSmooth.type = 'lowpass';
    this.envSmooth.frequency.value = 16;
    this.envScale = this.ctx.createGain();
    this.envScale.gain.value = 3; // scaled by MOD SENS in applyParam
    this.envClamp = this.ctx.createWaveShaper();
    this.envClamp.curve = clamp01Curve();

    this.inputNode.connect(this.envRectify);
    this.envRectify.connect(this.envSmooth);
    this.envSmooth.connect(this.envScale);
    this.envScale.connect(this.envClamp);
    this.envClamp.connect(this.oscVCA.gain);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'note':
        this.osc.frequency.setTargetAtTime(this.noteFreq(), this.ctx.currentTime, 0.01);
        break;
      case 'oscWave': {
        // SAW / VINTAGE SAW / DETUNE SAW → sawtooth; SQUARE / RECT → square.
        const idx = Math.round(value);
        this.osc.type = idx >= 3 ? 'square' : 'sawtooth';
        this.osc.detune.setTargetAtTime(idx === 2 ? 10 : 0, this.ctx.currentTime, 0.01); // DETUNE SAW
        break;
      }
      case 'tone':
        // -50..+50 → darker..brighter low-pass.
        this.toneFilter.frequency.setTargetAtTime(
          this.mapLinear(value + 50, 700, 12000), this.ctx.currentTime, 0.02
        );
        break;
      case 'attack':
        // More attack = slower envelope response (lower follower cutoff).
        this.envSmooth.frequency.setTargetAtTime(
          this.mapLinear(100 - value, 4, 30), this.ctx.currentTime, 0.02
        );
        break;
      case 'modSens': {
        const sens = value / 100; // 0..1
        // 0 → oscillator plays continuously; 1 → fully gated by the voice.
        this.oscVCA.gain.setTargetAtTime(0.6 * (1 - sens) + 0.02, this.ctx.currentTime, 0.02);
        this.envScale.gain.setTargetAtTime(6 * sens, this.ctx.currentTime, 0.02);
        break;
      }
      case 'balance':
        this.directGain.gain.setTargetAtTime((100 - value) / 100, this.ctx.currentTime, 0.01);
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.osc.stop();
    this.osc.disconnect();
    this.toneFilter.disconnect();
    this.oscVCA.disconnect();
    this.envRectify.disconnect();
    this.envSmooth.disconnect();
    this.envScale.disconnect();
    this.envClamp.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}
