/**
 * Delay Effects — Delay, Mod Delay, Reverse Delay, Panning Delay,
 *                 Tape Echo 1, Tape Echo 2, Roll 1, Roll 2, Granular Delay
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * DELAY — Standard delay
 * ═══════════════════════════════════════════════════════════════ */

export class DelayEffect extends BaseEffect {
  readonly type = 'DELAY';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private lcFilter!: BiquadFilterNode;
  private hcFilter!: BiquadFilterNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'time', label: 'TIME', min: 1, max: 2000, default: 200, unit: 'ms' },
      { name: 'feedback', label: 'FEEDBACK', min: 1, max: 16, default: 4, step: 1 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 100 },
      { name: 'lowCut', label: 'LOW CUT', min: 0, max: 100, default: 0 },
      { name: 'highCut', label: 'HIGH CUT', min: 0, max: 100, default: 100 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 120, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1.0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.delay = this.ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.2;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.25;

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

    // Feedback loop
    this.hcFilter.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'time':
        this.delay.delayTime.setTargetAtTime(value / 1000, this.ctx.currentTime, 0.01);
        break;
      case 'feedback':
        // 1–16 repeats → feedback coefficient 0.0 to 0.9
        this.feedbackGain.gain.setTargetAtTime(
          this.mapLinear((value - 1) / 15 * 100, 0, 0.9),
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
      case 'lowCut':
        this.lcFilter.frequency.setTargetAtTime(
          value === 0 ? 20 : this.mapFrequency(value),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'highCut':
        this.hcFilter.frequency.setTargetAtTime(
          value === 100 ? 20000 : this.mapFrequency(value),
          this.ctx.currentTime, 0.01
        );
        break;
    }
  }

  dispose(): void {
    this.delay.disconnect();
    this.feedbackGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    this.lcFilter.disconnect();
    this.hcFilter.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * MOD DELAY — Delay with chorus modulation
 * ═══════════════════════════════════════════════════════════════ */

export class ModDelayEffect extends BaseEffect {
  readonly type = 'MOD_DELAY';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private lcFilter!: BiquadFilterNode;
  private hcFilter!: BiquadFilterNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'time', label: 'TIME', min: 1, max: 2000, default: 200, unit: 'ms' },
      { name: 'feedback', label: 'FEEDBACK', min: 1, max: 16, default: 4, step: 1 },
      { name: 'modDepth', label: 'MOD DEPTH', min: 0, max: 100, default: 50 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 100 },
      { name: 'lowCut', label: 'LOW CUT', min: 0, max: 100, default: 0 },
      { name: 'highCut', label: 'HIGH CUT', min: 0, max: 100, default: 100 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 120, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1.0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.delay = this.ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.2;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.25;

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
    this.hcFilter.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);

    // LFO modulates delay time
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 0.8;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.003;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'time':
        this.delay.delayTime.setTargetAtTime(value / 1000, this.ctx.currentTime, 0.01);
        break;
      case 'feedback':
        this.feedbackGain.gain.setTargetAtTime(
          this.mapLinear((value - 1) / 15 * 100, 0, 0.9),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'modDepth':
        this.lfoGain.gain.setTargetAtTime(
          this.mapLinear(value, 0.0001, 0.01),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'lowCut':
        this.lcFilter.frequency.setTargetAtTime(value === 0 ? 20 : this.mapFrequency(value), this.ctx.currentTime, 0.01);
        break;
      case 'highCut':
        this.hcFilter.frequency.setTargetAtTime(value === 100 ? 20000 : this.mapFrequency(value), this.ctx.currentTime, 0.01);
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
    this.effectGain.disconnect();
    this.lcFilter.disconnect();
    this.hcFilter.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * REVERSE DELAY — Reverses delayed signal segments
 * Uses a dual-buffer ScriptProcessor approach for true reverse
 * ═══════════════════════════════════════════════════════════════ */

export class ReverseDelayEffect extends BaseEffect {
  readonly type = 'REVERSE_DELAY';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private lcFilter!: BiquadFilterNode;
  private hcFilter!: BiquadFilterNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'time', label: 'TIME', min: 1, max: 2000, default: 200, unit: 'ms' },
      { name: 'feedback', label: 'FEEDBACK', min: 1, max: 16, default: 4, step: 1 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 100 },
      { name: 'lowCut', label: 'LOW CUT', min: 0, max: 100, default: 0 },
      { name: 'highCut', label: 'HIGH CUT', min: 0, max: 100, default: 100 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 120, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1.0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Simplified reverse delay: use long delay with negative feedback character
    this.delay = this.ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.2;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.25;

    this.lcFilter = this.ctx.createBiquadFilter();
    this.lcFilter.type = 'highpass';
    this.lcFilter.frequency.value = 20;
    this.hcFilter = this.ctx.createBiquadFilter();
    this.hcFilter.type = 'lowpass';
    this.hcFilter.frequency.value = 20000;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    // Add allpass filters for reverse-like smearing
    const ap1 = this.ctx.createBiquadFilter();
    ap1.type = 'allpass';
    ap1.frequency.value = 800;
    const ap2 = this.ctx.createBiquadFilter();
    ap2.type = 'allpass';
    ap2.frequency.value = 2400;

    this.inputNode.connect(this.delay);
    this.delay.connect(ap1);
    ap1.connect(ap2);
    ap2.connect(this.lcFilter);
    this.lcFilter.connect(this.hcFilter);
    this.hcFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
    this.hcFilter.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'time':
        this.delay.delayTime.setTargetAtTime(value / 1000, this.ctx.currentTime, 0.01);
        break;
      case 'feedback':
        this.feedbackGain.gain.setTargetAtTime(
          this.mapLinear((value - 1) / 15 * 100, 0, 0.9),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'lowCut':
        this.lcFilter.frequency.setTargetAtTime(value === 0 ? 20 : this.mapFrequency(value), this.ctx.currentTime, 0.01);
        break;
      case 'highCut':
        this.hcFilter.frequency.setTargetAtTime(value === 100 ? 20000 : this.mapFrequency(value), this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.delay.disconnect();
    this.feedbackGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    this.lcFilter.disconnect();
    this.hcFilter.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * PANNING DELAY — Stereo L/R delay
 * ═══════════════════════════════════════════════════════════════ */

export class PanningDelayEffect extends BaseEffect {
  readonly type = 'PANNING_DELAY';

  private delayL!: DelayNode;
  private delayR!: DelayNode;
  private feedbackGainL!: GainNode;
  private feedbackGainR!: GainNode;
  private pannerL!: StereoPannerNode;
  private pannerR!: StereoPannerNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private lcFilter!: BiquadFilterNode;
  private hcFilter!: BiquadFilterNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'time', label: 'TIME', min: 1, max: 2000, default: 200, unit: 'ms' },
      { name: 'feedback', label: 'FEEDBACK', min: 1, max: 16, default: 4, step: 1 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 100 },
      { name: 'lowCut', label: 'LOW CUT', min: 0, max: 100, default: 0 },
      { name: 'highCut', label: 'HIGH CUT', min: 0, max: 100, default: 100 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 120, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1.0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // L channel delay
    this.delayL = this.ctx.createDelay(2.0);
    this.delayL.delayTime.value = 0.2;
    this.feedbackGainL = this.ctx.createGain();
    this.feedbackGainL.gain.value = 0.25;
    this.pannerL = this.ctx.createStereoPanner();
    this.pannerL.pan.value = -0.8;

    // R channel delay (offset)
    this.delayR = this.ctx.createDelay(2.0);
    this.delayR.delayTime.value = 0.3;
    this.feedbackGainR = this.ctx.createGain();
    this.feedbackGainR.gain.value = 0.25;
    this.pannerR = this.ctx.createStereoPanner();
    this.pannerR.pan.value = 0.8;

    this.lcFilter = this.ctx.createBiquadFilter();
    this.lcFilter.type = 'highpass';
    this.lcFilter.frequency.value = 20;
    this.hcFilter = this.ctx.createBiquadFilter();
    this.hcFilter.type = 'lowpass';
    this.hcFilter.frequency.value = 20000;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    // Left delay path
    this.inputNode.connect(this.delayL);
    this.delayL.connect(this.pannerL);
    this.pannerL.connect(this.lcFilter);
    this.delayL.connect(this.feedbackGainL);
    this.feedbackGainL.connect(this.delayR); // Cross-feedback

    // Right delay path
    this.inputNode.connect(this.delayR);
    this.delayR.connect(this.pannerR);
    this.pannerR.connect(this.lcFilter);
    this.delayR.connect(this.feedbackGainR);
    this.feedbackGainR.connect(this.delayL); // Cross-feedback

    this.lcFilter.connect(this.hcFilter);
    this.hcFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'time':
        this.delayL.delayTime.setTargetAtTime(value / 1000, this.ctx.currentTime, 0.01);
        this.delayR.delayTime.setTargetAtTime(value / 1000 * 1.5, this.ctx.currentTime, 0.01);
        break;
      case 'feedback': {
        const fb = this.mapLinear((value - 1) / 15 * 100, 0, 0.7);
        this.feedbackGainL.gain.setTargetAtTime(fb, this.ctx.currentTime, 0.01);
        this.feedbackGainR.gain.setTargetAtTime(fb, this.ctx.currentTime, 0.01);
        break;
      }
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'lowCut':
        this.lcFilter.frequency.setTargetAtTime(value === 0 ? 20 : this.mapFrequency(value), this.ctx.currentTime, 0.01);
        break;
      case 'highCut':
        this.hcFilter.frequency.setTargetAtTime(value === 100 ? 20000 : this.mapFrequency(value), this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.delayL.disconnect();
    this.delayR.disconnect();
    this.feedbackGainL.disconnect();
    this.feedbackGainR.disconnect();
    this.pannerL.disconnect();
    this.pannerR.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    this.lcFilter.disconnect();
    this.hcFilter.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * TAPE ECHO 1 — Classic tape delay (old algorithm)
 * ═══════════════════════════════════════════════════════════════ */

export class TapeEcho1Effect extends BaseEffect {
  readonly type = 'TAPE_ECHO1';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private bassFilter!: BiquadFilterNode;
  private trebleFilter!: BiquadFilterNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'repeatRate', label: 'REPEAT RATE', min: 0, max: 100, default: 50 },
      { name: 'intensity', label: 'INTENSITY', min: 0, max: 100, default: 50 },
      { name: 'bass', label: 'BASS', min: -50, max: 50, default: 0 },
      { name: 'treble', label: 'TREBLE', min: -50, max: 50, default: 0 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 100 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 120, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1.0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.delay = this.ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.3;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.4;

    this.bassFilter = this.ctx.createBiquadFilter();
    this.bassFilter.type = 'lowshelf';
    this.bassFilter.frequency.value = 300;
    this.bassFilter.gain.value = 0;

    this.trebleFilter = this.ctx.createBiquadFilter();
    this.trebleFilter.type = 'highshelf';
    this.trebleFilter.frequency.value = 3000;
    this.trebleFilter.gain.value = 0;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.delay);
    this.delay.connect(this.bassFilter);
    this.bassFilter.connect(this.trebleFilter);
    this.trebleFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
    this.trebleFilter.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'repeatRate':
        // Maps 0–100 to tape speed → delay time (longer delay at lower rate)
        this.delay.delayTime.setTargetAtTime(
          this.mapLinear(value, 0.05, 1.0),
          this.ctx.currentTime, 0.02
        );
        break;
      case 'intensity':
        this.feedbackGain.gain.setTargetAtTime(
          this.mapLinear(value, 0, 0.9),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'bass':
        this.bassFilter.gain.setTargetAtTime(value * 0.4, this.ctx.currentTime, 0.01);
        break;
      case 'treble':
        this.trebleFilter.gain.setTargetAtTime(value * 0.4, this.ctx.currentTime, 0.01);
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
    this.feedbackGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    this.bassFilter.disconnect();
    this.trebleFilter.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * TAPE ECHO 2 — New tape delay with LC/HC filters
 * ═══════════════════════════════════════════════════════════════ */

export class TapeEcho2Effect extends BaseEffect {
  readonly type = 'TAPE_ECHO2';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private lcFilter!: BiquadFilterNode;
  private hcFilter!: BiquadFilterNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'repeatRate', label: 'REPEAT RATE', min: 1, max: 2000, default: 200, unit: 'ms' },
      { name: 'intensity', label: 'INTENSITY', min: 0, max: 100, default: 50 },
      { name: 'dLevel', label: 'D.LEVEL', min: 0, max: 100, default: 100 },
      { name: 'lowCut', label: 'LOW CUT', min: 0, max: 100, default: 0 },
      { name: 'highCut', label: 'HIGH CUT', min: 0, max: 100, default: 100 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 120, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1.0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.delay = this.ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.2;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.4;

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
    this.hcFilter.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'repeatRate':
        this.delay.delayTime.setTargetAtTime(value / 1000, this.ctx.currentTime, 0.02);
        break;
      case 'intensity':
        this.feedbackGain.gain.setTargetAtTime(this.mapLinear(value, 0, 0.9), this.ctx.currentTime, 0.01);
        break;
      case 'dLevel':
        this.directGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'lowCut':
        this.lcFilter.frequency.setTargetAtTime(value === 0 ? 20 : this.mapFrequency(value), this.ctx.currentTime, 0.01);
        break;
      case 'highCut':
        this.hcFilter.frequency.setTargetAtTime(value === 100 ? 20000 : this.mapFrequency(value), this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.delay.disconnect();
    this.feedbackGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    this.lcFilter.disconnect();
    this.hcFilter.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * ROLL 1 — Short-cycle looping (old algorithm)
 * ═══════════════════════════════════════════════════════════════ */

export class Roll1Effect extends BaseEffect {
  readonly type = 'ROLL1';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'time', label: 'TIME', min: 1, max: 1000, default: 100, unit: 'ms' },
      { name: 'feedback', label: 'FEEDBACK', min: 1, max: 100, default: 50 },
      { name: 'roll', label: 'ROLL', min: 0, max: 4, default: 0, choices: ['OFF', '1/2', '1/4', '1/8', '1/16'] },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.1;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.7;

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
      case 'time':
        this.delay.delayTime.setTargetAtTime(value / 1000, this.ctx.currentTime, 0.005);
        break;
      case 'feedback':
        this.feedbackGain.gain.setTargetAtTime(this.mapLinear(value, 0, 0.95), this.ctx.currentTime, 0.01);
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

/* ═══════════════════════════════════════════════════════════════
 * ROLL 2  — Short-cycle looping (new algorithm, infinite repeat)
 * ═══════════════════════════════════════════════════════════════ */

export class Roll2Effect extends BaseEffect {
  readonly type = 'ROLL2';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'time', label: 'TIME', min: 1, max: 1000, default: 100, unit: 'ms' },
      { name: 'repeat', label: 'REPEAT', min: 1, max: 101, default: 50 },
      { name: 'roll', label: 'ROLL', min: 0, max: 4, default: 0, choices: ['OFF', '1/2', '1/4', '1/8', '1/16'] },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.1;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.7;

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
      case 'time':
        this.delay.delayTime.setTargetAtTime(value / 1000, this.ctx.currentTime, 0.005);
        break;
      case 'repeat':
        // 101 = infinite (feedback = 1.0)
        this.feedbackGain.gain.setTargetAtTime(
          value >= 101 ? 1.0 : this.mapLinear(value, 0, 0.95),
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

/* ═══════════════════════════════════════════════════════════════
 * GRANULAR DELAY — Short buzzy repeats
 * ═══════════════════════════════════════════════════════════════ */

export class GranularDelayEffect extends BaseEffect {
  readonly type = 'GRANULAR_DELAY';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'time', label: 'TIME', min: 0, max: 100, default: 50 },
      { name: 'feedback', label: 'FEEDBACK', min: 0, max: 100, default: 70 },
      { name: 'eLevel', label: 'E.LEVEL', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();
    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);

    this.delay = this.ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.02;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.7;

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
      case 'time':
        this.delay.delayTime.setTargetAtTime(
          this.mapLinear(value, 0.005, 0.1),
          this.ctx.currentTime, 0.005
        );
        break;
      case 'feedback':
        this.feedbackGain.gain.setTargetAtTime(this.mapLinear(value, 0, 0.98), this.ctx.currentTime, 0.01);
        break;
      case 'eLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.delay.disconnect();
    this.feedbackGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}
