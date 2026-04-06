/**
 * Filter Effects — LPF, HPF, BPF
 *
 * Each filter has: Rate (LFO speed), Depth, Resonance, Cutoff, Step Rate.
 * Uses BiquadFilterNode with an optional LFO for modulation.
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * LPF — Low Pass Filter
 * ═══════════════════════════════════════════════════════════════ */

export class LPFEffect extends BaseEffect {
  readonly type = 'LPF';

  private filter!: BiquadFilterNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50, sequenceable: false },
      { name: 'depth', label: 'DEPTH', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'resonance', label: 'RESONANCE', min: 0, max: 100, default: 50 },
      { name: 'cutoff', label: 'CUTOFF', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'stepRate', label: 'STEP RATE', min: 0, max: 100, default: 0 },
    ];
  }

  buildGraph(): void {
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2000;
    this.filter.Q.value = 1;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 1;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start();

    // Rewire: input → filter → output (bypass dry/wet for filter effects)
    this.inputNode.disconnect();
    this.inputNode.connect(this.filter);
    this.filter.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'cutoff':
        this.filter.frequency.setTargetAtTime(
          this.mapFrequency(value, 80, 18000),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'resonance':
        this.filter.Q.setTargetAtTime(
          this.mapLinear(value, 0.5, 20),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'rate':
        this.lfo.frequency.setTargetAtTime(
          this.mapRate(value),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'depth': {
        const cutoff = this.getParam('cutoff') ?? 50;
        const baseFreq = this.mapFrequency(cutoff, 80, 18000);
        this.lfoGain.gain.setTargetAtTime(
          baseFreq * (value / 100) * 0.8,
          this.ctx.currentTime,
          0.01
        );
        break;
      }
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.filter.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * HPF — High Pass Filter
 * ═══════════════════════════════════════════════════════════════ */

export class HPFEffect extends BaseEffect {
  readonly type = 'HPF';

  private filter!: BiquadFilterNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50 },
      { name: 'depth', label: 'DEPTH', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'resonance', label: 'RESONANCE', min: 0, max: 100, default: 50 },
      { name: 'cutoff', label: 'CUTOFF', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'stepRate', label: 'STEP RATE', min: 0, max: 100, default: 0 },
    ];
  }

  buildGraph(): void {
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'highpass';
    this.filter.frequency.value = 2000;
    this.filter.Q.value = 1;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 1;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start();

    this.inputNode.disconnect();
    this.inputNode.connect(this.filter);
    this.filter.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'cutoff':
        this.filter.frequency.setTargetAtTime(
          this.mapFrequency(value, 80, 18000),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'resonance':
        this.filter.Q.setTargetAtTime(
          this.mapLinear(value, 0.5, 20),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'rate':
        this.lfo.frequency.setTargetAtTime(
          this.mapRate(value),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'depth': {
        const cutoff = this.getParam('cutoff') ?? 50;
        const baseFreq = this.mapFrequency(cutoff, 80, 18000);
        this.lfoGain.gain.setTargetAtTime(
          baseFreq * (value / 100) * 0.8,
          this.ctx.currentTime,
          0.01
        );
        break;
      }
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.filter.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * BPF — Band Pass Filter
 * ═══════════════════════════════════════════════════════════════ */

export class BPFEffect extends BaseEffect {
  readonly type = 'BPF';

  private filter!: BiquadFilterNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50 },
      { name: 'depth', label: 'DEPTH', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'resonance', label: 'RESONANCE', min: 0, max: 100, default: 50 },
      { name: 'cutoff', label: 'CUTOFF', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'stepRate', label: 'STEP RATE', min: 0, max: 100, default: 0 },
    ];
  }

  buildGraph(): void {
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 2000;
    this.filter.Q.value = 2;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 1;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start();

    this.inputNode.disconnect();
    this.inputNode.connect(this.filter);
    this.filter.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'cutoff':
        this.filter.frequency.setTargetAtTime(
          this.mapFrequency(value, 80, 18000),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'resonance':
        this.filter.Q.setTargetAtTime(
          this.mapLinear(value, 0.5, 20),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'rate':
        this.lfo.frequency.setTargetAtTime(
          this.mapRate(value),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'depth': {
        const cutoff = this.getParam('cutoff') ?? 50;
        const baseFreq = this.mapFrequency(cutoff, 80, 18000);
        this.lfoGain.gain.setTargetAtTime(
          baseFreq * (value / 100) * 0.8,
          this.ctx.currentTime,
          0.01
        );
        break;
      }
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.filter.disconnect();
    super.dispose();
  }
}
