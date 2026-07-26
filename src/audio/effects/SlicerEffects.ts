/**
 * Slicer Effects — Pattern Slicer, Step Slicer
 * These effects chop the audio into rhythmic patterns
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';
import { NOTE_VALUE_LABELS, noteValueMs } from './TempoClock';

/** Default RATE index → 1/8 note (quaver), the common slicer rate. */
const DEFAULT_RATE_IDX = Math.max(0, NOTE_VALUE_LABELS.indexOf('1/8'));

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
      // RATE is a note value locked to the song tempo (quaver = 1/8 default).
      { name: 'rate', label: 'RATE', min: 0, max: NOTE_VALUE_LABELS.length - 1, default: DEFAULT_RATE_IDX, step: 1, choices: NOTE_VALUE_LABELS },
      // DEPTH controls how deep the gate cuts on "off" steps (100 = full cut).
      { name: 'depth', label: 'DEPTH', min: 0, max: 120, default: 100, sequenceable: true },
      { name: 'attack', label: 'ATTACK', min: 0, max: 100, default: 10 },
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
    const attackTime = Math.max((this.getParam('attack') ?? 10) / 1000, 0.001); // 0-100ms

    // DEPTH: how far the gate closes on "off" steps (0 = no cut, 100 = silent).
    const depth = this.getParam('depth') ?? 100;
    const offLevel = Math.max(0, Math.min(1, 1 - depth / 100));
    this.gateGain.gain.setTargetAtTime(step ? 1 : offLevel, now, attackTime);

    this.stepIndex = (this.stepIndex + 1) % this.pattern.length;

    // Step duration is derived live from the tempo clock so it tracks BPM changes.
    const label = NOTE_VALUE_LABELS[Math.round(this.getParam('rate') ?? DEFAULT_RATE_IDX)] ?? '1/8';
    const durMs = Math.max(10, noteValueMs(label));
    this.timerId = window.setTimeout(this.tick, durMs);
  };

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'pattern': {
        const idx = Math.max(0, Math.min(19, Math.round(value) - 1));
        this.pattern = this.patterns[idx];
        break;
      }
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      // 'rate' and 'depth' are read live inside tick().
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

  // 16 step levels (0-100 mapped to gain 0-1)
  private steps: number[] = new Array(16).fill(100);

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    const defs: EffectParamDef[] = [
      { name: 'rate', label: 'RATE', min: 0, max: NOTE_VALUE_LABELS.length - 1, default: DEFAULT_RATE_IDX, step: 1, choices: NOTE_VALUE_LABELS },
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

    // Step duration derived live from tempo clock (tracks BPM changes).
    const label = NOTE_VALUE_LABELS[Math.round(this.getParam('rate') ?? DEFAULT_RATE_IDX)] ?? '1/8';
    this.timerId = window.setTimeout(this.tick, Math.max(10, noteValueMs(label)));
  };

  applyParam(name: string, value: number): void {
    if (name === 'rate') {
      // Read live inside tick(); nothing to apply immediately.
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
