/**
 * Reverb Effects — Reverb, Reverse Reverb, Gate Reverb
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * REVERB — Standard room/hall reverb via ConvolverNode
 * ═══════════════════════════════════════════════════════════════ */

export class ReverbEffect extends BaseEffect {
  readonly type = 'REVERB';

  private convolver!: ConvolverNode;
  private directGain!: GainNode;
  private preDelay!: DelayNode;
  private lowCut!: BiquadFilterNode;
  private highCut!: BiquadFilterNode;
  private reverbTime = 2.0;
  private density = 50;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'time', label: 'TIME', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'preDelay', label: 'PRE DELAY', min: 0, max: 100, default: 10 },
      { name: 'density', label: 'DENSITY', min: 0, max: 100, default: 50 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 50 },
      { name: 'lowCut', label: 'LOW CUT', min: 0, max: 100, default: 0 },
      { name: 'highCut', label: 'HIGH CUT', min: 0, max: 100, default: 100 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.generateIR(2.0, 50);

    this.preDelay = this.ctx.createDelay(0.5);
    this.preDelay.delayTime.value = 0.01;

    this.lowCut = this.ctx.createBiquadFilter();
    this.lowCut.type = 'highpass';
    this.lowCut.frequency.value = 20;

    this.highCut = this.ctx.createBiquadFilter();
    this.highCut.type = 'lowpass';
    this.highCut.frequency.value = 20000;

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;

    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0.5;

    // Dry path
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Wet path
    this.inputNode.connect(this.preDelay);
    this.preDelay.connect(this.convolver);
    this.convolver.connect(this.lowCut);
    this.lowCut.connect(this.highCut);
    this.highCut.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);
  }

  /** Generate a synthetic impulse response */
  private generateIR(time: number, density: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.max(rate * time, rate * 0.1);
    const buffer = this.ctx.createBuffer(2, length, rate);

    const densityFactor = (density / 100) * 0.8 + 0.1; // 0.1 to 0.9

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // Exponential decay with randomized reflections
        const envelope = Math.exp(-3.0 * i / length);
        const noise = (Math.random() * 2 - 1);
        // Sparse vs dense reflections
        const gate = Math.random() < densityFactor ? 1 : 0;
        data[i] = noise * envelope * gate;
      }
    }

    return buffer;
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'time':
        this.reverbTime = this.mapLinear(value, 0.2, 8.0);
        this.convolver.buffer = this.generateIR(this.reverbTime, this.density);
        break;
      case 'preDelay':
        this.preDelay.delayTime.setTargetAtTime(
          this.mapLinear(value, 0, 0.2), this.ctx.currentTime, 0.01
        );
        break;
      case 'density':
        this.density = value;
        this.convolver.buffer = this.generateIR(this.reverbTime, value);
        break;
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'lowCut':
        this.lowCut.frequency.setTargetAtTime(
          this.mapFrequency(value), this.ctx.currentTime, 0.02
        );
        break;
      case 'highCut':
        this.highCut.frequency.setTargetAtTime(
          this.mapFrequency(value), this.ctx.currentTime, 0.02
        );
        break;
      case 'eLevel':
        this.wetGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.convolver.disconnect();
    this.preDelay.disconnect();
    this.lowCut.disconnect();
    this.highCut.disconnect();
    this.directGain.disconnect();
    this.wetGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * REVERSE REVERB — Reverb with reversed tail character
 * ═══════════════════════════════════════════════════════════════ */

export class ReverseReverbEffect extends BaseEffect {
  readonly type = 'REVERSE_REVERB';

  private convolver!: ConvolverNode;
  private directGain!: GainNode;
  private reverbTime = 2.0;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'time', label: 'TIME', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 50 },
      { name: 'lowCut', label: 'LOW CUT', min: 0, max: 100, default: 0 },
      { name: 'highCut', label: 'HIGH CUT', min: 0, max: 100, default: 100 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.generateReverseIR(2.0);

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0.5;

    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.inputNode.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);
  }

  /** Generate reverse envelope IR — builds up instead of decaying */
  private generateReverseIR(time: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.max(rate * time, rate * 0.1);
    const buffer = this.ctx.createBuffer(2, length, rate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // Reverse envelope: builds up over time then cuts
        const t = i / length;
        const envelope = Math.pow(t, 2) * Math.exp(-0.5 * t);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }

    return buffer;
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'time':
        this.reverbTime = this.mapLinear(value, 0.2, 6.0);
        this.convolver.buffer = this.generateReverseIR(this.reverbTime);
        break;
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.wetGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.convolver.disconnect();
    this.directGain.disconnect();
    this.wetGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * GATE REVERB — Reverb with hard gate cutoff
 * ═══════════════════════════════════════════════════════════════ */

export class GateReverbEffect extends BaseEffect {
  readonly type = 'GATE_REVERB';

  private convolver!: ConvolverNode;
  private directGain!: GainNode;
  private gateTime = 0.3;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'gateTime', label: 'GATE TIME', min: 0, max: 100, default: 30, sequenceable: true },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 50 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this.generateGateIR(0.3);

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0.5;

    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.inputNode.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.outputNode);
  }

  /** Generate gated IR — full level then abrupt silence */
  private generateGateIR(gateTime: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = rate * 2; // Total IR length
    const gateSamples = Math.floor(rate * gateTime);
    const buffer = this.ctx.createBuffer(2, length, rate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        if (i < gateSamples) {
          // Dense reflections during gate time
          data[i] = (Math.random() * 2 - 1) * 0.8;
        } else {
          // Hard gate
          data[i] = 0;
        }
      }
    }

    return buffer;
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'gateTime':
        this.gateTime = this.mapLinear(value, 0.05, 1.0);
        this.convolver.buffer = this.generateGateIR(this.gateTime);
        break;
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.wetGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.convolver.disconnect();
    this.directGain.disconnect();
    this.wetGain.disconnect();
    super.dispose();
  }
}
