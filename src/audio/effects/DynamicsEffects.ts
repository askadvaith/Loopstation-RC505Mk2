/**
 * Dynamics & EQ Effects — Dynamics (compressor/limiter), EQ (4-band parametric),
 *                         Dist (distortion), Preamp, Sustainer
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * DYNAMICS — Compressor / Limiter (19 presets)
 * ═══════════════════════════════════════════════════════════════ */

const DYNAMICS_PRESETS: {
  name: string;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
  makeupGain: number;
}[] = [
  { name: 'NATURAL COMP', threshold: -18, ratio: 3, attack: 0.01, release: 0.15, knee: 10, makeupGain: 3 },
  { name: 'MIXER COMP', threshold: -20, ratio: 4, attack: 0.005, release: 0.1, knee: 5, makeupGain: 5 },
  { name: 'LIVE COMP', threshold: -15, ratio: 3, attack: 0.01, release: 0.2, knee: 8, makeupGain: 4 },
  { name: 'NATURAL LIM', threshold: -10, ratio: 10, attack: 0.001, release: 0.1, knee: 2, makeupGain: 2 },
  { name: 'HARD LIM', threshold: -6, ratio: 20, attack: 0.001, release: 0.05, knee: 0, makeupGain: 1 },
  { name: 'JINGLE COMP', threshold: -22, ratio: 5, attack: 0.003, release: 0.12, knee: 6, makeupGain: 6 },
  { name: 'HARD COMP', threshold: -25, ratio: 8, attack: 0.002, release: 0.08, knee: 3, makeupGain: 8 },
  { name: 'SOFT COMP', threshold: -15, ratio: 2, attack: 0.02, release: 0.25, knee: 15, makeupGain: 3 },
  { name: 'CLEAN COMP', threshold: -18, ratio: 3, attack: 0.008, release: 0.15, knee: 10, makeupGain: 4 },
  { name: 'DANCE COMP', threshold: -20, ratio: 6, attack: 0.001, release: 0.08, knee: 5, makeupGain: 6 },
  { name: 'ORCH COMP', threshold: -18, ratio: 2.5, attack: 0.015, release: 0.3, knee: 12, makeupGain: 3 },
  { name: 'VOCAL COMP', threshold: -16, ratio: 4, attack: 0.005, release: 0.12, knee: 8, makeupGain: 5 },
  { name: 'ACOUSTIC', threshold: -18, ratio: 3, attack: 0.01, release: 0.2, knee: 10, makeupGain: 4 },
  { name: 'ROCK BAND', threshold: -22, ratio: 6, attack: 0.003, release: 0.1, knee: 5, makeupGain: 7 },
  { name: 'ORCHESTRA', threshold: -15, ratio: 2, attack: 0.02, release: 0.35, knee: 15, makeupGain: 2 },
  { name: 'LOW BOOST', threshold: -20, ratio: 4, attack: 0.005, release: 0.12, knee: 8, makeupGain: 5 },
  { name: 'BRIGHTEN', threshold: -18, ratio: 3.5, attack: 0.008, release: 0.15, knee: 8, makeupGain: 4 },
  { name: "DJ's VOICE", threshold: -22, ratio: 5, attack: 0.002, release: 0.08, knee: 5, makeupGain: 6 },
  { name: 'PHONE VOX', threshold: -25, ratio: 8, attack: 0.001, release: 0.05, knee: 3, makeupGain: 8 },
];

export class DynamicsEffect extends BaseEffect {
  readonly type = 'DYNAMICS';

  private compressor!: DynamicsCompressorNode;
  private makeupGainNode!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      {
        name: 'dynamics',
        label: 'DYNAMICS',
        min: 0,
        max: DYNAMICS_PRESETS.length - 1,
        default: 0,
        step: 1,
        choices: DYNAMICS_PRESETS.map((p) => p.name),
      },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.compressor = this.ctx.createDynamicsCompressor();
    this.makeupGainNode = this.ctx.createGain();
    this.makeupGainNode.gain.value = 1;

