/**
 * TrackEditScreen — Shows detailed settings for the currently selected track.
 * Accessible by pressing TRACK button on the hardware.
 */

import { useTrackStore } from '../../../store/useTrackStore';

export function TrackEditScreen() {
  const currentTrack = useTrackStore((s) => s.currentTrack);
  const track = useTrackStore((s) => s.tracks[s.currentTrack]);

  const params = [
    { label: 'VOLUME', value: `${Math.round(track.volume * 100)}` },
    { label: 'PAN', value: track.pan === 0 ? 'CENTER' : track.pan < 0 ? `L${Math.round(Math.abs(track.pan) * 50)}` : `R${Math.round(track.pan * 50)}` },
    { label: 'STATE', value: track.state.toUpperCase() },
    { label: 'PHRASE', value: track.hasPhrase ? 'YES' : 'NO' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-500 font-bold tracking-wider">
          TRACK {currentTrack + 1} EDIT
        </span>
        <span className="text-[10px] text-[var(--lcd-text)]">
          {track.state.toUpperCase()}
        </span>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 content-start">
        {params.map((p) => (
          <div key={p.label} className="flex justify-between items-center">
            <span className="text-[9px] text-zinc-500 font-bold">{p.label}</span>
            <span className="text-[10px] text-[var(--lcd-text)] font-mono">{p.value}</span>
          </div>
        ))}
      </div>

      <div className="text-[8px] text-zinc-600 text-center mt-auto">
        Use [1]–[4] knobs to edit parameters
      </div>
    </div>
  );
}
