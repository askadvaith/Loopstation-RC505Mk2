/**
 * useFXStore — Zustand store for FX UI state.
 *
 * Mirrors the EffectsChain instances' state for React rendering.
 * Manages both input FX and per-track FX chains.
 */

import { create } from 'zustand';
import type {
  FXBankId,
  FXBankMode,
  FXSwMode,
  FXInsertTarget,
  FXSlotState,
  FXBankState,
  FXChainState,
  FXSequenceState,
} from '../audio/effects';
import { createDefaultChainState, createDefaultSequenceState } from '../audio/effects';

/* ─── UI State Types ─── */

export interface FXSlotUI extends FXSlotState {
  /** Display label for the current FX type */
  fxLabel: string;
}

export interface FXBankUI extends Omit<FXBankState, 'slots'> {
  slots: [FXSlotUI, FXSlotUI, FXSlotUI, FXSlotUI];
}

export interface FXChainUI {
  activeBank: FXBankId;
  banks: Record<FXBankId, FXBankUI>;
}

/** Which FX section/edit screen is currently open */
export type FXEditTarget =
  | { context: 'input'; slotIdx: number; bankId: FXBankId }
  | { context: 'track'; trackIdx: number; slotIdx: number; bankId: FXBankId }
  | null;

/* ─── Store Interface ─── */

interface FXStoreState {
  /** Input FX chain state */
  inputFX: FXChainUI;

  /** Per-track FX chain state (5 tracks) */
  trackFX: FXChainUI[];

  /** Input FX sequence state */
  inputFXSeq: FXSequenceState;

  /** Per-track FX sequence state */
  trackFXSeq: FXSequenceState[];

  /** Currently selected edit target (null = no edit screen open) */
  editTarget: FXEditTarget;

  /** Whether the FX type picker modal is open */
  typePickerOpen: boolean;

  /* ── Actions ── */

  // Input FX
  setInputFXActiveBank: (bankId: FXBankId) => void;
  setInputFXBankSw: (bankId: FXBankId, sw: boolean) => void;
  setInputFXBankMode: (bankId: FXBankId, mode: FXBankMode) => void;
  updateInputFXSlot: (bankId: FXBankId, slotIdx: number, partial: Partial<FXSlotUI>) => void;
  setInputFXChain: (state: FXChainUI) => void;

  // Track FX
  setTrackFXActiveBank: (trackIdx: number, bankId: FXBankId) => void;
  setTrackFXBankSw: (trackIdx: number, bankId: FXBankId, sw: boolean) => void;
  setTrackFXBankMode: (trackIdx: number, bankId: FXBankId, mode: FXBankMode) => void;
  updateTrackFXSlot: (trackIdx: number, bankId: FXBankId, slotIdx: number, partial: Partial<FXSlotUI>) => void;
  setTrackFXChain: (trackIdx: number, state: FXChainUI) => void;

  // Sequence
  setInputFXSeq: (state: FXSequenceState) => void;
  setTrackFXSeq: (trackIdx: number, state: FXSequenceState) => void;

  // Edit screen
  setEditTarget: (target: FXEditTarget) => void;
  setTypePickerOpen: (open: boolean) => void;
}

/* ─── Helpers ─── */

function chainStateToUI(state: FXChainState): FXChainUI {
  const banks = {} as Record<FXBankId, FXBankUI>;
  for (const [bankId, bank] of Object.entries(state.banks) as [FXBankId, FXBankState][]) {
    banks[bankId] = {
      sw: bank.sw,
      mode: bank.mode,
      slots: bank.slots.map(slot => ({
        ...slot,
        fxLabel: slot.fxType,
      })) as [FXSlotUI, FXSlotUI, FXSlotUI, FXSlotUI],
    };
  }
  return { activeBank: state.activeBank, banks };
}

function createDefaultFXUI(): FXChainUI {
  return chainStateToUI(createDefaultChainState());
}

/* ─── Store ─── */

