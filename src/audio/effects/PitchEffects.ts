/**
 * Pitch Effects — Pitch Bend, Slow Gear, Transpose, Octave,
 *                 Robot, Electric, Synth
 */

import { BaseEffect } from './BaseEffect';
import type { EffectParamDef } from './BaseEffect';
import { GranularPitchShifter } from './PitchShifter';

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

  private shifter!: GranularPitchShifter;

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

    // Real semitone pitch shift (fully wet).
    this.shifter = new GranularPitchShifter(this.ctx);
    this.inputNode.connect(this.shifter.input);
    this.shifter.output.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    if (name === 'trans') {
      this.shifter.setSemitones(Math.round(value));
    }
  }

  dispose(): void {
    this.shifter.dispose();
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
  private oct1!: GranularPitchShifter; // −1 octave (−12 st)
  private oct2!: GranularPitchShifter; // −2 octaves (−24 st)
  private oct1Gain!: GainNode;
  private oct2Gain!: GainNode;

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

    // Dry passthrough retains the original pitch.
    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 1;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Real octave-down voices via pitch shifting, tone-shaped and level-mixed.
    this.oct1 = new GranularPitchShifter(this.ctx);
    this.oct1.setSemitones(-12);
    this.oct2 = new GranularPitchShifter(this.ctx);
    this.oct2.setSemitones(-24);

    this.oct1Gain = this.ctx.createGain();
    this.oct1Gain.gain.value = 1; // enabled voices selected by 'octave' param
    this.oct2Gain = this.ctx.createGain();
    this.oct2Gain.gain.value = 0;

    this.hpFilter = this.ctx.createBiquadFilter();
    this.hpFilter.type = 'highpass';
    this.hpFilter.frequency.value = 20;

    this.lpFilter = this.ctx.createBiquadFilter();
    this.lpFilter.type = 'lowpass';
    this.lpFilter.frequency.value = 20000;

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 0.5;

    this.inputNode.connect(this.oct1.input);
    this.oct1.output.connect(this.oct1Gain);
    this.oct1Gain.connect(this.hpFilter);

    this.inputNode.connect(this.oct2.input);
    this.oct2.output.connect(this.oct2Gain);
    this.oct2Gain.connect(this.hpFilter);

    this.hpFilter.connect(this.lpFilter);
    this.lpFilter.connect(this.effectGain);
    this.effectGain.connect(this.outputNode);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'octave': {
        // 0 = −1OCT only, 1 = −2OCT only, 2 = both
        const idx = Math.round(value);
        const t = this.ctx.currentTime;
        this.oct1Gain.gain.setTargetAtTime(idx === 0 || idx === 2 ? 1 : 0, t, 0.01);
        this.oct2Gain.gain.setTargetAtTime(idx === 1 || idx === 2 ? 1 : 0, t, 0.01);
        break;
      }
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
    this.oct1.dispose();
    this.oct2.dispose();
    this.oct1Gain.disconnect();
    this.oct2Gain.disconnect();
    this.directGain.disconnect();
    this.effectGain.disconnect();
    this.hpFilter.disconnect();
    this.lpFilter.disconnect();
    super.dispose();
  }
}

