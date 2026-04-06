/**
 * FXSection — FX bank selector + slot overview for Input FX or Track FX.
 *
 * Displays 4 bank buttons (A–D) with active/on indicators, and
 * shows the 4 slot assignments for the currently active bank.
 *
 * Props control whether this is for Input FX or Track FX.
 */

import { useMemo } from 'react';
import { useFXStore, type FXChainUI } from '../../store/useFXStore';
import type { FXBankId } from '../../audio/effects';
import { FX_BANK_IDS } from '../../audio/effects';

interface FXSectionProps {
  context: 'input' | 'track';
  /** For track FX, the track index (0–4) */
  trackIdx?: number;
  /** Callbacks to the audio engine */
  onBankSelect: (bankId: FXBankId) => void;
  onBankToggle: (bankId: FXBankId) => void;
  onSlotClick: (bankId: FXBankId, slotIdx: number) => void;
}

export function FXSection({ context, trackIdx = 0, onBankSelect, onBankToggle, onSlotClick }: FXSectionProps) {
  const chain: FXChainUI = useFXStore((s) =>
    context === 'input' ? s.inputFX : s.trackFX[trackIdx]
  );

  const activeBank = chain.activeBank;
  const activeBankState = chain.banks[activeBank];

  const title = context === 'input' ? 'INPUT FX' : 'TRACK FX';

  const bankStates = useMemo(() => {
    return FX_BANK_IDS.map((id) => ({
      id,
      sw: chain.banks[id].sw,
      isActive: id === activeBank,
    }));
  }, [chain, activeBank]);

  return (
    <div className="flex flex-col items-center gap-1.5 w-full">
      {/* Title */}
      <span className="text-[9px] font-bold tracking-[0.2em] text-zinc-500">{title}</span>

      {/* Bank buttons */}
      <div className="flex gap-1">
        {bankStates.map(({ id, sw, isActive }) => (
          <button
            key={id}
            className={`
              w-7 h-5.5 rounded text-[9px] font-bold flex items-center justify-center
              border transition-all duration-100 cursor-pointer select-none
              ${isActive && sw
                ? 'bg-[var(--led-green)]/20 text-[var(--led-green)] border-[var(--led-green)]/50 shadow-[0_0_6px_var(--led-green)]'
                : isActive && !sw
                  ? 'bg-zinc-700/40 text-zinc-300 border-zinc-500/60'
                  : sw
                    ? 'bg-[var(--led-green)]/10 text-[var(--led-green)]/60 border-[var(--led-green)]/30'
                    : 'bg-zinc-800/60 text-zinc-600 border-zinc-700/50 hover:text-zinc-400 hover:border-zinc-600/50'
              }
            `}
            onClick={() => onBankSelect(id)}
            onDoubleClick={() => onBankToggle(id)}
            title={`Bank ${id}${sw ? ' (ON)' : ' (OFF)'} — click to select · double-click to toggle on/off`}
          >
            {id}
          </button>
        ))}
      </div>

      {/* Active bank: SW indicator + slot list */}
      <div className="flex flex-col gap-0.5 w-full px-1">
        {/* Bank on/off status hint */}
        <div className="flex items-center justify-between px-1 mb-0.5">
          <span className="text-[7px] text-zinc-700 font-mono">BANK {activeBank}</span>
          <span className={`text-[7px] font-bold ${activeBankState.sw ? 'text-[var(--led-green)]' : 'text-zinc-700'}`}>
            {activeBankState.sw ? 'ON' : 'OFF'}
          </span>
        </div>

        {activeBankState.slots.map((slot, i) => (
          <button
            key={i}
            className={`
              flex items-center justify-between px-1.5 py-0.5 rounded text-[8px]
              border cursor-pointer transition-all duration-100
              ${slot.sw
                ? 'bg-zinc-700/30 text-zinc-300 border-zinc-600/40'
                : 'bg-zinc-800/40 text-zinc-600 border-zinc-800/60'
              }
              hover:bg-zinc-700/40 hover:text-zinc-300
            `}
            onClick={() => onSlotClick(activeBank, i)}
            title={`Click to edit Slot ${i + 1}: ${slot.fxLabel || slot.fxType}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${slot.sw ? 'bg-[var(--led-green)]' : 'bg-zinc-700'}`} />
            <span className="flex-1 text-left ml-1 truncate font-medium">
              {slot.fxLabel || slot.fxType || '—'}
            </span>
            <span className="text-[7px] text-zinc-600 ml-1">
              {i + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
