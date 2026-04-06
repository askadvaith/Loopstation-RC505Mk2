/**
 * Modulation Effects — Phaser, Flanger, Tremolo, Vibrato, Auto Pan, Ring Mod, Chorus
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * PHASER
 * ═══════════════════════════════════════════════════════════════ */

export class PhaserEffect extends BaseEffect {
  readonly type = 'PHASER';

  private allpassFilters: BiquadFilterNode[] = [];
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private feedbackGain!: GainNode;
  private effectGain!: GainNode;
  private directGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50 },
      { name: 'depth', label: 'DEPTH', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'resonance', label: 'RESONANCE', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'manual', label: 'MANUAL', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 100, sequenceable: true },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'stage', label: 'STAGE', min: 0, max: 3, default: 1, choices: ['4', '8', '12', 'BI-PHASE'] },
      { name: 'stepRate', label: 'STEP RATE', min: 0, max: 100, default: 0 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Direct path
    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1.0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Effect path: allpass chain
    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    // Build 8-stage phaser by default
    this.rebuildStages(8);

    this.effectGain.connect(this.outputNode);

    // Feedback
    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.3;
    this.effectGain.connect(this.feedbackGain);
    // Feedback into first allpass
    if (this.allpassFilters.length > 0) {
      this.feedbackGain.connect(this.allpassFilters[0]);
    }

    // LFO → modulate allpass frequencies
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 1;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 1000;
    this.lfo.connect(this.lfoGain);

    for (const ap of this.allpassFilters) {
      this.lfoGain.connect(ap.frequency);
    }
    this.lfo.start();
  }

  private rebuildStages(count: number): void {
    // Disconnect old
    for (const ap of this.allpassFilters) {
      ap.disconnect();
    }
    this.allpassFilters = [];

    for (let i = 0; i < count; i++) {
      const ap = this.ctx.createBiquadFilter();
      ap.type = 'allpass';
      ap.frequency.value = 1000;
      ap.Q.value = 0.5;
      this.allpassFilters.push(ap);
    }

    // Chain: input → ap0 → ap1 → … → effectGain
    let prev: AudioNode = this.inputNode;
    for (const ap of this.allpassFilters) {
      prev.connect(ap);
      prev = ap;
    }
    prev.connect(this.effectGain);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'rate':
        this.lfo.frequency.setTargetAtTime(this.mapRate(value), this.ctx.currentTime, 0.01);
        break;
      case 'depth':
        this.lfoGain.gain.setTargetAtTime(
          this.mapLinear(value, 100, 5000),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'resonance':
        this.feedbackGain.gain.setTargetAtTime(
          this.mapLinear(value, 0, 0.85),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'manual': {
        const freq = this.mapFrequency(value, 200, 8000);
        for (const ap of this.allpassFilters) {
          ap.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.01);
        }
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
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    for (const ap of this.allpassFilters) ap.disconnect();
    this.feedbackGain.disconnect();
    this.effectGain.disconnect();
    this.directGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * FLANGER
 * ═══════════════════════════════════════════════════════════════ */

export class FlangerEffect extends BaseEffect {
  readonly type = 'FLANGER';

  private delay!: DelayNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private feedbackGain!: GainNode;
  private effectGain!: GainNode;
  private directGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50 },
      { name: 'depth', label: 'DEPTH', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'resonance', label: 'RESONANCE', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'manual', label: 'MANUAL', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 100, sequenceable: true },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'separation', label: 'SEPARATION', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'stepRate', label: 'STEP RATE', min: 0, max: 100, default: 0 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Direct path
    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1.0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Effect path: delay with LFO modulation
    this.delay = this.ctx.createDelay(0.02);
    this.delay.delayTime.value = 0.005;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.3;

    this.inputNode.connect(this.delay);
    this.delay.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
    this.delay.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);

    // LFO modulates delay time
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.5;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.003;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'rate':
        this.lfo.frequency.setTargetAtTime(this.mapRate(value), this.ctx.currentTime, 0.01);
        break;
      case 'depth':
        this.lfoGain.gain.setTargetAtTime(
          this.mapLinear(value, 0.0001, 0.007),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'resonance':
        this.feedbackGain.gain.setTargetAtTime(
          this.mapLinear(value, 0, 0.9),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'manual':
        this.delay.delayTime.setTargetAtTime(
          this.mapLinear(value, 0.001, 0.015),
          this.ctx.currentTime,
          0.01
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
    this.feedbackGain.disconnect();
    this.effectGain.disconnect();
    this.directGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * TREMOLO — cyclic volume change
 * ═══════════════════════════════════════════════════════════════ */

export class TremoloEffect extends BaseEffect {
  readonly type = 'TREMOLO';

  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private tremoloGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 85, sequenceable: true },
      { name: 'depth', label: 'DEPTH', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'waveform', label: 'WAVEFORM', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.tremoloGain = this.ctx.createGain();
    this.tremoloGain.gain.value = 1.0;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 5;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.5;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.tremoloGain.gain);
    this.lfo.start();

    this.inputNode.connect(this.tremoloGain);
    this.tremoloGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'rate':
        this.lfo.frequency.setTargetAtTime(this.mapRate(value), this.ctx.currentTime, 0.01);
        break;
      case 'depth':
        this.lfoGain.gain.setTargetAtTime(value / 200, this.ctx.currentTime, 0.01);
        break;
      case 'waveform':
        // Morph between sine (0) and square (100)
        this.lfo.type = value > 66 ? 'square' : value > 33 ? 'triangle' : 'sine';
        break;
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.tremoloGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * VIBRATO — pitch modulation
 * ═══════════════════════════════════════════════════════════════ */

export class VibratoEffect extends BaseEffect {
  readonly type = 'VIBRATO';

  private delay!: DelayNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50 },
      { name: 'depth', label: 'DEPTH', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'color', label: 'COLOR', min: 0, max: 100, default: 50 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Direct path
    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Effect path: modulated delay line for pitch vibrato
    this.delay = this.ctx.createDelay(0.05);
    this.delay.delayTime.value = 0.01;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.delay);
    this.delay.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);

    // LFO → delay time
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 5;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.003;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'rate':
        this.lfo.frequency.setTargetAtTime(
          this.mapLinear(value, 0.5, 14),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'depth':
        this.lfoGain.gain.setTargetAtTime(
          this.mapLinear(value, 0.0001, 0.008),
          this.ctx.currentTime,
          0.01
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
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * AUTO PAN — cyclic stereo panning
 * ═══════════════════════════════════════════════════════════════ */

export class AutoPanEffect extends BaseEffect {
  readonly type = 'AUTO_PAN';

  private panner!: StereoPannerNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50 },
      { name: 'waveform', label: 'WAVEFORM', min: 0, max: 100, default: 50 },
      { name: 'depth', label: 'DEPTH', min: 0, max: 100, default: 50 },
      { name: 'initPhase', label: 'INIT PHASE', min: 0, max: 180, default: 0 },
      { name: 'stepRate', label: 'STEP RATE', min: 0, max: 100, default: 0 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.panner = this.ctx.createStereoPanner();
    this.panner.pan.value = 0;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 1;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.5;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.panner.pan);
    this.lfo.start();

    this.inputNode.connect(this.panner);
    this.panner.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'rate':
        this.lfo.frequency.setTargetAtTime(this.mapRate(value), this.ctx.currentTime, 0.01);
        break;
      case 'depth':
        this.lfoGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'waveform':
        this.lfo.type = value > 66 ? 'square' : value > 33 ? 'triangle' : 'sine';
        break;
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.panner.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * RING MOD — Ring Modulator
 * ═══════════════════════════════════════════════════════════════ */

export class RingModEffect extends BaseEffect {
  readonly type = 'RING_MOD';

  private modOsc!: OscillatorNode;
  private modGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'frequency', label: 'FREQUENCY', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50 },
      { name: 'mode', label: 'MODE', min: 0, max: 1, default: 0, choices: ['1', '2'] },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Direct path
    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Ring mod: input × oscillator (use GainNode for amplitude modulation)
    this.modGain = this.ctx.createGain();
    this.modGain.gain.value = 0; // Will be overridden by modOsc

    this.modOsc = this.ctx.createOscillator();
    this.modOsc.type = 'sine';
    this.modOsc.frequency.value = 440;
    this.modOsc.connect(this.modGain.gain);
    this.modOsc.start();

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.modGain);
    this.modGain.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'frequency':
        this.modOsc.frequency.setTargetAtTime(
          this.mapFrequency(value, 50, 5000),
          this.ctx.currentTime,
          0.01
        );
        break;
      case 'balance':
        this.directGain.gain.setTargetAtTime(1 - value / 100, this.ctx.currentTime, 0.01);
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.modOsc.stop();
    this.modOsc.disconnect();
    this.modGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * CHORUS — detuned copy for depth/breadth
 * ═══════════════════════════════════════════════════════════════ */

export class ChorusEffect extends BaseEffect {
  readonly type = 'CHORUS';

  private delay!: DelayNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private lcFilter!: BiquadFilterNode;
  private hcFilter!: BiquadFilterNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'rate', label: 'RATE', min: 0, max: 100, default: 50 },
      { name: 'depth', label: 'DEPTH', min: 0, max: 100, default: 50 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 100 },
      { name: 'lowCut', label: 'LOW CUT', min: 0, max: 100, default: 0, unit: 'Hz' },
      { name: 'highCut', label: 'HIGH CUT', min: 0, max: 100, default: 100, unit: 'Hz' },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Direct
    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1.0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Chorus: modulated delay
    this.delay = this.ctx.createDelay(0.05);
    this.delay.delayTime.value = 0.015;

    this.lcFilter = this.ctx.createBiquadFilter();
    this.lcFilter.type = 'highpass';
    this.lcFilter.frequency.value = 20;

    this.hcFilter = this.ctx.createBiquadFilter();
    this.hcFilter.type = 'lowpass';
    this.hcFilter.frequency.value = 20000;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.delay);
    this.delay.connect(this.lcFilter);
    this.lcFilter.connect(this.hcFilter);
    this.hcFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);

    // LFO
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 1;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.005;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'rate':
        this.lfo.frequency.setTargetAtTime(this.mapLinear(value, 0.1, 8), this.ctx.currentTime, 0.01);
        break;
      case 'depth':
        this.lfoGain.gain.setTargetAtTime(this.mapLinear(value, 0.0005, 0.01), this.ctx.currentTime, 0.01);
        break;
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'lowCut':
        if (value === 0) {
          this.lcFilter.frequency.value = 20;
        } else {
          this.lcFilter.frequency.setTargetAtTime(this.mapFrequency(value), this.ctx.currentTime, 0.01);
        }
        break;
      case 'highCut':
        if (value === 100) {
          this.hcFilter.frequency.value = 20000;
        } else {
          this.hcFilter.frequency.setTargetAtTime(this.mapFrequency(value), this.ctx.currentTime, 0.01);
        }
        break;
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.delay.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    this.lcFilter.disconnect();
    this.hcFilter.disconnect();
    super.dispose();
  }
}
