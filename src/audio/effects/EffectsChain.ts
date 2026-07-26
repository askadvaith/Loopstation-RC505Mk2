/**
 * EffectsChain — Manages 4 FX banks (A–D) for either Input FX or Track FX.
 *
 * Each bank has:
 *   - SW: on/off
 *   - MODE: SINGLE (only active bank) / MULTI (all active banks)
 *   - 4 FX slots, each with:
 *       - SW: on/off
 *       - SW MODE: TOGGLE / MOMENT
 *       - INSERT: which target (ALL, INPUT, TRACK 1–5)
 *       - FX TYPE: the effect type
 *       - Params: per-effect parameters
 *
 * Signal flow:
 *   inputNode → [ slot1 → slot2 → slot3 → slot4 ] → outputNode
 *   (bank A, B, C, D are parallel; mode determines which are active)
 *
 * This class manages wiring effects in/out and parameter changes.
 */

import { BaseEffect } from './BaseEffect';
import { createEffect, isValidEffectType, getEffectTypeDef } from './EffectRegistry';

/**
 * Resolves an external carrier source node for a given track index (0-based),
 * used by carrier-capable effects (e.g. Vocoder) to vocode over another track.
 */
export type CarrierResolver = (trackId: number) => AudioNode | null;

/** Structural interface for effects that accept an external audio carrier. */
interface CarrierCapableEffect {
  readonly carrierInput: GainNode;
  carrierSrc: AudioNode | null;
  setExternalCarrier(on: boolean): void;
}

function isCarrierCapable(e: BaseEffect): e is BaseEffect & CarrierCapableEffect {
  return typeof (e as unknown as CarrierCapableEffect).setExternalCarrier === 'function'
    && 'carrierInput' in e;
}

/* ─── Types ─── */

export type FXBankId = 'A' | 'B' | 'C' | 'D';
export const FX_BANK_IDS: FXBankId[] = ['A', 'B', 'C', 'D'];

export type FXInsertTarget = 'ALL' | 'INPUT' | 'TRACK1' | 'TRACK2' | 'TRACK3' | 'TRACK4' | 'TRACK5';
export type FXSwMode = 'TOGGLE' | 'MOMENT';
export type FXBankMode = 'SINGLE' | 'MULTI';

export interface FXSlotState {
  sw: boolean;
  swMode: FXSwMode;
  insert: FXInsertTarget;
  fxType: string;        // e.g. 'LPF', 'DELAY', etc.
  params: Record<string, number>;
}

export interface FXBankState {
  sw: boolean;
  mode: FXBankMode;
  slots: [FXSlotState, FXSlotState, FXSlotState, FXSlotState];
}

export interface FXChainState {
  activeBank: FXBankId;
  banks: Record<FXBankId, FXBankState>;
}

/* ─── Defaults ─── */

function createDefaultSlot(): FXSlotState {
  return {
    sw: false,
    swMode: 'TOGGLE',
    insert: 'ALL',
    fxType: 'LPF',
    params: {},
  };
}

function createDefaultBank(): FXBankState {
  return {
    sw: false,
    mode: 'MULTI',
    slots: [createDefaultSlot(), createDefaultSlot(), createDefaultSlot(), createDefaultSlot()],
  };
}

export function createDefaultChainState(): FXChainState {
  return {
    activeBank: 'A',
    banks: {
      A: createDefaultBank(),
      B: createDefaultBank(),
      C: createDefaultBank(),
      D: createDefaultBank(),
    },
  };
}

/* ─── EffectsChain Class ─── */

export class EffectsChain {
  private ctx: AudioContext;

  /** Entry point: connect your source to this. */
  readonly inputNode: GainNode;

  /** Exit point: connect this to your destination. */
  readonly outputNode: GainNode;

  /** Bypass node: direct dry pass-through when all banks are off. */
  private bypassNode: GainNode;

  /** Current chain state. */
  private _state: FXChainState;

  /** Live effect instances: banks[bankId][slotIndex] */
  private effects: Record<FXBankId, (BaseEffect | null)[]> = {
    A: [null, null, null, null],
    B: [null, null, null, null],
    C: [null, null, null, null],
    D: [null, null, null, null],
  };

  /** Per-bank sub-chains: input and output gain nodes. */
  private bankInputs: Record<FXBankId, GainNode>;
  private bankOutputs: Record<FXBankId, GainNode>;

  /** Whether this is a track FX chain (allows beat effects) or input FX chain. */
  readonly isTrackFX: boolean;

