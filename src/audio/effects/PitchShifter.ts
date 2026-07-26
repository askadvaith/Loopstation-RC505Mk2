/**
 * GranularPitchShifter — a real-time semitone pitch shifter built from two
 * overlapping, crossfaded delay "grains" (the classic granular / delay-line
 * pitch-shift technique).
 *
 * How it works: a delay line whose delay time ramps linearly changes the
 * playback speed of the delayed signal — effective pitch ratio = 1 − d′(t).
 * A single ramping delay would need to jump back periodically, producing a
 * click; so we run TWO grains staggered by half a window and crossfade between
 * them with triangular gain envelopes, so the discontinuity of one grain is
 * always hidden under the fade-out of the other.
 *
 * Timing is scheduled with sample-accurate AudioParam ramps (not oscillator
 * LFOs), so the delay ramp and its gain window stay perfectly phase-aligned.
 *
 * Fully wet: connect a source to `input`, take the shifted signal from `output`.
 */
export class GranularPitchShifter {
  /** Connect your source here. */
  readonly input: GainNode;
  /** Take the pitch-shifted signal from here. */
  readonly output: GainNode;

  private ctx: AudioContext;
  private grains: { delay: DelayNode; gain: GainNode }[];
  private semitones = 0;
  private readonly windowSec: number;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private grainToggle = 0;
  private nextGrainTime = 0;
  private disposed = false;

  constructor(ctx: AudioContext, windowSec = 0.10) {
    this.ctx = ctx;
    this.windowSec = windowSec;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Two grains: each is input → delay → gain → output.
    this.grains = [0, 1].map(() => {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.001;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      this.input.connect(delay);
      delay.connect(gain);
      gain.connect(this.output);
      return { delay, gain };
    });

    this.nextGrainTime = ctx.currentTime + 0.02;
    this.schedule();
  }

  /** Set the shift amount in semitones (may be fractional). */
  setSemitones(semitones: number): void {
    this.semitones = semitones;
  }

  private schedule = (): void => {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const halfWin = this.windowSec / 2;

    // Schedule grain onsets up to ~120 ms ahead; each grain lasts a full window
    // and a new one starts every half window, so exactly two overlap at a time.
    while (this.nextGrainTime < now + 0.12) {
      this.scheduleGrain(this.grains[this.grainToggle & 1], this.nextGrainTime);
      this.grainToggle++;
      this.nextGrainTime += halfWin;
    }

    this.timer = setTimeout(this.schedule, 40);
  };

  private scheduleGrain(grain: { delay: DelayNode; gain: GainNode }, startTime: number): void {
    const ratio = Math.pow(2, this.semitones / 12);
    const T = this.windowSec;

    // Delay must change by (1 − ratio)·T over the grain to yield the pitch ratio.
    const delayDelta = (1 - ratio) * T;
    // Choose the start delay so the delay line stays positive across the grain.
    const eps = 0.001;
    const d0 = ratio >= 1 ? (-delayDelta + eps) : eps;
    const d1 = d0 + delayDelta;

    const dt = grain.delay.delayTime;
    dt.cancelScheduledValues(startTime);
    dt.setValueAtTime(d0, startTime);
    dt.linearRampToValueAtTime(d1, startTime + T);

    // Triangular amplitude window: 0 → 1 (mid) → 0, hiding the delay reset.
    const g = grain.gain.gain;
    g.cancelScheduledValues(startTime);
    g.setValueAtTime(0, startTime);
    g.linearRampToValueAtTime(1, startTime + T / 2);
    g.linearRampToValueAtTime(0, startTime + T);
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const gr of this.grains) {
      try { gr.delay.disconnect(); } catch { /* ok */ }
      try { gr.gain.disconnect(); } catch { /* ok */ }
    }
    try { this.input.disconnect(); } catch { /* ok */ }
    try { this.output.disconnect(); } catch { /* ok */ }
  }
}
