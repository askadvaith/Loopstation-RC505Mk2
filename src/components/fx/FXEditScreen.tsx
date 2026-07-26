/**
 * FXEditScreen — Full parameter editor shown in the Display area
 * when an FX slot is selected for editing.
 *
 * Shows the effect name, on/off toggle, type selector button,
 * and all parameter knobs for the current effect.
 */

import { useState, useMemo, useCallback } from 'react';
import { useFXStore, type FXEditTarget } from '../../store/useFXStore';
import { getEffectTypeDef, getEffectLabel } from '../../audio/effects';
import type { EffectParamDef, FXBankId } from '../../audio/effects';
import { Knob } from '../controls/Knob';
import { FXTypePicker } from './FXTypePicker';

/** Human-readable value for a parameter: choice label, or number + unit. */
function formatParamValue(def: EffectParamDef, value: number): string {
  if (def.choices && def.choices.length > 0) {
    return def.choices[Math.round(value)] ?? '?';
  }
  return `${Math.round(value)}${def.unit ? ` ${def.unit}` : ''}`;
}

interface FXEditScreenProps {
  editTarget: NonNullable<FXEditTarget>;
  /** Callbacks to the audio engine */
  onSetFXType: (context: 'input' | 'track', trackIdx: number, bankId: FXBankId, slotIdx: number, fxType: string) => void;
  onSetSlotSw: (context: 'input' | 'track', trackIdx: number, bankId: FXBankId, slotIdx: number, sw: boolean) => void;
  onSetSlotParam: (context: 'input' | 'track', trackIdx: number, bankId: FXBankId, slotIdx: number, paramName: string, value: number) => void;
  onClose: () => void;
}