  /** Resolves an external carrier source (a track's audio) for carrier-capable FX. */
  private carrierResolver?: CarrierResolver;

  constructor(
    ctx: AudioContext,
    isTrackFX: boolean,
    initialState?: FXChainState,
    carrierResolver?: CarrierResolver,
  ) {
    this.ctx = ctx;
    this.isTrackFX = isTrackFX;
    this.carrierResolver = carrierResolver;
    this._state = initialState ?? createDefaultChainState();

    this.inputNode = ctx.createGain();
    this.outputNode = ctx.createGain();
    this.bypassNode = ctx.createGain();
    this.bypassNode.gain.value = 1;

    // Initialize per-bank gain nodes
    this.bankInputs = {} as Record<FXBankId, GainNode>;
    this.bankOutputs = {} as Record<FXBankId, GainNode>;

    for (const bankId of FX_BANK_IDS) {
      this.bankInputs[bankId] = ctx.createGain();
      this.bankOutputs[bankId] = ctx.createGain();
      this.bankOutputs[bankId].gain.value = 0; // Start muted
    }

    // Default bypass routing
    this.inputNode.connect(this.bypassNode);
    this.bypassNode.connect(this.outputNode);

    // Wire each bank input from chain input, bank output to chain output
    for (const bankId of FX_BANK_IDS) {
      this.inputNode.connect(this.bankInputs[bankId]);
      this.bankOutputs[bankId].connect(this.outputNode);
    }

    // Build initial graphs
    this.rebuildAll();
  }

  /* ─── State Access ─── */

  get state(): FXChainState {
    return JSON.parse(JSON.stringify(this._state));
  }

  get activeBank(): FXBankId {
    return this._state.activeBank;
  }

  /* ─── Bank Control ─── */

  /** Select which bank is active (and visible in UI). */
  setActiveBank(bankId: FXBankId): void {
    this._state.activeBank = bankId;
    this.updateRouting();
  }

  /** Toggle a bank on/off. */
  setBankSw(bankId: FXBankId, sw: boolean): void {
    this._state.banks[bankId].sw = sw;
    this.updateRouting();
  }

  /** Toggle a bank's sw (convenience). */
  toggleBankSw(bankId: FXBankId): void {
    this.setBankSw(bankId, !this._state.banks[bankId].sw);
  }

  /** Set bank mode (SINGLE/MULTI). */
  setBankMode(bankId: FXBankId, mode: FXBankMode): void {
    this._state.banks[bankId].mode = mode;
    this.updateRouting();
  }

  /* ─── Slot Control ─── */

  /** Set an effect type for a slot, disposing old and creating new. */
  setSlotFXType(bankId: FXBankId, slotIdx: number, fxType: string): void {
    if (!isValidEffectType(fxType)) {
      console.warn(`[EffectsChain] Invalid FX type: ${fxType}`);
      return;
    }

    this._state.banks[bankId].slots[slotIdx].fxType = fxType;
    this._state.banks[bankId].slots[slotIdx].params = {};

    // Rebuild the affected bank
    this.rebuildBank(bankId);
  }

  /** Toggle a slot on/off. */
  setSlotSw(bankId: FXBankId, slotIdx: number, sw: boolean): void {
    this._state.banks[bankId].slots[slotIdx].sw = sw;
    this.rebuildBank(bankId);
  }

  toggleSlotSw(bankId: FXBankId, slotIdx: number): void {
    this.setSlotSw(bankId, slotIdx, !this._state.banks[bankId].slots[slotIdx].sw);
  }

  /** Set slot switch mode (TOGGLE/MOMENT). */
  setSlotSwMode(bankId: FXBankId, slotIdx: number, mode: FXSwMode): void {
    this._state.banks[bankId].slots[slotIdx].swMode = mode;
  }

  /** Set slot insert target. */
  setSlotInsert(bankId: FXBankId, slotIdx: number, insert: FXInsertTarget): void {
    this._state.banks[bankId].slots[slotIdx].insert = insert;
  }

  /** Set a parameter on a slot's effect. */
  setSlotParam(bankId: FXBankId, slotIdx: number, paramName: string, value: number): void {
    this._state.banks[bankId].slots[slotIdx].params[paramName] = value;

    const effect = this.effects[bankId][slotIdx];
    if (effect) {
      effect.setParam(paramName, value);
      // Selecting an external (track) carrier requires re-wiring the source node.
      if (paramName === 'carrier') {
        this.applyCarrier(effect);
      }
    }
  }