/* ═══════════════════════════════════════════════════════════════
 * ROBOT — Cyber-robot fixed-pitch voice
 *
 * The RC-505 ROBOT *forces* the output onto a fixed NOTE regardless of the
 * pitch you sing — "hit any note just by going ah". A ring modulator (the old
 * implementation: input × carrier) does NOT do this: multiplying by a carrier
 * keeps the singer's own pitch and only adds metallic sidebands, so you still
 * hear yourself. We model the real behaviour as an envelope-vocoder instead:
 *   - a fixed-pitch sawtooth CARRIER at the NOTE frequency (rich in harmonics),
 *   - gated by the VOICE ENVELOPE (sing louder → robot louder; silence → silent,
 *     so "ah… ah… ah" pulses become the "bum bum bum" rhythm),
 *   - tone-shaped by a single low-pass (FORMANT = brightness), so it stays a
 *     clean pitched "bum", NOT a sung vowel. An earlier version imposed fixed
 *     "ah" formant band-passes; those gave the tone a vocal timbre that read as
 *     "I can still hear my voice in the background" — the opposite of a cyber
 *     robot. The ROBOT replaces the voice with a synth note; it does not colour
 *     the note to sound like a mouth.
 *   - with the dry voice dropped entirely.
 * The output is therefore a clean monophonic tone at NOTE — which is also what
 * makes it verifiable by pitch-detecting an offline render against
 * samples/robot_slicer_input.mid (see the MIDI verification harness).
 * If you revert this to a ring modulator, the singer's pitch bleeds back and
 * changing NOTE stops working. NOTE: the melody itself comes from CHANGING NOTE
 * over time (live via ← →, or the FX Sequencer); a slicer only adds rhythm.
 * ═══════════════════════════════════════════════════════════════ */

const NOTE_FREQUENCIES: Record<string, number> = {
  C: 261.63, 'C#': 277.18, D: 293.66, 'D#': 311.13, E: 329.63,
  F: 349.23, 'F#': 369.99, G: 392.00, 'G#': 415.30, A: 440.00,
  'A#': 466.16, B: 493.88,
};
const NOTE_NAMES = Object.keys(NOTE_FREQUENCIES);

/** WaveShaper curve for full-wave rectification: y = |x|. */
function makeAbsCurve(n = 4096) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.abs(x);
  }
  return curve;
}

/** WaveShaper curve clamping to [0,1]; also clamps out-of-range input to the ends. */
function makeClamp01Curve(n = 4096) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.min(1, Math.max(0, x));
  }
  return curve;
}

export class RobotEffect extends BaseEffect {
  readonly type = 'ROBOT';

  private carrier!: OscillatorNode;
  private carrierVCA!: GainNode;      // gated by the voice envelope
  private toneShape!: BiquadFilterNode; // tames the saw; FORMANT = its cutoff
  private directGain!: GainNode;
  private effectGain!: GainNode;
  // Envelope follower, built entirely from audio-graph nodes (no AnalyserNode /
  // requestAnimationFrame) so it also runs inside an OfflineAudioContext — that
  // is what makes the effect renderable by the MIDI verification harness.
  private envRectify!: WaveShaperNode;
  private envSmooth!: BiquadFilterNode;
  private envGain!: GainNode;
  private envClamp!: WaveShaperNode;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  getParamDefs(): EffectParamDef[] {
    return [
      // NOTE is ★-sequenceable so the FX Sequence (or the real-time parameter
      // editor) can play a melody line — this is the tutorial's "oscillator
      // sequencer" trick.
      { name: 'note', label: 'NOTE', min: 0, max: 11, default: 3, step: 1, choices: NOTE_NAMES, sequenceable: true },
      // OCTAVE is not on the hardware ROBOT (which has only NOTE + FORMANT) but
      // it lets us match the register of the reference performance. Default -1
      // puts NOTE:D# at D#3, matching samples/robot_slicer_input.mid.
      { name: 'octave', label: 'OCTAVE', min: 0, max: 4, default: 1, step: 1, choices: ['-2', '-1', '0', '+1', '+2'] },
      { name: 'formant', label: 'FORMANT', min: -50, max: 50, default: 0 },
      { name: 'mode', label: 'MODE', min: 0, max: 1, default: 0, choices: ['1', '2'] },
    ];
  }

  /** Carrier frequency for the current NOTE + OCTAVE selection. */
  private carrierFreq(): number {
    const noteName = NOTE_NAMES[Math.round(this.getParam('note') ?? 0)] ?? 'C';
    const octaveOffset = Math.round(this.getParam('octave') ?? 1) - 2; // -2..+2
    return NOTE_FREQUENCIES[noteName] * Math.pow(2, octaveOffset);
  }

