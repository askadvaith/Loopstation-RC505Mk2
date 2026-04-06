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
  private synthOscillators: OscillatorNode[] = [];
  private bandGains: GainNode[] = [];
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private carrierGain!: GainNode;
  private carrierOsc!: OscillatorNode;

  private static readonly BAND_COUNT = 12;
  private static readonly BAND_FREQS = [
    100, 200, 400, 630, 900, 1200, 1600, 2200, 3000, 4000, 5500, 8000
  ];

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'carrier', label: 'CARRIER', min: 0, max: 4, default: 0, choices: ['SAW', 'SQUARE', 'NOISE', 'OSC1', 'OSC2'] },
      { name: 'tone', label: 'TONE', min: 0, max: 100, default: 50 },
      { name: 'attack', label: 'ATTACK', min: 0, max: 100, default: 30 },
      { name: 'modSens', label: 'MOD SENS', min: 0, max: 100, default: 50 },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'carrierThru', label: 'CARRIER THRU', min: 0, max: 100, default: 0 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.carrierGain = this.ctx.createGain();
    this.carrierGain.gain.value = 0;

    // Carrier oscillator (sawtooth default — rich harmonics for vocoding)
    this.carrierOsc = this.ctx.createOscillator();
    this.carrierOsc.type = 'sawtooth';
    this.carrierOsc.frequency.value = 110; // Fundamental carrier pitch
    this.carrierOsc.start();

    // Create analysis (modulator) and synthesis (carrier) filter banks
    for (let i = 0; i < VocoderEffect.BAND_COUNT; i++) {
      const freq = VocoderEffect.BAND_FREQS[i];

      // Analysis band: extracts envelope from input (modulator)
      const analysisBP = this.ctx.createBiquadFilter();
      analysisBP.type = 'bandpass';
      analysisBP.frequency.value = freq;
      analysisBP.Q.value = 5;
      this.analysisBands.push(analysisBP);

      // Synthesis band: filters carrier at same frequency
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
      // Carrier → synth band → bandGain → effectGain → output
      this.inputNode.connect(analysisBP);
      this.carrierOsc.connect(synthBP);
      synthBP.connect(bandGain);
      bandGain.connect(this.effectGain);
    }

    // Dry path
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Wet path
    this.effectGain.connect(this.outputNode);

    // Carrier thru
    this.carrierOsc.connect(this.carrierGain);
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
          const types: OscillatorType[] = ['sawtooth', 'square', 'triangle', 'sine', 'sine'];
          this.carrierOsc.type = types[Math.round(value)] || 'sawtooth';
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
 * OSC BOT — Oscillator-based voice synthesis bot
 * ═══════════════════════════════════════════════════════════════ */

export class OSCBotEffect extends BaseEffect {
  readonly type = 'OSC_BOT';

  private osc!: OscillatorNode;
  private oscGain!: GainNode;
  private directGain!: GainNode;
  private filter!: BiquadFilterNode;
  private analyser!: AnalyserNode;
  private envelopeActive = false;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'oscPitch', label: 'OSC PITCH', min: 0, max: 100, default: 50 },
      { name: 'oscWave', label: 'OSC WAVE', min: 0, max: 3, default: 0, choices: ['SAW', 'SQR', 'TRI', 'SIN'] },
      { name: 'tone', label: 'TONE', min: 0, max: 100, default: 50 },
      { name: 'sensitivity', label: 'SENS', min: 0, max: 100, default: 50 },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;

    this.osc = this.ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = 220;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2000;
    this.filter.Q.value = 3;

    this.oscGain = this.ctx.createGain();
    this.oscGain.gain.value = 0;

    this.osc.connect(this.filter);
    this.filter.connect(this.oscGain);
    this.oscGain.connect(this.outputNode);
    this.osc.start();

    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Envelope follower to modulate OSC amplitude
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.inputNode.connect(this.analyser);

    this.envelopeActive = true;
    this.followEnvelope();
  }

  private followEnvelope = (): void => {
    if (!this.envelopeActive) return;
    const buffer = new Float32Array(128);
    this.analyser.getFloatTimeDomainData(buffer);
    let rms = 0;
    for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / buffer.length);

    const sens = (this.getParam('sensitivity') ?? 50) / 25;
    const level = Math.min(rms * sens, 1);
    this.oscGain.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.02);

    requestAnimationFrame(this.followEnvelope);
  };

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'oscPitch':
        this.osc.frequency.setTargetAtTime(
          this.mapLinear(value, 55, 880), this.ctx.currentTime, 0.01
        );
        break;
      case 'oscWave': {
        const types: OscillatorType[] = ['sawtooth', 'square', 'triangle', 'sine'];
        this.osc.type = types[Math.round(value)] || 'sawtooth';
        break;
      }
      case 'tone':
        this.filter.frequency.setTargetAtTime(
          this.mapFrequency(value), this.ctx.currentTime, 0.02
        );
        break;
      case 'balance':
        this.directGain.gain.setTargetAtTime(1 - value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.envelopeActive = false;
    this.osc.stop();
    this.osc.disconnect();
    this.oscGain.disconnect();
    this.filter.disconnect();
    this.analyser.disconnect();
    this.directGain.disconnect();
    super.dispose();
  }
}
