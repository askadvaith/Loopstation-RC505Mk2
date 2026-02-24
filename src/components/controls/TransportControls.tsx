/**
 * TransportControls — Hardware-faithful transport section.
 *
 * Includes:
 * - ALL START/STOP (large illuminated button)
 * - UNDO / REDO buttons
 * - TAP TEMPO button with visual feedback
 * - ALL CLEAR
 * - Memory navigation (◄ ►)
 */

import { useCallback, useRef, useState } from 'react';
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
  const currentMemory = useTransportStore((s) => s.currentMemory);
  const setCurrentMemory = useTransportStore((s) => s.setCurrentMemory);
  const currentTrack = useTrackStore((s) => s.currentTrack);
  const trackState = useTrackStore((s) => s.tracks[s.currentTrack]);
  const tracks = useTrackStore((s) => s.tracks);

  // Check if any track is active
  const anyActive = tracks.some(
    (t) => t.state === 'playing' || t.state === 'recording' || t.state === 'overdubbing'
  );

  /* ── Tap Tempo ── */
  const tapTimesRef = useRef<number[]>([]);
  const [tapFlash, setTapFlash] = useState(false);

  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    taps.push(now);

    // Visual feedback
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 100);

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
    <div className="flex flex-col gap-3 h-full">
      {/* ── ALL START/STOP ── */}
      <button
        className={`transport-btn-main relative py-4 text-xs font-bold tracking-[0.15em] transition-all ${
          anyActive
            ? 'bg-green-600/20 text-green-400 ring-1 ring-green-500/40'
            : 'text-zinc-300'
        }`}
        onClick={onAllStartStop}
        title="All Start/Stop [Space]"
      >
        <div className="flex items-center justify-center gap-2">
          {anyActive ? (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect width="10" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10">
              <polygon points="1,0 10,5 1,10" fill="currentColor" />
            </svg>
          )}
          <span>ALL {anyActive ? 'STOP' : 'START'}</span>
        </div>
        {/* LED */}
        <div
          className={`absolute top-2 right-2 w-2 h-2 rounded-full transition-colors ${
            anyActive ? 'bg-green-400 led-glow-green' : 'bg-zinc-700'
          }`}
        />
      </button>

      {/* ── UNDO / REDO ── */}
      <div className="flex gap-2">
        <button
          className={`hw-button flex-1 py-2.5 text-[10px] font-bold tracking-wider flex items-center justify-center gap-1 ${
            trackState.hasUndo
              ? 'text-[var(--lcd-text)] hover:bg-sky-900/20'
              : 'text-zinc-600 cursor-not-allowed'
          }`}
          onClick={() => onUndo(currentTrack)}
          disabled={!trackState.hasUndo}
          title="Undo [Z]"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M4 1L1 4.5L4 8V6C6.5 6 8 6.5 9 9C9 5.5 7 3.5 4 3.5V1Z" />
          </svg>
          UNDO
        </button>
        <button
          className={`hw-button flex-1 py-2.5 text-[10px] font-bold tracking-wider flex items-center justify-center gap-1 ${
            trackState.hasRedo
              ? 'text-[var(--lcd-text)] hover:bg-sky-900/20'
              : 'text-zinc-600 cursor-not-allowed'
          }`}
          onClick={() => onRedo(currentTrack)}
          disabled={!trackState.hasRedo}
          title="Redo [X]"
        >
          REDO
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M6 1L9 4.5L6 8V6C3.5 6 2 6.5 1 9C1 5.5 3 3.5 6 3.5V1Z" />
          </svg>
        </button>
      </div>

      {/* ── TAP TEMPO ── */}
      <button
        className={`hw-button py-3 text-[11px] font-bold tracking-[0.15em] transition-all ${
          tapFlash ? 'bg-[var(--lcd-text)]/10 text-[var(--lcd-text)]' : 'text-zinc-400'
        }`}
        onClick={handleTapTempo}
        title="Tap Tempo"
      >
        TAP TEMPO
      </button>

      {/* ── Tempo Display ── */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[9px] font-bold tracking-wider text-zinc-600">BPM</span>
        <div className="flex-1 h-[3px] bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--lcd-text)]/40 rounded-full"
            style={{ width: `${((tempo - 40) / 260) * 100}%` }}
          />
        </div>
        <span className="text-[11px] font-mono font-bold text-[var(--lcd-text)] tabular-nums">
          {tempo.toFixed(1)}
        </span>
      </div>

      {/* ── Memory Navigation ── */}
      <div className="flex items-center gap-1 mt-auto">
        <button
          className="hw-button px-2 py-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300"
          onClick={() => setCurrentMemory(currentMemory - 1)}
          title="Previous memory"
        >
          ◄
        </button>
        <div className="flex-1 text-center">
          <span className="text-[9px] text-zinc-600 font-bold tracking-wider">MEMORY</span>
          <div className="text-sm font-bold font-mono text-[var(--lcd-text)]">
            {String(currentMemory).padStart(2, '0')}
          </div>
        </div>
        <button
          className="hw-button px-2 py-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300"
          onClick={() => setCurrentMemory(currentMemory + 1)}
          title="Next memory"
        >
          ►
        </button>
      </div>

      {/* ── ALL CLEAR ── */}
      <button
        className="hw-button py-2 text-[9px] font-bold text-zinc-600 hover:text-red-400 tracking-[0.15em] transition-colors"
        onClick={onAllClear}
        title="Clear all tracks [Shift+Backspace]"
      >
        ALL CLEAR
      </button>
    </div>
  );
}