  /** Tone low-pass cutoff (Hz) for the current FORMANT (-50..+50) setting.
   *  Negative → darker (more "masculine"); positive → brighter ("feminine"). */
  private formantCutoff(): number {
    const f = this.getParam('formant') ?? 0; // -50..+50
    return 2400 * Math.pow(2, (f / 50) * 1.1); // ~1.1k … ~5.1k
  }

  buildGraph(): void {
    this.inputNode.disconnect();

    // Dry voice is dropped — the whole point is to replace it with the note.
    this.directGain = this.ctx.createGain();
    this.directGain.gain.value = 0;
    this.inputNode.connect(this.directGain);
    this.directGain.connect(this.outputNode);

    // Fixed-pitch carrier. Sawtooth is rich enough to sound synthetic and cut
    // through, but we tame it with one low-pass rather than vowel formants.
    this.carrier = this.ctx.createOscillator();
    this.carrier.type = 'sawtooth';
    this.carrier.frequency.value = this.carrierFreq();
    this.carrier.start();

    // The voice envelope gates the carrier: its .gain is driven (summed) by the
    // envelope-follower chain below, with a base value of 0 so silence → silent.
    this.carrierVCA = this.ctx.createGain();
    this.carrierVCA.gain.value = 0;
    this.carrier.connect(this.carrierVCA);

    this.effectGain = this.ctx.createGain();
    this.effectGain.gain.value = 1;

    // Single low-pass tone shaping — a clean pitched "bum", not a vowel.
    this.toneShape = this.ctx.createBiquadFilter();
    this.toneShape.type = 'lowpass';
    this.toneShape.frequency.value = this.formantCutoff();
    this.toneShape.Q.value = 0.7;
    this.carrierVCA.connect(this.toneShape);
    this.toneShape.connect(this.effectGain);

    this.effectGain.connect(this.outputNode);

    // ── Envelope follower (pure audio-graph, offline-safe) ──
    // Rectify the voice (|x| via WaveShaper), low-pass to a smooth envelope,
    // scale it up, clamp to [0,1], then feed it INTO carrierVCA.gain. Turning
    // "ah… ah… ah" into note pulses ("bum bum bum") needs no SENS control.
    this.envRectify = this.ctx.createWaveShaper();
    this.envRectify.curve = makeAbsCurve();
    this.envSmooth = this.ctx.createBiquadFilter();
    this.envSmooth.type = 'lowpass';
    this.envSmooth.frequency.value = 14; // ~14 Hz → smooth envelope, not audio
    this.envGain = this.ctx.createGain();
    this.envGain.gain.value = 10; // sensitivity (a bit hotter → punchier pulses)
    this.envClamp = this.ctx.createWaveShaper();
    this.envClamp.curve = makeClamp01Curve();

    this.inputNode.connect(this.envRectify);
    this.envRectify.connect(this.envSmooth);
    this.envSmooth.connect(this.envGain);
    this.envGain.connect(this.envClamp);
    this.envClamp.connect(this.carrierVCA.gain);
  }

  applyParam(name: string, value: number): void {
    switch (name) {
      case 'note':
      case 'octave':
        this.carrier.frequency.setTargetAtTime(
          this.carrierFreq(),
          this.ctx.currentTime, 0.01
        );
        break;
      case 'formant':
        this.toneShape.frequency.setTargetAtTime(
          2400 * Math.pow(2, (value / 50) * 1.1), this.ctx.currentTime, 0.02
        );
        break;
    }
  }

  dispose(): void {
    this.carrier.stop();
    this.carrier.disconnect();
    this.carrierVCA.disconnect();
    this.toneShape.disconnect();
    this.envRectify.disconnect();
    this.envSmooth.disconnect();
    this.envGain.disconnect();
    this.envClamp.disconnect();
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
