/**
 * Pitch Effects — Pitch Bend, Slow Gear, Transpose, Octave,
 *                 Robot, Electric, Synth
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';

/* ═══════════════════════════════════════════════════════════════
 * PITCH BEND — Pitch bending via modulated delay
 * ═══════════════════════════════════════════════════════════════ */

export class PitchBendEffect extends BaseEffect {
  readonly type = 'PITCH_BEND';

  private delay!: DelayNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'pitch', label: 'PITCH', min: -3, max: 4, default: 0, step: 1, unit: 'OCT' },
      { name: 'bend', label: 'BEND', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'mode', label: 'MODE', min: 0, max: 1, default: 0, choices: ['1', '2'] },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.delay = this.ctx.createDelay(0.2);
    this.delay.delayTime.value = 0.05;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sawtooth';
    this.lfo.frequency.value = 0;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();

    this.inputNode.connect(this.delay);
    this.delay.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'bend':
        this.lfoGain.gain.setTargetAtTime(
          this.mapLinear(value, 0, 0.05),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'pitch': {
        // Use LFO frequency to create a pitch drift
        const shift = value; // -3 to +4 octaves
        this.lfo.frequency.setTargetAtTime(
          shift * 2,
          this.ctx.currentTime, 0.01
        );
        break;
      }
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.delay.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * SLOW GEAR — Violin-like volume swell
 * ═══════════════════════════════════════════════════════════════ */

export class SlowGearEffect extends BaseEffect {
  readonly type = 'SLOW_GEAR';

  private envelopeGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'sens', label: 'SENS', min: 0, max: 100, default: 50 },
      { name: 'riseTime', label: 'RISE TIME', min: 0, max: 100, default: 50 },
      { name: 'level', label: 'LEVEL', min: 0, max: 100, default: 50 },
      { name: 'mode', label: 'MODE', min: 0, max: 1, default: 0, choices: ['1', '2'] },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Volume envelope: starts low, ramps up over a configurable time
    this.envelopeGain = this.ctx.createGain();
    this.envelopeGain.gain.value = 0;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.envelopeGain);
    this.envelopeGain.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);

    // Simple swell simulation: ramp up gain continuously
    this.envelopeGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.5);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'riseTime':
        // Restart swell with new rise time
        this.envelopeGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.envelopeGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.envelopeGain.gain.setTargetAtTime(1, this.ctx.currentTime, this.mapLinear(value, 0.05, 3.0));
        break;
      case 'level':
        this.effectGain.gain.setTargetAtTime(value / 50, this.ctx.currentTime, 0.01);
        break;
    }
  }

  dispose(): void {
    this.envelopeGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * TRANSPOSE — Pitch transposition (simplified via detune)
 * ═══════════════════════════════════════════════════════════════ */

export class TransposeEffect extends BaseEffect {
  readonly type = 'TRANSPOSE';

  private delay!: DelayNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'trans', label: 'TRANS', min: -12, max: 12, default: 0, step: 1, sequenceable: true },
      { name: 'scale', label: 'SCALE', min: 0, max: 12, default: 0, choices: ['CHROMATIC', 'C(Am)', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] },
      { name: 'mode', label: 'MODE', min: 0, max: 1, default: 0, choices: ['1', '2'] },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Pitch shift via granular technique (modulated delay)
    this.delay = this.ctx.createDelay(0.2);
    this.delay.delayTime.value = 0.05;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sawtooth';
    this.lfo.frequency.value = 0;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();

    this.inputNode.connect(this.delay);
    this.delay.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    if (name === 'trans') {
      // Semitone shift: each semitone ≈ 5.946% speed change
      // Simulated by modulating delay line rate
      const semitones = Math.round(value);
      const rate = semitones * 0.5;
      this.lfo.frequency.setTargetAtTime(rate, this.ctx.currentTime, 0.01);
      this.lfoGain.gain.setTargetAtTime(
        Math.abs(semitones) > 0 ? 0.02 : 0,
        this.ctx.currentTime, 0.01
      );
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.delay.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * OCTAVE — Adds octave(s) below the input
 * ═══════════════════════════════════════════════════════════════ */

export class OctaveEffect extends BaseEffect {
  readonly type = 'OCTAVE';

  private directGain!: GainNode;
  private effectGain!: GainNode;
  private lpFilter!: BiquadFilterNode;
  private hpFilter!: BiquadFilterNode;
  private waveshaper!: WaveShaperNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'octave', label: 'OCTAVE', min: 0, max: 2, default: 1, choices: ['-1OCT', '-2OCT', '-1&-2OCT'] },
      { name: 'lowCut', label: 'LOW CUT', min: 0, max: 100, default: 0 },
      { name: 'highCut', label: 'HIGH CUT', min: 0, max: 100, default: 100 },
      { name: 'octLevel', label: 'OCT.LEVEL', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'mode', label: 'MODE', min: 0, max: 1, default: 0, choices: ['1', '2'] },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Octave-down simulation using waveshaper (frequency doubling/halving)
    this.waveshaper = this.ctx.createWaveShaper();
    const n = 8192;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      // Full-wave rectification (octave-up) then LP to simulate octave-down
      curve[i] = Math.abs(x) * 2 - 1;
    }
    this.waveshaper.curve = curve;

    this.hpFilter = this.ctx.createBiquadFilter();
    this.hpFilter.type = 'highpass';
    this.hpFilter.frequency.value = 20;

    this.lpFilter = this.ctx.createBiquadFilter();
    this.lpFilter.type = 'lowpass';
    this.lpFilter.frequency.value = 20000;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.waveshaper);
    this.waveshaper.connect(this.hpFilter);
    this.hpFilter.connect(this.lpFilter);
    this.lpFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'octLevel':
        this.effectGain.gain.setTargetAtTime(value / 100, this.ctx.currentTime, 0.01);
        break;
      case 'lowCut':
        this.hpFilter.frequency.setTargetAtTime(
          value === 0 ? 20 : this.mapFrequency(value),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'highCut':
        this.lpFilter.frequency.setTargetAtTime(
          value === 100 ? 20000 : this.mapFrequency(value),
          this.ctx.currentTime, 0.01
        );
        break;
    }
  }

  dispose(): void {
    this.directGain.disconnect();
    this.effectGain.disconnect();
    this.waveshaper.disconnect();
    this.hpFilter.disconnect();
    this.lpFilter.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * ROBOT — Cyber-robot fixed-pitch voice
 * ═══════════════════════════════════════════════════════════════ */

const NOTE_FREQUENCIES: Record<string, number> = {
  C: 261.63, 'C#': 277.18, D: 293.66, 'D#': 311.13, E: 329.63,
  F: 349.23, 'F#': 369.99, G: 392.00, 'G#': 415.30, A: 440.00,
  'A#': 466.16, B: 493.88,
};
const NOTE_NAMES = Object.keys(NOTE_FREQUENCIES);

export class RobotEffect extends BaseEffect {
  readonly type = 'ROBOT';

  private carrier!: OscillatorNode;
  private modGain!: GainNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'note', label: 'NOTE', min: 0, max: 11, default: 0, step: 1, choices: NOTE_NAMES },
      { name: 'formant', label: 'FORMANT', min: -50, max: 50, default: 0 },
      { name: 'mode', label: 'MODE', min: 0, max: 1, default: 0, choices: ['1', '2'] },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Direct passthrough (reduced)
    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.2;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Robot: ring-modulate input with a carrier oscillator at fixed pitch
    this.carrier = this.ctx.createOscillator();
    this.carrier.type = 'square';
    this.carrier.frequency.value = 261.63; // C4

    this.modGain = this.ctx.createGain();
    this.modGain.gain.value = 0;
    this.carrier.connect(this.modGain.gain);
    this.carrier.start();

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.8;

    this.inputNode.connect(this.modGain);
    this.modGain.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'note': {
        const noteName = NOTE_NAMES[Math.round(value)] ?? 'C';
        this.carrier.frequency.setTargetAtTime(
          NOTE_FREQUENCIES[noteName],
          this.ctx.currentTime, 0.01
        );
        break;
      }
      case 'formant':
        // Adjust direct/effect balance to simulate formant shift
        this.directGain.gain.setTargetAtTime(
          0.2 + (value + 50) / 100 * 0.3,
          this.ctx.currentTime, 0.01
        );
        break;
    }
  }

  dispose(): void {
    this.carrier.stop();
    this.carrier.disconnect();
    this.modGain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * ELECTRIC — Mechanical pitch stepping
 * ═══════════════════════════════════════════════════════════════ */

export class ElectricEffect extends BaseEffect {
  readonly type = 'ELECTRIC';

  private delay!: DelayNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private effectGain!: GainNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'shift', label: 'SHIFT', min: -12, max: 12, default: 0, step: 1 },
      { name: 'formant', label: 'FORMANT', min: -50, max: 50, default: 0 },
      { name: 'speed', label: 'SPEED', min: 0, max: 10, default: 5, step: 1 },
      { name: 'stability', label: 'STABILITY', min: -10, max: 10, default: 0, step: 1 },
      { name: 'mode', label: 'MODE', min: 0, max: 1, default: 0, choices: ['1', '2'] },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.delay = this.ctx.createDelay(0.2);
    this.delay.delayTime.value = 0.02;

    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sawtooth';
    this.lfo.frequency.value = 0;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.delay.delayTime);
    this.lfo.start();

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 1;

    this.inputNode.connect(this.delay);
    this.delay.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'shift': {
        const semitones = Math.round(value);
        this.lfo.frequency.setTargetAtTime(semitones * 0.5, this.ctx.currentTime, 0.01);
        this.lfoGain.gain.setTargetAtTime(
          Math.abs(semitones) > 0 ? 0.015 : 0,
          this.ctx.currentTime, 0.01
        );
        break;
      }
      case 'speed':
        // Faster speed = quicker settling of pitch changes
        break;
    }
  }

  dispose(): void {
    this.lfo.stop();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
    this.delay.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * SYNTH — Synthesizer sound generation
 * ═══════════════════════════════════════════════════════════════ */

export class SynthEffect extends BaseEffect {
  readonly type = 'SYNTH';

  private filter!: BiquadFilterNode;
  private directGain!: GainNode;
  private effectGain!: GainNode;
  private waveshaper!: WaveShaperNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      { name: 'frequency', label: 'FREQUENCY', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'resonance', label: 'RESONANCE', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'decay', label: 'DECAY', min: 0, max: 100, default: 50, sequenceable: true },
      { name: 'balance', label: 'BALANCE', min: 0, max: 100, default: 50 },
    ];
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0.5;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Synth emulation: distortion + resonant filter
    this.waveshaper = this.ctx.createWaveShaper();
    const n = 8192;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.sign(x) * (1 - Math.exp(-3 * Math.abs(x)));
    }
    this.waveshaper.curve = curve;

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2000;
    this.filter.Q.value = 5;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.waveshaper);
    this.waveshaper.connect(this.filter);
    this.filter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'frequency':
        this.filter.frequency.setTargetAtTime(
          this.mapFrequency(value, 100, 15000),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'resonance':
        this.filter.Q.setTargetAtTime(
          this.mapLinear(value, 0.5, 20),
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
    this.waveshaper.disconnect();
    this.filter.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    super.dispose();
  }
}
