/**
 * Beat Effects — Beat Scatter, Beat Repeat, Beat Shift, Vinyl Flick
 * These effects manipulate loop playback timing (Track-FX only)
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * BEAT SCATTER — Randomly rearranges beat slices
 * ═══════════════════════════════════════════════════════════════ */

export class BeatScatterEffect extends BaseEffect {
  readonly type = 'BEAT_SCATTER';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private timerId: number | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'type', label: 'TYPE', min: 1, max: 10, default: 1, step: 1 },
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'length', label: 'LENGTH', min: 0, max: 100, default: 50 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 50 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 100, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.125;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.3;

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 1;

    // Dry
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Wet: scattered delay
    this.inputNode.connect(this.delay);
    this.delay.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
    this.delay.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);

    // Random delay time changes for scatter effect
    this.startScatter();
  }

  private startScatter(): void {
    this.stopScatter();
    this.scatter();
  }

  private stopScatter(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private scatter = (): void => {
    const rate = this.getParam('rate') ?? 50;
    const intervalMs = this.mapLinear(100 - rate, 50, 500);

    // Random scatter: change delay time to jump around
    const scatterTimes = [0.0625, 0.125, 0.1875, 0.25, 0.375, 0.5];
    const randomTime = scatterTimes[Math.floor(Math.random() * scatterTimes.length)];
    this.delay.delayTime.setTargetAtTime(randomTime, this.ctx.currentTime, 0.005);

    this.timerId = window.setTimeout(this.scatter, intervalMs);
  };

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.stopScatter();
    this.delay.disconnect();
    this.feedbackGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * BEAT REPEAT — Captures and repeats a segment rhythmically
 * ═══════════════════════════════════════════════════════════════ */

export class BeatRepeatEffect extends BaseEffect {
  readonly type = 'BEAT_REPEAT';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'length', label: 'LENGTH', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'repeat', label: 'REPEAT', min: 1, max: 16, default: 4, step: 1 },
      { name: 'gate', label: 'GATE', min: 0, max: 100, default: 80 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 50 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 100, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.25;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.8; // High feedback for repeats

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 1;

    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.inputNode.connect(this.delay);
    this.delay.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);
    this.delay.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'length':
        this.delay.delayTime.setTargetAtTime(
          this.mapLinear(value, 0.03125, 1.0), this.ctx.currentTime, 0.01
        );
        break;
      case 'repeat': {
        // More repeats = higher feedback
        const fb = 1 - (1 / (Math.round(value) + 1));
        this.feedbackGain.gain.setTargetAtTime(Math.min(fb, 0.95), this.ctx.currentTime, 0.01);
        break;
      }
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
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

/* ═══════════════════════════════════════════════════════════════
 * BEAT SHIFT — Shifts playback position within the beat
 * ═══════════════════════════════════════════════════════════════ */

export class BeatShiftEffect extends BaseEffect {
  readonly type = 'BEAT_SHIFT';

  private delay!: DelayNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'shift', label: 'SHIFT', min: -100, max: 100, default: 0, sequenceable: true },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 0 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 100 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0;

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 1;

    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.inputNode.connect(this.delay);
    this.delay.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'shift':
        // Map -100..100 to 0..0.5 seconds delay (positive = shift back)
        this.delay.delayTime.setTargetAtTime(
          Math.max(0, value / 200), this.ctx.currentTime, 0.001
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
    this.delay.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * VINYL FLICK — Simulates vinyl scratch/stop/start
 * ═══════════════════════════════════════════════════════════════ */

export class VinylFlickEffect extends BaseEffect {
  readonly type = 'VINYL_FLICK';

  private delay!: DelayNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private filter!: BiquadFilterNode;
  private crackleGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'flickSpeed', label: 'SPEED', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'scratch', label: 'SCRATCH', min: 0, max: 100, default: 30 },
      { name: 'noise', label: 'NOISE', min: 0, max: 100, default: 20 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 50 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 100, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Vinyl "speed" effect via modulated delay (wobble)
    this.delay = this.ctx.createDelay(0.1);
    this.delay.delayTime.value = 0.01;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 1;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.003;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();

    // Vinyl character: LP filter
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 6000;
    this.filter.Q.value = 0.5;

    // Crackle noise (simplified — just low-level noise)
    this.crackleGain = this.ctx.createGain();
    this.crackleGain.gain.value = 0;

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 1;

    // Dry path
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Vinyl path
    this.inputNode.connect(this.delay);
    this.delay.connect(this.filter);
    this.filter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'flickSpeed':
        // Higher speed = faster wobble + deeper modulation
        this.lfo.frequency.setTargetAtTime(
          this.mapLinear(value, 0.5, 10), this.ctx.currentTime, 0.01
        );
        this.lfoGain.gain.setTargetAtTime(
          this.mapLinear(value, 0.001, 0.01), this.ctx.currentTime, 0.01
        );
        break;
      case 'scratch':
        // More scratch = lower LP filter + higher mod depth
        this.filter.frequency.setTargetAtTime(
          this.mapLinear(100 - value, 800, 8000), this.ctx.currentTime, 0.02
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
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.delay.disconnect();
    this.filter.disconnect();
    this.crackleGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}