  /**
   * Wire (or unwire) an external carrier source for a carrier-capable effect,
   * based on its current `carrier` param. Values ≥ 3 select TRACK 1–5; lower
   * values use the effect's internal oscillator.
   */
  private applyCarrier(effect: BaseEffect): void {
    if (!isCarrierCapable(effect)) return;

    const val = effect.getParam('carrier');
    const trackId = val >= 3 ? Math.round(val) - 3 : null;

    effect.setExternalCarrier(trackId !== null);

    const next = (trackId !== null && this.carrierResolver)
      ? this.carrierResolver(trackId)
      : null;
    const prev = effect.carrierSrc;

    if (prev && prev !== next) {
      try { prev.disconnect(effect.carrierInput); } catch { /* ok */ }
    }
    if (next && next !== prev) {
      try { next.connect(effect.carrierInput); } catch { /* ok */ }
    }
    effect.carrierSrc = next;
  }

  /** Disconnect any external carrier source feeding an effect (before disposal). */
  private clearCarrier(effect: BaseEffect): void {
    if (!isCarrierCapable(effect)) return;
    if (effect.carrierSrc) {
      try { effect.carrierSrc.disconnect(effect.carrierInput); } catch { /* ok */ }
      effect.carrierSrc = null;
    }
  }

  /** Get current parameter value from a slot. */
  getSlotParam(bankId: FXBankId, slotIdx: number, paramName: string): number {
    return this.effects[bankId][slotIdx]?.getParam(paramName) ?? 0;
  }

  /** Get the live effect instance in a slot (for FX Sequence modulation). */
  getSlotEffect(bankId: FXBankId, slotIdx: number): BaseEffect | null {
    return this.effects[bankId][slotIdx];
  }

  /**
   * Get the [min, max] range of a slot's parameter (from its effect definition).
   * Used by the FX Sequencer to map its 0–100 step values onto params that use a
   * different range (e.g. Robot NOTE 0–11), so a sequence can play a melody.
   */
  getSlotParamRange(bankId: FXBankId, slotIdx: number, paramName: string): { min: number; max: number } | null {
    const fxType = this._state.banks[bankId].slots[slotIdx].fxType;
    const def = getEffectTypeDef(fxType);
    const param = def?.params.find(p => p.name === paramName);
    return param ? { min: param.min, max: param.max } : null;
  }

  /* ─── Internal Routing ─── */

  /** Rebuild all banks' effect graphs. */
  private rebuildAll(): void {
    for (const bankId of FX_BANK_IDS) {
      this.rebuildBank(bankId);
    }
    this.updateRouting();
  }

  /**
   * Rebuild a single bank's effect slot chain.
   *
   * Effects are RECONCILED, not recreated wholesale. An effect instance is only
   * disposed/created when its slot is turned off/on or its FX type changes.
   * Effects whose type is unchanged are kept alive and simply re-threaded.
   *
   * Why this matters (Goal 1 fix): recreating an effect resets its internal DSP
   * state. For convolver reverbs this means a fresh, empty impulse response that
   * has to "bloom" from silence over the reverb time (~1–2 s); for swell/envelope
   * effects it re-triggers the ramp. When ALL effects in a bank were recreated on
   * every slot toggle, unrelated effects (e.g. an active reverb) would audibly
   * drop back to the dry/original sound and slowly build up again. Reusing the
   * live instances preserves convolver tails, delay lines and envelopes, so
   * toggling one effect no longer disturbs its neighbours.
   */
  private rebuildBank(bankId: FXBankId): void {
    const bank = this._state.banks[bankId];

    // ── Reconcile effect instances with desired slot state (reuse where possible) ──
    for (let i = 0; i < 4; i++) {
      const slot = bank.slots[i];
      const want = slot.sw && isValidEffectType(slot.fxType);
      const current = this.effects[bankId][i];

      if (!want) {
        // Slot is off (or invalid) — tear down any existing effect.
        if (current) {
          this.clearCarrier(current);
          current.dispose();
          this.effects[bankId][i] = null;
        }
        continue;
      }

      // Slot wants an effect of type slot.fxType.
      if (current && current.type === slot.fxType) {
        // Same type already live — keep it (preserves internal state).
        continue;
      }

      // Need a fresh instance (empty slot, or the type changed).
      if (current) {
        this.clearCarrier(current);
        current.dispose();
        this.effects[bankId][i] = null;
      }
      const effect = createEffect(slot.fxType, this.ctx);
      if (effect) {
        // Restore saved params onto the new instance.
        for (const [name, value] of Object.entries(slot.params)) {
          effect.setParam(name, value);
        }
        this.effects[bankId][i] = effect;
      }
    }

    // (Re)establish external carrier wiring for any carrier-capable effects.
    for (let i = 0; i < 4; i++) {
      const effect = this.effects[bankId][i];
      if (effect) this.applyCarrier(effect);
    }

    this.rewireBank(bankId);
  }

