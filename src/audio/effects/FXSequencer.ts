/**
 * FXSequencer — 16-step parameter modulation engine, synced to tempo.
 *
 * The CR-606 MK-1's FX SEQUENCE feature allows any ★-marked parameter
 * to be automated over 16 steps. Each step has a value (0–100).
 *
 * Parameters:
 *   SW: on/off
 *   SYNC: FREE / BPM-synced
 *   RETRIG: off / on (restart sequence on bank change)
 *   TARGET: which FX slot's ★-param to modulate
 *   RATE: step rate (0–100, maps to note values or free Hz)
 *   MAX: how many steps to use (1–16)
 *   VAL1–VAL16: step values (0–100)
 */

import { EffectsChain } from './EffectsChain';
import type { FXBankId } from './EffectsChain';

/* ─── Types ─── */

export interface FXSequenceTarget {
  bankId: FXBankId;
  slotIdx: number;
  paramName: string;
}

export interface FXSequenceState {
  sw: boolean;
  sync: 'FREE' | 'BPM';
  retrig: boolean;
  target: FXSequenceTarget | null;
  rate: number;       // 0–100
  max: number;        // 1–16 (number of active steps)
  values: number[];   // 16 values, each 0–100
}

export function createDefaultSequenceState(): FXSequenceState {
  return {
    sw: false,
    sync: 'BPM',
    retrig: false,
    target: null,
    rate: 50,
    max: 16,
    values: new Array(16).fill(50),
  };
}

/* ─── FXSequencer Class ─── */

export class FXSequencer {
  private state: FXSequenceState;
  private chain: EffectsChain;

  /** Current step index (0-based). */
  private stepIndex = 0;

  /** Timer or RAF id. */
  private timerId: number | null = null;
  private isRunning = false;

  /** Tempo reference (BPM) for synced mode. */
  private tempo = 120;

  constructor(chain: EffectsChain, initialState?: FXSequenceState) {
    this.chain = chain;
    this.state = initialState ?? createDefaultSequenceState();
  }

  /* ─── State Access ─── */

  getState(): FXSequenceState {
    return { ...this.state, values: [...this.state.values] };
  }

  get currentStep(): number {
    return this.stepIndex;
  }

  /* ─── Control ─── */

  /** Start or stop the sequencer based on sw state. */
  setSw(sw: boolean): void {
    this.state.sw = sw;
    if (sw) {
      this.start();
    } else {
      this.stop();
    }
  }

  setSync(sync: 'FREE' | 'BPM'): void {
    this.state.sync = sync;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  setRetrig(retrig: boolean): void {
    this.state.retrig = retrig;
  }

  setTarget(target: FXSequenceTarget | null): void {
    this.state.target = target;
  }

  setRate(rate: number): void {
    this.state.rate = Math.max(0, Math.min(100, rate));
  }

  setMax(max: number): void {
    this.state.max = Math.max(1, Math.min(16, Math.round(max)));
  }

  setStepValue(stepIdx: number, value: number): void {
    if (stepIdx >= 0 && stepIdx < 16) {
      this.state.values[stepIdx] = Math.max(0, Math.min(100, value));
    }
  }

  /** Update tempo reference (called from engine). */
  setTempo(bpm: number): void {
    this.tempo = bpm;
    // If running in BPM mode, update interval
    if (this.isRunning && this.state.sync === 'BPM') {
      this.stop();
      this.start();
    }
  }

  /** Retrigger (restart from step 0). */
  retrigger(): void {
    if (this.state.retrig && this.isRunning) {
      this.stepIndex = 0;
    }
  }

  /* ─── Internal ─── */

  private start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.stepIndex = 0;
    this.tick();
  }

  private stop(): void {
    this.isRunning = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private getStepIntervalMs(): number {
    if (this.state.sync === 'BPM') {
      // Rate 0–100 maps to note divisions:
      // 0 = whole note, 25 = half, 50 = quarter, 75 = 8th, 100 = 16th
      const beatDuration = 60000 / this.tempo; // ms per beat (quarter note)
      const rate = this.state.rate / 100;

      // Exponential mapping: higher rate = shorter divisions
      const divisionFactor = Math.pow(2, rate * 4 - 2); // 0.25 to 4
      return beatDuration / divisionFactor;
    } else {
      // FREE mode: rate 0–100 maps to 2000ms–30ms
      return 2000 - (this.state.rate / 100) * 1970;
    }
  }

  private tick = (): void => {
    if (!this.isRunning || !this.state.sw) return;

    // Apply current step value to target parameter
    if (this.state.target) {
      const { bankId, slotIdx, paramName } = this.state.target;
      const stepValue = this.state.values[this.stepIndex % this.state.max];
      this.chain.setSlotParam(bankId, slotIdx, paramName, stepValue);
    }

    // Advance step
    this.stepIndex = (this.stepIndex + 1) % this.state.max;

    // Schedule next tick
    const intervalMs = Math.max(10, this.getStepIntervalMs());
    this.timerId = window.setTimeout(this.tick, intervalMs);
  };

  /* ─── State Load/Save ─── */

  loadState(state: FXSequenceState): void {
    const wasRunning = this.isRunning;
    this.stop();
    this.state = { ...state, values: [...state.values] };
    if (wasRunning && this.state.sw) {
      this.start();
    }
  }

  exportState(): FXSequenceState {
    return { ...this.state, values: [...this.state.values] };
  }

  /* ─── Cleanup ─── */

  dispose(): void {
    this.stop();
  }
}
