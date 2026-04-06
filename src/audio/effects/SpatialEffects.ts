/**
 * Spatial Effects — Stereo Enhance, Manual Pan, Isolator, Auto Riff
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * STEREO ENHANCE — Widens stereo image
 * ═══════════════════════════════════════════════════════════════ */

export class StereoEnhanceEffect extends BaseEffect {
  readonly type = 'STEREO_ENHANCE';

  private delay!: DelayNode;
  private enhanceMix!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'enhance', label: 'ENHANCE', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Stereo enhance via Haas effect: add tiny delay to one channel
    this.delay = this.ctx.createDelay(0.05);
    this.delay.delayTime.value = 0.012; // 12ms = subtle widening

    this.enhanceMix = this.ctx.createGain();
    this.enhanceMix.gain.value = 0.3;

    // Create stereo widening with mid-side manipulation
    // (Unused nodes cleaned up)

    // Pass through direct
    this.inputNode.connect(this.outputNode);

    // Add delayed/inverted side signal for width
    this.inputNode.connect(this.delay);
    this.delay.connect(this.enhanceMix);
    this.enhanceMix.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    if (name === 'enhance') {
      this.delay.delayTime.setTargetAtTime(
        this.mapLinear(value, 0.001, 0.025),
        this.ctx.currentTime, 0.01
      );
      this.enhanceMix.gain.setTargetAtTime(value / 200, this.ctx.currentTime, 0.01);
    }
  }

  dispose(): void {
    this.delay.disconnect();
    this.enhanceMix.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * MANUAL PAN — Knob-controlled panning
 * ═══════════════════════════════════════════════════════════════ */

export class ManualPanEffect extends BaseEffect {
  readonly type = 'MANUAL_PAN';

  private panner!: StereoPannerNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'position', label: 'POSITION', min: -50, max: 50, default: 0, sequenceable: true },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.panner = this.ctx.createStereoPanner();
    this.panner.pan.value = 0;

    this.inputNode.connect(this.panner);
    this.panner.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    if (name === 'position') {
      this.panner.pan.setTargetAtTime(value / 50, this.ctx.currentTime, 0.01);
    }
  }

  dispose(): void {
    this.panner.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * ISOLATOR — 3-band frequency cutter
 * ═══════════════════════════════════════════════════════════════ */

export class IsolatorEffect extends BaseEffect {
  readonly type = 'ISOLATOR';

  private lowBand!: BiquadFilterNode;
  private midBand!: BiquadFilterNode;
  private highBand!: BiquadFilterNode;
  private lowGain!: GainNode;
  private midGain!: GainNode;
  private highGain!: GainNode;

  private selectedBand = 1; // 0=low, 1=mid, 2=high

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'band', label: 'BAND', min: 0, max: 2, default: 1, choices: ['LOW', 'MIDDLE', 'HIGH'] },
      { name: 'bandLevel', label: 'BAND LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'stepRate', label: 'STEP RATE', min: 0, max: 100, default: 0 },
      { name: 'waveform', label: 'WAVEFORM', min: 0, max: 1, default: 0, choices: ['TRI', 'SQR'] },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // 3-band split
    this.lowBand = this.ctx.createBiquadFilter();
    this.lowBand.type = 'lowpass';
    this.lowBand.frequency.value = 300;

    this.midBand = this.ctx.createBiquadFilter();
    this.midBand.type = 'bandpass';
    this.midBand.frequency.value = 1500;
    this.midBand.Q.value = 0.7;

    this.highBand = this.ctx.createBiquadFilter();
    this.highBand.type = 'highpass';
    this.highBand.frequency.value = 3000;

    this.lowGain = this.ctx.createGain();
    this.lowGain.gain.value = 1;
    this.midGain = this.ctx.createGain();
    this.midGain.gain.value = 1;
    this.highGain = this.ctx.createGain();
    this.highGain.gain.value = 1;

    this.inputNode.connect(this.lowBand);
    this.inputNode.connect(this.midBand);
    this.inputNode.connect(this.highBand);

    this.lowBand.connect(this.lowGain);
    this.midBand.connect(this.midGain);
    this.highBand.connect(this.highGain);

    this.lowGain.connect(this.outputNode);
    this.midGain.connect(this.outputNode);
    this.highGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'band':
        this.selectedBand = Math.round(value);
        // Reset all bands to full
        this.lowGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
        this.midGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
        this.highGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
        // Apply current bandLevel to newly selected band
        this.applyBandLevel(this.getParam('bandLevel') ?? 50);
        break;
      case 'bandLevel':
        this.applyBandLevel(value);
        break;
    }
  }

  private applyBandLevel(value: number): void {
    const gain = value / 100;
    const targets = [this.lowGain, this.midGain, this.highGain];
    targets[this.selectedBand].gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
  }

  dispose(): void {
    this.lowBand.disconnect();
    this.midBand.disconnect();
    this.highBand.disconnect();
    this.lowGain.disconnect();
    this.midGain.disconnect();
    this.highGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * AUTO RIFF — Auto phrase generation from input (simplified)
 * ═══════════════════════════════════════════════════════════════ */

export class AutoRiffEffect extends BaseEffect {
  readonly type = 'AUTO_RIFF';

  private delay!: DelayNode;
  private feedbackGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private filter!: BiquadFilterNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'phrase', label: 'PHRASE', min: 1, max: 30, default: 1, step: 1 },
      { name: 'tempo', label: 'TEMPO', min: 0, max: 100, default: 50 },
      { name: 'hold', label: 'HOLD', min: 0, max: 1, default: 1, choices: ['OFF', 'ON'] },
      { name: 'attack', label: 'ATTACK', min: 0, max: 100, default: 50 },
      { name: 'loop', label: 'LOOP', min: 0, max: 1, default: 1, choices: ['OFF', 'ON'] },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Auto riff: rhythmic gating + pitch variation
    this.delay = this.ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.125;

    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0.5;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'bandpass';
    this.filter.frequency.value = 1000;
    this.filter.Q.value = 3;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'square';
    this.lfo.frequency.value = 4;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.5;
    this.lfo.connect(this.lfoGain);
    this.lfo.start();

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;
    this.lfoGain.connect(this.effectGain.gain);

    this.inputNode.connect(this.delay);
    this.delay.connect(this.filter);
    this.filter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
    this.delay.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delay);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'tempo':
        this.lfo.frequency.setTargetAtTime(this.mapLinear(value, 1, 16), this.ctx.currentTime, 0.01);
        break;
      case 'balance':
        this.directGain.gain.setTargetAtTime(1 - value / 100, this.ctx.currentTime, 0.01);
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
    this.filter.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}
