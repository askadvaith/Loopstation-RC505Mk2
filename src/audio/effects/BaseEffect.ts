/**
 * BaseEffect — Abstract base class for all CR-606 MK-1 effect types.
 *
 * Each effect wraps one or more Web Audio API nodes and exposes a uniform
 * interface for parameter control, connection, and disposal.
 *
 * Signal flow: inputNode → [internal DSP graph] → outputNode
 */

/* ─── Types ─── */

export type ParamValue = number | string | boolean;

export interface EffectParamDef {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
  unit?: string;
  /** If true, this parameter can be modulated by FX Sequence (★ marker). */
  sequenceable?: boolean;
  /** For enum-style params, provide choices. Value is still numeric (index). */
  choices?: string[];
}

export interface EffectTypeDef {
  type: string;
  label: string;
  category: EffectCategory;
  params: EffectParamDef[];
  /** Track-FX only (not available on Input FX) */
  trackOnly?: boolean;
}

export type EffectCategory =
  | 'filter'
  | 'modulation'
  | 'pitch'
  | 'guitar'
  | 'dynamics'
  | 'spatial'
  | 'slicer'
  | 'delay'
  | 'character'
  | 'reverb'
  | 'beat';

/* ─── Base Effect Class ─── */

export abstract class BaseEffect {
  abstract readonly type: string;

  protected ctx: AudioContext;

  /** Connect your source to this node. */
  inputNode: GainNode;

  /** Take output from this node. */
  outputNode: GainNode;

  /** Dry/wet mix control */
  protected dryGain: GainNode;
  protected wetGain: GainNode;

  /** Current parameter values (key → numeric value). */
  protected _params: Map<string, number> = new Map();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();

    // Default dry/wet routing (many effects override this)
    this.dryGain = ctx.createGain();
    this.wetGain = ctx.createGain();

    this.inputNode.connect(this.dryGain);
    this.dryGain.connect(this.outputNode);
    this.wetGain.connect(this.outputNode);
  }

  /** Get the definition for this effect's parameters. */
  abstract getParamDefs(): EffectParamDef[];

  /** Initialize internal DSP nodes — called after construction. */
  abstract buildGraph(): void;

  /** Apply a parameter change to the DSP graph in real time. */
  abstract applyParam(name: string, value: number): void;

  /** Set a single parameter. */
  setParam(name: string, value: number): void {
    this._params.set(name, value);
    this.applyParam(name, value);
  }

  /** Get a single parameter value. */
  getParam(name: string): number {
    return this._params.get(name) ?? 0;
  }

  /** Get all parameter values. */
  getAllParams(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [k, v] of this._params) result[k] = v;
    return result;
  }

  /** Initialise all params to defaults and build the DSP graph. */
  init(): void {
    for (const def of this.getParamDefs()) {
      this._params.set(def.name, def.default);
    }
    this.buildGraph();
    // Apply all defaults
    for (const def of this.getParamDefs()) {
      this.applyParam(def.name, def.default);
    }
  }

  /** Connect the effect output to a destination. */
  connect(destination: AudioNode): void {
    this.outputNode.connect(destination);
  }

  /** Disconnect all outputs. */
  disconnect(): void {
    this.outputNode.disconnect();
  }

  /** Clean up all nodes. Override to dispose of additional nodes. */
  dispose(): void {
    try {
      this.inputNode.disconnect();
      this.outputNode.disconnect();
      this.dryGain.disconnect();
      this.wetGain.disconnect();
    } catch {
      // ignore disconnection errors
    }
  }

  /* ─── Utility Helpers ─── */

  /** Map a 0–100 parameter to a frequency range (20 Hz – 20 kHz, logarithmic). */
  protected mapFrequency(value: number, min = 20, max = 20000): number {
    const normalized = value / 100;
    return min * Math.pow(max / min, normalized);
  }

  /** Map a 0–100 parameter to a linear range. */
  protected mapLinear(value: number, min: number, max: number): number {
    return min + (value / 100) * (max - min);
  }

  /** Map a 0-100 parameter to a time in seconds. */
  protected mapTime(value: number, minMs: number, maxMs: number): number {
    return (minMs + (value / 100) * (maxMs - minMs)) / 1000;
  }

  /** Create an LFO (oscillator + gain) for modulation effects. */
  protected createLFO(
    frequency: number,
    type: OscillatorType = 'sine'
  ): { osc: OscillatorNode; gain: GainNode } {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    osc.connect(gain);
    osc.start();

    return { osc, gain };
  }

  /** Map a 0–100 rate parameter to a frequency in Hz (0.05–16 Hz). */
  protected mapRate(value: number): number {
    return 0.05 + (value / 100) * 15.95;
  }
}
