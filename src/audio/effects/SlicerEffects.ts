/**
 * Slicer Effects — Pattern Slicer, Step Slicer
 * These effects chop the audio into rhythmic patterns
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * PATTERN SLICER — Rhythmic gate using pre-defined patterns
 * ═══════════════════════════════════════════════════════════════ */

export class PatternSlicerEffect extends BaseEffect {
  readonly type = 'PATTERN_SLICER';

  private gateGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private timerId: number | null = null;
  private stepIndex = 0;
  private pattern: number[] = [];
  private stepDurationMs = 125;

  // 20 built-in slicer patterns (16 steps each, binary)
  private readonly patterns: number[][] = [
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], // P01: even 8ths
    [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0], // P02: quarter notes
    [1,1,0,0,1,1,0,0,1,1,0,0,1,1,0,0], // P03: dotted 8ths
    [1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,0], // P04: triplet feel
    [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0], // P05: syncopated
    [1,0,1,1,0,1,0,1,1,0,1,0,1,1,0,0], // P06: funk
    [1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0], // P07: sparse
    [1,1,0,1,0,0,1,0,1,0,0,1,0,1,0,0], // P08: breakbeat
    [1,0,1,0,0,1,0,1,0,0,1,0,1,0,0,1], // P09: offbeat
    [1,1,1,1,0,0,0,0,1,1,1,1,0,0,0,0], // P10: half gate
    [1,0,0,0,1,1,0,0,0,0,1,1,0,0,0,1], // P11: reggaeton
    [1,1,0,0,0,1,1,0,0,0,1,1,0,0,0,0], // P12: shuffle
    [1,0,1,0,1,0,0,1,0,1,0,1,0,0,1,0], // P13: complex
    [1,0,0,1,0,1,0,0,1,0,0,1,0,1,0,0], // P14: rumba
    [1,1,1,1,1,0,0,0,1,1,1,1,1,0,0,0], // P15: burst
    [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], // P16: wide
    [1,1,0,1,1,0,1,1,0,1,1,0,1,1,0,0], // P17: samba
    [1,0,1,1,1,0,1,0,0,1,1,1,0,1,0,0], // P18: cascading
    [1,1,1,0,0,1,1,1,0,0,1,1,1,0,0,0], // P19: triples
    [1,0,0,0,1,0,1,0,0,1,0,0,0,1,0,1], // P20: random-ish
  ];

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'pattern', label: 'PATTERN', min: 1, max: 20, default: 1, step: 1 },
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'attack', label: 'ATTACK', min: 0, max: 100, default: 10 },
      { name: 'timing', label: 'TIMING', min: 0, max: 100, default: 50 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 0 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 100 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.gateGain = this.ctx.createGain();
    this.gateGain.gain.value = 1;

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 1;

    // Direct (dry) path
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Sliced (wet) path
    this.inputNode.connect(this.gateGain);
    this.gateGain.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);

    // Start with pattern 1
    this.pattern = this.patterns[0];
    this.startSequence();
  }

  private startSequence(): void {
    this.stopSequence();
    this.stepIndex = 0;
    this.tick();
  }

  private stopSequence(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private tick = (): void => {
    const step = this.pattern[this.stepIndex % this.pattern.length];
    const now = this.ctx.currentTime;
    const attackTime = (this.getParam('attack') ?? 10) / 1000; // 0-100ms

    if (step) {
      this.gateGain.gain.setTargetAtTime(1, now, Math.max(attackTime, 0.001));
    } else {
      this.gateGain.gain.setTargetAtTime(0, now, Math.max(attackTime, 0.001));
    }

    this.stepIndex = (this.stepIndex + 1) % this.pattern.length;
    this.timerId = window.setTimeout(this.tick, this.stepDurationMs);
  };

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'pattern': {
        const idx = Math.max(0, Math.min(19, Math.round(value) - 1));
        this.pattern = this.patterns[idx];
        break;
      }
      case 'rate':
        // Map 0-100 to 30ms-500ms per step
        this.stepDurationMs = this.mapLinear(100 - value, 30, 500);
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
    this.stopSequence();
    this.gateGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * STEP SLICER — User-programmable 16-step volume gate
 * ═══════════════════════════════════════════════════════════════ */

export class StepSlicerEffect extends BaseEffect {
  readonly type = 'STEP_SLICER';

  private gateGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private timerId: number | null = null;
  private stepIndex = 0;
  private stepDurationMs = 125;

  // 16 step levels (0-100 mapped to gain 0-1)
  private steps: number[] = new Array(16).fill(100);

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    const defs: EffectParamDef[] = [
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'attack', label: 'ATTACK', min: 0, max: 100, default: 10 },
      { name: 'max', label: 'MAX', min: 1, max: 16, default: 16, step: 1 },
    ];

    // 16 step values
    for (let i = 1; i <= 16; i++) {
      defs.push({
        name: `step${i}`,
        label: `STEP ${i}`,
        min: 0,
        max: 100,
        default: i % 2 === 0 ? 0 : 100,
      });
    }

    defs.push(
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 0 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 100 },
    );

    return defs;
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.gateGain = this.ctx.createGain();
    this.gateGain.gain.value = 1;

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 1;

    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.inputNode.connect(this.gateGain);
    this.gateGain.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);

    this.startSequence();
  }

  private startSequence(): void {
    this.stopSequence();
    this.stepIndex = 0;
    this.tick();
  }

  private stopSequence(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private tick = (): void => {
    const maxSteps = Math.round(this.getParam('max') ?? 16);
    const stepValue = this.steps[this.stepIndex % maxSteps] / 100;
    const attackTime = (this.getParam('attack') ?? 10) / 1000;

    this.gateGain.gain.setTargetAtTime(stepValue, this.ctx.currentTime, Math.max(attackTime, 0.001));

    this.stepIndex = (this.stepIndex + 1) % maxSteps;
    this.timerId = window.setTimeout(this.tick, this.stepDurationMs);
  };

  applyParam(name: string, value: number): void {
    if (name === 'rate') {
      this.stepDurationMs = this.mapLinear(100 - value, 30, 500);
    } else if (name === 'dLevel') {
      this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
    } else if (name === 'eLevel') {
      this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
    } else if (name.startsWith('step')) {
      const idx = parseInt(name.replace('step', '')) - 1;
      if (idx >= 0 && idx < 16) {
        this.steps[idx] = value;
      }
    }
  }

  dispose(): void {
    this.stopSequence();
    this.gateGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}