export const useFXStore = create<FXStoreState>((set) => ({
  inputFX: createDefaultFXUI(),
  trackFX: Array.from({ length: 5 }, createDefaultFXUI),
  inputFXSeq: createDefaultSequenceState(),
  trackFXSeq: Array.from({ length: 5 }, createDefaultSequenceState),
  editTarget: null,
  typePickerOpen: false,

  // ── Input FX Actions ──

  setInputFXActiveBank: (bankId) =>
    set((s) => ({
      inputFX: { ...s.inputFX, activeBank: bankId },
    })),

  setInputFXBankSw: (bankId, sw) =>
    set((s) => ({
      inputFX: {
        ...s.inputFX,
        banks: {
          ...s.inputFX.banks,
          [bankId]: { ...s.inputFX.banks[bankId], sw },
        },
      },
    })),

  setInputFXBankMode: (bankId, mode) =>
    set((s) => ({
      inputFX: {
        ...s.inputFX,
        banks: {
          ...s.inputFX.banks,
          [bankId]: { ...s.inputFX.banks[bankId], mode },
        },
      },
    })),

  updateInputFXSlot: (bankId, slotIdx, partial) =>
    set((s) => {
      const banks = { ...s.inputFX.banks };
      const bank = { ...banks[bankId] };
      const slots = [...bank.slots] as [FXSlotUI, FXSlotUI, FXSlotUI, FXSlotUI];
      slots[slotIdx] = { ...slots[slotIdx], ...partial };
      bank.slots = slots;
      banks[bankId] = bank;
      return { inputFX: { ...s.inputFX, banks } };
    }),

  setInputFXChain: (state) =>
    set({ inputFX: state }),

  // ── Track FX Actions ──

  setTrackFXActiveBank: (trackIdx, bankId) =>
    set((s) => {
      const trackFX = [...s.trackFX];
      trackFX[trackIdx] = { ...trackFX[trackIdx], activeBank: bankId };
      return { trackFX };
    }),

  setTrackFXBankSw: (trackIdx, bankId, sw) =>
    set((s) => {
      const trackFX = [...s.trackFX];
      const chain = { ...trackFX[trackIdx] };
      chain.banks = {
        ...chain.banks,
        [bankId]: { ...chain.banks[bankId], sw },
      };
      trackFX[trackIdx] = chain;
      return { trackFX };
    }),

  setTrackFXBankMode: (trackIdx, bankId, mode) =>
    set((s) => {
      const trackFX = [...s.trackFX];
      const chain = { ...trackFX[trackIdx] };
      chain.banks = {
        ...chain.banks,
        [bankId]: { ...chain.banks[bankId], mode },
      };
      trackFX[trackIdx] = chain;
      return { trackFX };
    }),

  updateTrackFXSlot: (trackIdx, bankId, slotIdx, partial) =>
    set((s) => {
      const trackFX = [...s.trackFX];
      const chain = { ...trackFX[trackIdx] };
      const banks = { ...chain.banks };
      const bank = { ...banks[bankId] };
      const slots = [...bank.slots] as [FXSlotUI, FXSlotUI, FXSlotUI, FXSlotUI];
      slots[slotIdx] = { ...slots[slotIdx], ...partial };
      bank.slots = slots;
      banks[bankId] = bank;
      chain.banks = banks;
      trackFX[trackIdx] = chain;
      return { trackFX };
    }),

  setTrackFXChain: (trackIdx, state) =>
    set((s) => {
      const trackFX = [...s.trackFX];
      trackFX[trackIdx] = state;
      return { trackFX };
    }),

  // ── Sequence Actions ──

  setInputFXSeq: (state) =>
    set({ inputFXSeq: state }),

  setTrackFXSeq: (trackIdx, state) =>
    set((s) => {
      const trackFXSeq = [...s.trackFXSeq];
      trackFXSeq[trackIdx] = state;
      return { trackFXSeq };
    }),

  // ── Edit Actions ──

  setEditTarget: (target) =>
    set({ editTarget: target }),

  setTypePickerOpen: (open) =>
    set({ typePickerOpen: open }),
}));
