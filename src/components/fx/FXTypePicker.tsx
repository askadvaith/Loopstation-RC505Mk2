/**
 * FXTypePicker — Modal/dropdown for selecting an effect type.
 *
 * Groups effects by category and shows a searchable list.
 * Track-only effects (Beat effects) are hidden when context is 'input'.
 */

import { useState, useMemo } from 'react';
import { getAvailableEffectTypes } from '../../audio/effects';
import type { EffectCategory, EffectTypeDef } from '../../audio/effects';

const CATEGORY_LABELS: Record<EffectCategory, string> = {
  filter: 'FILTER',
  modulation: 'MODULATION',
  pitch: 'PITCH / VOICE',
  guitar: 'GUITAR / AMP',
  dynamics: 'DYNAMICS',
  spatial: 'SPATIAL',
  slicer: 'SLICER',
  delay: 'DELAY',
  character: 'CHARACTER',
  reverb: 'REVERB',
  beat: 'BEAT',
};

const CATEGORY_ORDER: EffectCategory[] = [
  'filter', 'modulation', 'delay', 'reverb', 'dynamics', 'guitar',
  'pitch', 'character', 'spatial', 'slicer', 'beat',
];

interface FXTypePickerProps {
  isTrackFX: boolean;
  currentType: string;
  onSelect: (type: string) => void;
  onClose: () => void;
}

export function FXTypePicker({ isTrackFX, currentType, onSelect, onClose }: FXTypePickerProps) {
  const [search, setSearch] = useState('');

  const effects = useMemo(() => getAvailableEffectTypes(isTrackFX), [isTrackFX]);

  const grouped = useMemo(() => {
    const map = new Map<EffectCategory, EffectTypeDef[]>();
    const q = search.toLowerCase().trim();

    for (const effect of effects) {
      if (q && !effect.label.toLowerCase().includes(q) && !effect.type.toLowerCase().includes(q)) {
        continue;
      }
      if (!map.has(effect.category)) {
        map.set(effect.category, []);
      }
      map.get(effect.category)!.push(effect);
    }
    return map;
  }, [effects, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700/60 rounded-xl w-80 max-h-[70vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/40">
          <span className="text-[11px] font-bold tracking-[0.15em] text-zinc-300">SELECT FX TYPE</span>
          <button
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none cursor-pointer"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-zinc-800/60">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search effects..."
            className="w-full px-2 py-1 bg-zinc-800/60 border border-zinc-700/40 rounded text-[11px] text-zinc-300 placeholder-zinc-600 outline-none focus:border-[var(--led-blue)]/50"
            autoFocus
          />
        </div>

        {/* Effect list */}
        <div className="flex-1 overflow-y-auto py-1">
          {CATEGORY_ORDER.filter(c => grouped.has(c)).map((cat) => (
            <div key={cat} className="mb-1">
              <div className="px-3 py-1 text-[8px] font-bold tracking-[0.2em] text-zinc-600 uppercase">
                {CATEGORY_LABELS[cat]}
              </div>
              {grouped.get(cat)!.map((effect) => (
                <button
                  key={effect.type}
                  className={`
                    w-full px-4 py-1.5 text-left text-[11px] cursor-pointer
                    transition-colors flex items-center justify-between
                    ${effect.type === currentType
                      ? 'bg-[var(--led-blue)]/15 text-[var(--led-blue)]'
                      : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                    }
                  `}
                  onClick={() => {
                    onSelect(effect.type);
                    onClose();
                  }}
                >
                  <span>{effect.label}</span>
                  {effect.trackOnly && (
                    <span className="text-[7px] px-1 py-0.5 bg-zinc-800 text-zinc-500 rounded">TRK</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