export function FXEditScreen({ editTarget, onSetFXType, onSetSlotSw, onSetSlotParam, onClose }: FXEditScreenProps) {
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const isTrackFX = editTarget.context === 'track';
  const trackIdx = isTrackFX ? (editTarget as { trackIdx: number }).trackIdx : 0;
  const { bankId, slotIdx } = editTarget;

  // Get the slot state from store
  const slot = useFXStore((s) => {
    const chain = isTrackFX ? s.trackFX[trackIdx] : s.inputFX;
    return chain.banks[bankId].slots[slotIdx];
  });

  // Real-time editor cursor (moved by ← →, driven live from the keyboard).
  const focusedParamIdx = useFXStore((s) => s.focusedParamIdx);
  const setFocusedParamIdx = useFXStore((s) => s.setFocusedParamIdx);

  // Get effect param definitions
  const paramDefs = useMemo(() => {
    const def = getEffectTypeDef(slot.fxType);
    return def?.params ?? [];
  }, [slot.fxType]);

  const fxLabel = useMemo(() => getEffectLabel(slot.fxType), [slot.fxType]);

  // The parameter the cursor is on (clamped in case the effect type changed).
  const safeFocusIdx = Math.min(focusedParamIdx, Math.max(0, paramDefs.length - 1));
  const focusedDef = paramDefs[safeFocusIdx];
  const focusedValue = focusedDef ? (slot.params[focusedDef.name] ?? focusedDef.default) : 0;

  const handleParamChange = useCallback((paramName: string, value: number) => {
    onSetSlotParam(editTarget.context, trackIdx, bankId, slotIdx, paramName, value);
  }, [editTarget.context, trackIdx, bankId, slotIdx, onSetSlotParam]);

  const handleTypeSelect = useCallback((fxType: string) => {
    onSetFXType(editTarget.context, trackIdx, bankId, slotIdx, fxType);
  }, [editTarget.context, trackIdx, bankId, slotIdx, onSetFXType]);

  const handleSwToggle = useCallback(() => {
    onSetSlotSw(editTarget.context, trackIdx, bankId, slotIdx, !slot.sw);
  }, [editTarget.context, trackIdx, bankId, slotIdx, slot.sw, onSetSlotSw]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700/30">
        <button
          className="text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
          onClick={onClose}
        >
          ← Back
        </button>
        <span className="text-[10px] font-bold tracking-[0.1em] text-zinc-400">
          {isTrackFX ? `TRK ${trackIdx + 1}` : 'INPUT'} / BANK {bankId} / SLOT {slotIdx + 1}
        </span>
        <div className="w-10" /> {/* spacer */}
      </div>

      {/* Effect name + controls */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* SW toggle */}
        <button
          className={`
            w-8 h-5 rounded-full cursor-pointer transition-all duration-200
            ${slot.sw
              ? 'bg-[var(--led-green)] shadow-[0_0_8px_var(--led-green)]'
              : 'bg-zinc-700'
            }
          `}
          onClick={handleSwToggle}
          title="Toggle effect on/off"
        >
          <div className={`
            w-3.5 h-3.5 rounded-full bg-white shadow-md transition-transform duration-200
            ${slot.sw ? 'translate-x-3.5 ml-0.5' : 'translate-x-0.5'}
          `} />
        </button>

        {/* FX Type button */}
        <button
          className="flex-1 text-left px-2 py-1 bg-zinc-800/60 border border-zinc-700/50 rounded text-[11px] text-zinc-300 hover:bg-zinc-700/40 hover:border-zinc-600/50 cursor-pointer transition-colors truncate"
          onClick={() => setTypePickerOpen(true)}
          title="Click to change effect type"
        >
          {fxLabel}
        </button>
      </div>

      {/* Focused-parameter readout — the RC-505 CURSOR + VALUE target.
          ← → move between parameters, ↑ ↓ change this value (hold to sweep). */}
      {focusedDef && (
        <div className="mx-3 mb-1 px-3 py-1.5 rounded bg-zinc-800/70 border border-[var(--led-amber)]/40 flex items-center justify-between gap-2">
          <span className="text-[10px] tracking-[0.15em] text-zinc-400 truncate">
            {focusedDef.label}
            {focusedDef.sequenceable && <span className="text-[var(--led-amber)] ml-0.5">★</span>}
          </span>
          <span className="text-[15px] font-mono font-bold text-[var(--led-amber)] leading-none">
            {formatParamValue(focusedDef, focusedValue)}
          </span>
          <span className="text-[8px] text-zinc-600 tracking-wide whitespace-nowrap">← → · ↑ ↓</span>
        </div>
      )}

      {/* Parameters */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {paramDefs.length === 0 ? (
          <div className="text-[10px] text-zinc-600 text-center py-4">
            No parameters available
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {paramDefs.map((def, idx) => {
              const currentValue = slot.params[def.name] ?? def.default;
              const isFocused = idx === safeFocusIdx;

              if (def.choices && def.choices.length > 0) {
                // Choice-based parameter: show as button cycle
                const choiceIdx = Math.round(currentValue);
                return (
                  <div
                  key={def.name}
                  onClick={() => setFocusedParamIdx(idx)}
                  className={`flex flex-col items-center gap-0.5 rounded p-0.5 cursor-pointer transition-colors ${
                    isFocused
                      ? 'bg-[var(--led-amber)]/10 ring-1 ring-[var(--led-amber)]/50'
                      : 'hover:bg-zinc-800/40'
                  }`}
                >
                    <button
                      className="w-full px-1 py-1 bg-zinc-800/60 border border-zinc-700/40 rounded text-[9px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40 cursor-pointer transition-colors text-center"
                      onClick={() => {
                        const next = (choiceIdx + 1) % def.choices!.length;
                        handleParamChange(def.name, next);
                      }}
                      title={`${def.label}: ${def.choices[choiceIdx] ?? '?'}`}
                    >
                      {def.choices[choiceIdx] ?? '?'}
                    </button>
                    <span className="text-[7px] text-zinc-600 truncate w-full text-center">
                      {def.label}
                      {def.sequenceable && <span className="text-[var(--led-amber)] ml-0.5">★</span>}
                    </span>
                  </div>
                );
              }

              // Numeric parameter: show as knob
              return (
                <div
                  key={def.name}
                  onClick={() => setFocusedParamIdx(idx)}
                  className={`flex flex-col items-center gap-0.5 rounded p-0.5 cursor-pointer transition-colors ${
                    isFocused
                      ? 'bg-[var(--led-amber)]/10 ring-1 ring-[var(--led-amber)]/50'
                      : 'hover:bg-zinc-800/40'
                  }`}
                >
                  <Knob
                    value={currentValue}
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    size={28}
                    onChange={(v) => handleParamChange(def.name, v)}
                  />
                  <span className="text-[7px] text-zinc-600 truncate w-full text-center leading-tight">
                    {def.label}
                    {def.sequenceable && <span className="text-[var(--led-amber)] ml-0.5">★</span>}
                  </span>
                  <span className="text-[8px] text-zinc-500 font-mono">
                    {Math.round(currentValue)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Type picker modal */}
      {typePickerOpen && (
        <FXTypePicker
          isTrackFX={isTrackFX}
          currentType={slot.fxType}
          onSelect={handleTypeSelect}
          onClose={() => setTypePickerOpen(false)}
        />
      )}
    </div>
  );
}