    this.inputNode.connect(this.compressor);
    this.compressor.connect(this.makeupGainNode);
    this.makeupGainNode.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    if (name === 'dynamics') {
      const preset = DYNAMICS_PRESETS[Math.round(value)] ?? DYNAMICS_PRESETS[0];
      this.compressor.threshold.setTargetAtTime(preset.threshold, this.ctx.currentTime, 0.01);
      this.compressor.ratio.setTargetAtTime(preset.ratio, this.ctx.currentTime, 0.01);
      this.compressor.attack.setTargetAtTime(preset.attack, this.ctx.currentTime, 0.01);
      this.compressor.release.setTargetAtTime(preset.release, this.ctx.currentTime, 0.01);
      this.compressor.knee.setTargetAtTime(preset.knee, this.ctx.currentTime, 0.01);
      this.makeupGainNode.gain.setTargetAtTime(
        Math.pow(10, preset.makeupGain / 20),
        this.ctx.currentTime,
        0.01
      );
    }
  }

  dispose(): void {
    this.compressor.disconnect();
    this.makeupGainNode.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * EQ — 4-band parametric equalizer
 * ═══════════════════════════════════════════════════════════════ */

export class EQEffect extends BaseEffect {
  readonly type = 'EQ';

  private lowShelf!: BiquadFilterNode;
  private loMid!: BiquadFilterNode;
  private hiMid!: BiquadFilterNode;
  private highShelf!: BiquadFilterNode;
  private levelGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'lo', label: 'LO', min: -20, max: 20, default: 0, unit: 'dB' },
      { name: 'loMid', label: 'LO-MID', min: -20, max: 20, default: 0, unit: 'dB' },
      { name: 'loMidFreq', label: 'LO-MID FREQ', min: 0, max: 100, default: 40 },
      { name: 'loMidQ', label: 'LO-MID Q', min: 0, max: 5, default: 1, step: 1, choices: ['0.5', '1', '2', '4', '8', '16'] },
      { name: 'hiMid', label: 'HI-MID', min: -20, max: 20, default: 0, unit: 'dB' },
      { name: 'hiMidFreq', label: 'HI-MID FREQ', min: 0, max: 100, default: 65 },
      { name: 'hiMidQ', label: 'HI-MID Q', min: 0, max: 5, default: 1, step: 1, choices: ['0.5', '1', '2', '4', '8', '16'] },
      { name: 'high', label: 'HIGH', min: -20, max: 20, default: 0, unit: 'dB' },
      { name: 'level', label: 'LEVEL', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.lowShelf = this.ctx.createBiquadFilter();
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 200;

    this.loMid = this.ctx.createBiquadFilter();
    this.loMid.type = 'peaking';
    this.loMid.frequency.value = 800;
    this.loMid.Q.value = 1;

    this.hiMid = this.ctx.createBiquadFilter();
    this.hiMid.type = 'peaking';
    this.hiMid.frequency.value = 3150;
    this.hiMid.Q.value = 1;

    this.highShelf = this.ctx.createBiquadFilter();
    this.highShelf.type = 'highshelf';
    this.highShelf.frequency.value = 5000;

    this.levelGain = this.ctx.createGain();
    this.levelGain.gain.value = 1;

    this.inputNode.connect(this.lowShelf);
    this.lowShelf.connect(this.loMid);
    this.loMid.connect(this.hiMid);
    this.hiMid.connect(this.highShelf);
    this.highShelf.connect(this.levelGain);
    this.levelGain.connect(this.outputNode);
  }

  private static Q_VALUES = [0.5, 1, 2, 4, 8, 16];

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'lo':
        this.lowShelf.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        break;
      case 'loMid':
        this.loMid.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        break;
      case 'loMidFreq':
        this.loMid.frequency.setTargetAtTime(this.mapFrequency(value, 20, 10000), this.ctx.currentTime, 0.01);
        break;
      case 'loMidQ':
        this.loMid.Q.value = EQEffect.Q_VALUES[Math.round(value)] ?? 1;
        break;
      case 'hiMid':
        this.hiMid.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        break;
      case 'hiMidFreq':
        this.hiMid.frequency.setTargetAtTime(this.mapFrequency(value, 20, 10000), this.ctx.currentTime, 0.01);
        break;
      case 'hiMidQ':
        this.hiMid.Q.value = EQEffect.Q_VALUES[Math.round(value)] ?? 1;
        break;
      case 'high':
        this.highShelf.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        break;
      case 'level':
        this.levelGain.gain.setTargetAtTime(value / 50, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.lowShelf.disconnect();
    this.loMid.disconnect();
    this.hiMid.disconnect();
    this.highShelf.disconnect();
    this.levelGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * DIST — Distortion
 * ═══════════════════════════════════════════════════════════════ */

const DIST_TYPES = ['VOCAL', 'BOOST', 'OD', 'DS', 'METAL', 'FUZZ'];

export class DistEffect extends BaseEffect {
  readonly type = 'DIST';

  private waveshaper!: WaveShaperNode;
  private toneFilter!: BiquadFilterNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'distType', label: 'TYPE', min: 0, max: 5, default: 1, step: 1, choices: DIST_TYPES },
      { name: 'tone', label: 'TONE', min: -50, max: 50, default: 0 },
      { name: 'dist', label: 'DIST', min: 0, max: 100, default: 50 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 100 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1.0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.waveshaper = this.ctx.createWaveShaper();
    this.waveshaper.oversample = '4x';
    this.setDistortionCurve(50);

    this.toneFilter = this.ctx.createBiquadFilter();
    this.toneFilter.type = 'lowpass';
    this.toneFilter.frequency.value = 8000;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.waveshaper);
    this.waveshaper.connect(this.toneFilter);
    this.toneFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  private setDistortionCurve(amount: number): void {
    const k = amount * 4;
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    this.waveshaper.curve = curve;
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'dist':
        this.setDistortionCurve(value);
        break;
      case 'tone':
        this.toneFilter.frequency.setTargetAtTime(
          this.mapFrequency((value + 50) * 100 / 100, 1000, 18000),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.waveshaper.disconnect();
    this.toneFilter.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * PREAMP — Guitar amplifier simulation
 * ═══════════════════════════════════════════════════════════════ */

const AMP_TYPES = [
  'JC-120', 'NATURAL CLEAN', 'FULL RANGE', 'COMBO CRUNCH',
  'STACK CRUNCH', 'HIGAIN STACK', 'POWER DRIVE', 'EXTREM LEAD', 'CORE METAL',
];

export class PreampEffect extends BaseEffect {
  readonly type = 'PREAMP';

  private inputGainNode!: GainNode;
  private waveshaper!: WaveShaperNode;
  private bassFilter!: BiquadFilterNode;
  private midFilter!: BiquadFilterNode;
  private trebleFilter!: BiquadFilterNode;
  private presenceFilter!: BiquadFilterNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'ampType', label: 'AMP TYPE', min: 0, max: 8, default: 0, step: 1, choices: AMP_TYPES },
      { name: 'gain', label: 'GAIN', min: 0, max: 120, default: 50 },
      { name: 'bass', label: 'BASS', min: 0, max: 100, default: 50 },
      { name: 'middle', label: 'MIDDLE', min: 0, max: 100, default: 50 },
      { name: 'treble', label: 'TREBLE', min: 0, max: 100, default: 50 },
      { name: 'presence', label: 'PRESENCE', min: 0, max: 100, default: 50 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.inputGainNode = this.ctx.createGain();
    this.inputGainNode.gain.value = 1;

    this.waveshaper = this.ctx.createWaveShaper();
    this.waveshaper.oversample = '2x';
    this.setAmpCurve(50);

    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = 'lowshelf';
    this.bassFilter.frequency.value = 300;

    this.midFilter = this.ctx.createBiquadFilter();
    this.midFilter.type = 'peaking';
    this.midFilter.frequency.value = 1000;
    this.midFilter.Q.value = 1;

    this.trebleFilter = this.ctx.createBiquadFilter();
    this.trebleFilter.type = 'highshelf';
    this.trebleFilter.frequency.value = 3000;

    this.presenceFilter = this.ctx.createBiquadFilter();
    this.presenceFilter.type = 'highshelf';
    this.presenceFilter.frequency.value = 6000;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.inputGainNode);
    this.inputGainNode.connect(this.waveshaper);
    this.waveshaper.connect(this.bassFilter);
    this.bassFilter.connect(this.midFilter);
    this.midFilter.connect(this.trebleFilter);
    this.trebleFilter.connect(this.presenceFilter);
    this.presenceFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  private setAmpCurve(gain: number): void {
    const k = gain * 2;
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(k * x / 50);
    }
    this.waveshaper.curve = curve;
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'gain':
        this.setAmpCurve(value);
        this.inputGainNode.gain.setTargetAtTime(
          this.mapLinear(value, 0.3, 3),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'bass':
        this.bassFilter.gain.setTargetAtTime(this.mapLinear(value, -15, 15), this.ctx.currentTime, 0.01);
        break;
      case 'middle':
        this.midFilter.gain.setTargetAtTime(this.mapLinear(value, -15, 15), this.ctx.currentTime, 0.01);
        break;
      case 'treble':
        this.trebleFilter.gain.setTargetAtTime(this.mapLinear(value, -15, 15), this.ctx.currentTime, 0.01);
        break;
      case 'presence':
        this.presenceFilter.gain.setTargetAtTime(this.mapLinear(value, -10, 10), this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.inputGainNode.disconnect();
    this.waveshaper.disconnect();
    this.bassFilter.disconnect();
    this.midFilter.disconnect();
    this.trebleFilter.disconnect();
    this.presenceFilter.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * SUSTAINER — Long sustain without distortion
 * ═══════════════════════════════════════════════════════════════ */

export class SustainerEffect extends BaseEffect {
  readonly type = 'SUSTAINER';

  private compressor!: DynamicsCompressorNode;
  private lowFilter!: BiquadFilterNode;
  private highFilter!: BiquadFilterNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'attack', label: 'ATTACK', min: 0, max: 100, default: 50 },
      { name: 'release', label: 'RELEASE', min: 0, max: 100, default: 50 },
      { name: 'level', label: 'LEVEL', min: 0, max: 100, default: 50 },
      { name: 'lowGain', label: 'LOW GAIN', min: -20, max: 20, default: 0, unit: 'dB' },
      { name: 'hiGain', label: 'HI GAIN', min: -20, max: 20, default: 0, unit: 'dB' },
      { name: 'sustain', label: 'SUSTAIN', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -30;
    this.compressor.ratio.value = 12;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.3;

    this.lowFilter = this.ctx.createBiquadFilter();
    this.lowFilter.type = 'lowshelf';
    this.lowFilter.frequency.value = 300;

    this.highFilter = this.ctx.createBiquadFilter();
    this.highFilter.type = 'highshelf';
    this.highFilter.frequency.value = 3000;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.compressor);
    this.compressor.connect(this.lowFilter);
    this.lowFilter.connect(this.highFilter);
    this.highFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'attack':
        this.compressor.attack.setTargetAtTime(this.mapLinear(value, 0.001, 0.1), this.ctx.currentTime, 0.01);
        break;
      case 'release':
        this.compressor.release.setTargetAtTime(this.mapLinear(value, 0.05, 1.0), this.ctx.currentTime, 0.01);
        break;
      case 'level':
        this.effectGain.gain.setTargetAtTime(value / 50, this.ctx.currentTime, 0.01);
        break;
      case 'lowGain':
        this.lowFilter.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        break;
      case 'hiGain':
        this.highFilter.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
        break;
      case 'sustain':
        this.compressor.threshold.setTargetAtTime(this.mapLinear(value, -10, -50), this.ctx.currentTime, 0.01);
        this.compressor.ratio.setTargetAtTime(this.mapLinear(value, 2, 20), this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.compressor.disconnect();
    this.lowFilter.disconnect();
    this.highFilter.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * G2B — Guitar to Bass
 * ═══════════════════════════════════════════════════════════════ */

export class G2BEffect extends BaseEffect {
  readonly type = 'G2B';

  private lpFilter!: BiquadFilterNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50 },
      { name: 'mode', label: 'MODE', min: 0, max: 1, default: 0, choices: ['1', '2'] },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Simulate octave-down by heavy LP filtering (simplified approach)
    this.lpFilter = this.ctx.createBiquadFilter();
    this.lpFilter.type = 'lowpass';
    this.lpFilter.frequency.value = 250;
    this.lpFilter.Q.value = 2;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.lpFilter);
    this.lpFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'balance':
        this.directGain.gain.setTargetAtTime(1 - value / 100, this.ctx.currentTime, 0.01);
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.lpFilter.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}
