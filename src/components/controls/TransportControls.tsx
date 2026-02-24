/**
 * TransportControls — ALL START/STOP, UNDO/REDO, TAP TEMPO, and global controls.
 */

import { useCallback, useRef } from 'react';
import { useTransportStore } from '../../store/useTransportStore';
import { useTrackStore } from '../../store/useTrackStore';

interface TransportControlsProps {
  onAllStartStop: () => void;
  onAllClear: () => void;
  onUndo: (idx: number) => void;
  onRedo: (idx: number) => void;
}

export function TransportControls({
  onAllStartStop,
  onAllClear,
  onUndo,
  onRedo,
}: TransportControlsProps) {
  const tempo = useTransportStore((s) => s.tempo);
  const setTempo = useTransportStore((s) => s.setTempo);
  const currentTrack = useTrackStore((s) => s.currentTrack);
  const trackState = useTrackStore((s) => s.tracks[s.currentTrack]);

  /* ── Tap Tempo ── */
  const tapTimesRef = useRef<number[]>([]);

  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    taps.push(now);

    // Keep only taps within the last 3 seconds
    while (taps.length > 1 && now - taps[0] > 3000) {
      taps.shift();
    }

    if (taps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < taps.length; i++) {
        intervals.push(taps[i] - taps[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = 60000 / avgInterval;
      setTempo(Math.round(bpm * 10) / 10);
    }
  }, [setTempo]);

  return (
    <div className="flex flex-col gap-3">
      {/* ALL START/STOP */}
      <button
        className="hw-button px-6 py-3 text-sm font-bold tracking-wider bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900"
        onClick={onAllStartStop}
      >
        ALL START/STOP
      </button>

      {/* Undo / Redo for current track */}
      <div className="flex gap-2">
        <button
          className={`hw-button flex-1 py-2 text-xs font-bold ${
            trackState.hasUndo ? 'text-sky-400' : 'text-zinc-600'
          }`}
          onClick={() => onUndo(currentTrack)}
          disabled={!trackState.hasUndo}
        >
          UNDO
        </button>
        <button
          className={`hw-button flex-1 py-2 text-xs font-bold ${
            trackState.hasRedo ? 'text-sky-400' : 'text-zinc-600'
          }`}
          onClick={() => onRedo(currentTrack)}
          disabled={!trackState.hasRedo}
        >
          REDO
        </button>
      </div>

      {/* Tap Tempo */}
      <button
        className="hw-button px-4 py-3 text-sm font-bold tracking-wider"
        onClick={handleTapTempo}
      >
        TAP TEMPO
      </button>

      {/* Tempo fine-tune */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-zinc-500 w-8">BPM</span>
        <input
          type="range"
          min="40"
          max="300"
          step="0.5"
          value={tempo}
          onChange={(e) => setTempo(Number(e.target.value))}
          className="flex-1 accent-sky-400"
        />
        <span className="text-xs font-mono text-zinc-300 w-12 text-right">
          {tempo.toFixed(1)}
        </span>
      </div>

      {/* ALL CLEAR */}
      <button
        className="hw-button px-4 py-2 text-[10px] font-bold text-zinc-500 hover:text-red-400 tracking-wider"
        onClick={onAllClear}
      >
        ALL CLEAR
      </button>
    </div>
  );
}