  /**
   * Re-thread a bank's internal signal path from its (already reconciled) live
   * effect instances: bankInput → slot → … → bankOutput. Reused effects keep
   * their DSP state across the disconnect/reconnect (only routing edges change).
   */
  private rewireBank(bankId: FXBankId): void {
    const activeEffects: BaseEffect[] = [];
    for (let i = 0; i < 4; i++) {
      const effect = this.effects[bankId][i];
      if (effect) activeEffects.push(effect);
    }

    // Sever every routing edge inside the bank, then rebuild it. Edges feeding an
    // effect's input come only from bankInput or another effect's output, so
    // disconnecting those outputs clears all internal wiring cleanly.
    try { this.bankInputs[bankId].disconnect(); } catch { /* ok */ }
    for (const effect of activeEffects) {
      try { effect.outputNode.disconnect(); } catch { /* ok */ }
    }

    if (activeEffects.length === 0) {
      // No active slots — bypass within this bank.
      this.bankInputs[bankId].connect(this.bankOutputs[bankId]);
      return;
    }

    // Chain: bankInput → slot1 → slot2 → … → bankOutput
    let prevNode: AudioNode = this.bankInputs[bankId];
    for (const effect of activeEffects) {
      prevNode.connect(effect.inputNode);
      prevNode = effect.outputNode;
    }
    prevNode.connect(this.bankOutputs[bankId]);
  }

  /** Update which banks route signal based on mode and sw state. */
  private updateRouting(): void {
    const activeState = this._state;

    // Determine which banks should pass signal
    let anyBankActive = false;

    for (const bankId of FX_BANK_IDS) {
      const bank = activeState.banks[bankId];
      let shouldBeActive = false;

      if (bank.sw) {
        if (bank.mode === 'MULTI') {
          // MULTI: active whenever sw is on
          shouldBeActive = true;
        } else {
          // SINGLE: only active when this is the selected bank
          shouldBeActive = (bankId === activeState.activeBank);
        }
      }

      this.bankOutputs[bankId].gain.setTargetAtTime(
        shouldBeActive ? 1 : 0,
        this.ctx.currentTime,
        0.005
      );

      if (shouldBeActive) anyBankActive = true;
    }

    // If no bank is active, enable bypass; otherwise, mute bypass
    this.bypassNode.gain.setTargetAtTime(
      anyBankActive ? 0 : 1,
      this.ctx.currentTime,
      0.005
    );
  }

  /* ─── Full State Load/Save ─── */

  /** Load a complete chain state (e.g. from memory recall). */
  loadState(state: FXChainState): void {
    this._state = JSON.parse(JSON.stringify(state));
    this.rebuildAll();
  }

  /** Export the current state for persistence. */
  exportState(): FXChainState {
    // Sync live param values back to state
    for (const bankId of FX_BANK_IDS) {
      for (let i = 0; i < 4; i++) {
        const effect = this.effects[bankId][i];
        if (effect) {
          this._state.banks[bankId].slots[i].params = effect.getAllParams();
        }
      }
    }
    return JSON.parse(JSON.stringify(this._state));
  }

  /* ─── Cleanup ─── */

  /** Dispose all effects and nodes. */
  dispose(): void {
    for (const bankId of FX_BANK_IDS) {
      for (let i = 0; i < 4; i++) {
        if (this.effects[bankId][i]) {
          this.clearCarrier(this.effects[bankId][i]!);
          this.effects[bankId][i]!.dispose();
          this.effects[bankId][i] = null;
        }
      }
      try { this.bankInputs[bankId].disconnect(); } catch { /* ok */ }
      try { this.bankOutputs[bankId].disconnect(); } catch { /* ok */ }
    }
    try { this.inputNode.disconnect(); } catch { /* ok */ }
    try { this.outputNode.disconnect(); } catch { /* ok */ }
    try { this.bypassNode.disconnect(); } catch { /* ok */ }
  }
}
