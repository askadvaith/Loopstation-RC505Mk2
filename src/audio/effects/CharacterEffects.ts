/**
 * Character Effects — Lo-Fi, Radio, Twist, Warp, Freeze
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * LO-FI — Intentional degradation (bit-crush + sample-rate reduction)
 * ═══════════════════════════════════════════════════════════════ */

export class LoFiEffect extends BaseEffect {
  readonly type = 'LO_FI';

  private waveshaper!: WaveShaperNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private lpFilter!: BiquadFilterNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'bitDepth', label: 'BITDEPTH', min: 1, max: 31, default: 8 },
      { name: 'sampleRate', label: 'SAMPLERATE', min: 1, max: 6, default: 2, step: 1, choices: ['1/2', '1/4', '1/8', '1/16', '1/24', '1/32'] },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Bit-crush via waveshaper (quantization)
    this.waveshaper = this.ctx.createWaveShaper();
    this.waveshaper.oversample = 'none';
    this.setBitCrushCurve(8);

    // Low-pass to simulate sample-rate reduction
    this.lpFilter = this.ctx.createBiquadFilter();
    this.lpFilter.type = 'lowpass';
    this.lpFilter.frequency.value = 11025;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.waveshaper);
    this.waveshaper.connect(this.lpFilter);
    this.lpFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  private setBitCrushCurve(bits: number): void {
    const steps = Math.pow(2, bits);
    const n = 65536;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
    this.waveshaper.curve = curve;
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'bitDepth':
        this.setBitCrushCurve(Math.max(1, Math.round(value)));
        break;
      case 'sampleRate': {
        // Reduce frequency based on downsampling factor
        const divisors = [2, 4, 8, 16, 24, 32];
        const divisor = divisors[Math.round(value) - 1] ?? 4;
        this.lpFilter.frequency.setTargetAtTime(
          this.ctx.sampleRate / divisor / 2,
          this.ctx.currentTime, 0.01
        );
        break;
      }
      case 'balance':
        this.directGain.gain.setTargetAtTime(1 - value / 100, this.ctx.currentTime, 0.01);
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.waveshaper.disconnect();
    this.lpFilter.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * RADIO — Radio voice effect
 * ═══════════════════════════════════════════════════════════════ */

export class RadioEffect extends BaseEffect {
  readonly type = 'RADIO';

  private hpFilter!: BiquadFilterNode;
  private lpFilter!: BiquadFilterNode;
  private waveshaper!: WaveShaperNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'loFi', label: 'LO-FI', min: 1, max: 10, default: 5, step: 1 },
      { name: 'level', label: 'LEVEL', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.hpFilter = this.ctx.createBiquadFilter();
    this.hpFilter.type = 'highpass';
    this.hpFilter.frequency.value = 500;
    this.hpFilter.Q.value = 1;

    this.lpFilter = this.ctx.createBiquadFilter();
    this.lpFilter.type = 'lowpass';
    this.lpFilter.frequency.value = 3000;
    this.lpFilter.Q.value = 1;

    this.waveshaper = this.ctx.createWaveShaper();
    this.waveshaper.oversample = 'none';
    this.setRadioCurve(5);

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.hpFilter);
    this.hpFilter.connect(this.lpFilter);
    this.lpFilter.connect(this.waveshaper);
    this.waveshaper.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  private setRadioCurve(amount: number): void {
    const k = amount * 10;
    const n = 8192;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(k * x / 10);
    }
    this.waveshaper.curve = curve;
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'loFi':
        this.setRadioCurve(value);
        // Narrow the bandwidth more with higher lo-fi
        this.hpFilter.frequency.setTargetAtTime(
          this.mapLinear(value / 10 * 100, 200, 800),
          this.ctx.currentTime, 0.01
        );
        this.lpFilter.frequency.setTargetAtTime(
          this.mapLinear((10 - value) / 10 * 100, 2000, 5000),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'level':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.hpFilter.disconnect();
    this.lpFilter.disconnect();
    this.waveshaper.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * TWIST — Aggressive rotation effect
 * ═══════════════════════════════════════════════════════════════ */

export class TwistEffect extends BaseEffect {
  readonly type = 'TWIST';

  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private tremoloGain!: GainNode;
  private filter!: BiquadFilterNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'release', label: 'RELEASE', min: 0, max: 1, default: 0, choices: ['FALL', 'FADE'] },
      { name: 'rise', label: 'RISE', min: 0, max: 100, default: 50 },
      { name: 'fall', label: 'FALL', min: 0, max: 100, default: 50 },
      { name: 'level', label: 'LEVEL', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Rotating speaker simulation: filter + tremolo + pitch mod
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 1000;
    this.filter.Q.value = 3;

    this.tremoloGain = this.ctx.createGain();
    this.tremoloGain.gain.value = 1;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 6;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.4;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.tremoloGain.gain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start();

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.filter);
    this.filter.connect(this.tremoloGain);
    this.tremoloGain.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'rise':
        this.lfo.frequency.setTargetAtTime(this.mapLinear(value, 1, 20), this.ctx.currentTime, 0.01);
        break;
      case 'level':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.tremoloGain.disconnect();
    this.filter.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * WARP — Dream-like ethereal sound
 * ═══════════════════════════════════════════════════════════════ */

export class WarpEffect extends BaseEffect {
  readonly type = 'WARP';

  private delay1!: DelayNode;
  private delay2!: DelayNode;
  private feedbackGain!: GainNode;
  private lpFilter!: BiquadFilterNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'level', label: 'LEVEL', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();
    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    this.delay1 = this.ctx.createDelay(1.0);
    this.delay1.delayTime.value = 0.15;
    this.delay2 = this.ctx.createDelay(1.0);
    this.delay2.delayTime.value = 0.23;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.6;

    this.lpFilter = this.ctx.createBiquadFilter();
    this.lpFilter.type = 'lowpass';
    this.lpFilter.frequency.value = 3000;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.delay1);
    this.delay1.connect(this.delay2);
    this.delay2.connect(this.lpFilter);
    this.lpFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
    this.lpFilter.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay1);
  }

  applyParam(name: string, value: number): void {
    if (name === 'level') {
      this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
    }
  }

  dispose(): void {
    this.delay1.disconnect();
    this.delay2.disconnect();
    this.feedbackGain.disconnect();
    this.lpFilter.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * FREEZE — Infinite sustain
 * ═══════════════════════════════════════════════════════════════ */

export class FreezeEffect extends BaseEffect {
  readonly type = 'FREEZE';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'attack', label: 'ATTACK', min: 0, max: 100, default: 30 },
      { name: 'release', label: 'RELEASE', min: 0, max: 100, default: 30 },
      { name: 'decay', label: 'DECAY', min: 0, max: 100, default: 30 },
      { name: 'sustain', label: 'SUSTAIN', min: 0, max: 100, default: 30 },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Freeze: very short delay with near-unity feedback
    this.delay = this.ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.05;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.98;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.delay);
    this.delay.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
    this.delay.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'decay':
        this.feedbackGain.gain.setTargetAtTime(
          this.mapLinear(value, 0.9, 0.999),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'balance':
        this.directGain.gain.setTargetAtTime(1 - value / 100, this.ctx.currentTime, 0.01);
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.delay.disconnect();
    this.feedbackGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}
