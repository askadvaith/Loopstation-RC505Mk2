/**
 * TrackStrip — A single track column in the loopstation UI.
 *
 * Displays: track number, state LED, REC/PLAY button, STOP button,
 * volume slider, loop position indicator.
 */

import { useTrackStore } from '../../store/useTrackStore';

interface TrackStripProps {
  index: number;
  onToggle: (idx: number) => void;
  onStop: (idx: number) => void;
  onClear: (idx: number) => void;
  onVolumeChange: (idx: number, vol: number) => void;
}

const STATE_COLORS: Record<string, string> = {
  empty: 'bg-zinc-700',
  recording: 'bg-red-500 led-glow-red',
  playing: 'bg-green-500 led-glow-green',
  overdubbing: 'bg-yellow-500 led-glow-yellow',
  stopped: 'bg-zinc-500',
};

const STATE_LABELS: Record<string, string> = {
  empty: 'EMPTY',
  recording: 'REC',
  playing: 'PLAY',
  overdubbing: 'ODUB',
  stopped: 'STOP',
};

export function TrackStrip({
  index,
  onToggle,
  onStop,
  onClear,
  onVolumeChange,
}: TrackStripProps) {
  const track = useTrackStore((s) => s.tracks[index]);
  const currentTrack = useTrackStore((s) => s.currentTrack);
  const setCurrentTrack = useTrackStore((s) => s.setCurrentTrack);

  const isSelected = currentTrack === index;

  return (
    <div
      className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-colors ${
        isSelected
          ? 'bg-[var(--panel-surface)] ring-1 ring-[var(--led-blue)]'
          : 'bg-[var(--panel-surface)]/50'
      }`}
      onClick={() => setCurrentTrack(index)}
    >
      {/* Track Number */}
      <div className="text-xs font-bold tracking-widest text-zinc-400">
        TRACK {index + 1}
      </div>

      {/* State LED */}
      <div
        className={`w-4 h-4 rounded-full ${STATE_COLORS[track.state]} transition-all duration-150`}
      />

      {/* State label */}
      <div className="text-[10px] font-mono text-zinc-400 h-4">
        {STATE_LABELS[track.state]}
      </div>

      {/* Loop position bar */}
      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden relative">
        <div
          className="h-full bg-[var(--lcd-text)] transition-none"
          style={{
            width: `${(track.playbackPosition * 100).toFixed(1)}%`,
          }}
        />
      </div>

      {/* REC/PLAY button */}
      <button
        className={`hw-button w-14 h-14 rounded-full text-xs font-bold flex items-center justify-center ${
          track.state === 'recording'
            ? 'bg-red-600 text-white led-glow-red'
            : track.state === 'playing'
              ? 'bg-green-600 text-white led-glow-green'
              : track.state === 'overdubbing'
                ? 'bg-yellow-600 text-black led-glow-yellow'
                : ''
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(index);
        }}
        title="Record / Play / Overdub"
      >
        {track.state === 'empty' ? '●' : track.state === 'recording' ? '■' : '▶'}
      </button>

      {/* Stop button */}
      <button
        className="hw-button w-10 h-8 text-xs font-bold"
        onClick={(e) => {
          e.stopPropagation();
          onStop(index);
        }}
        title="Stop"
      >
        ■
      </button>

      {/* Clear button (long press in real device, click here) */}
      <button
        className="hw-button w-10 h-6 text-[9px] text-zinc-500 hover:text-red-400"
        onClick={(e) => {
          e.stopPropagation();
          onClear(index);
        }}
        title="Clear track"
      >
        CLR
      </button>

      {/* Volume slider (vertical) */}
      <div className="flex flex-col items-center gap-1 mt-1">
        <span className="text-[9px] text-zinc-500">VOL</span>
        <input
          type="range"
          min="0"
          max="200"
          value={Math.round(track.volume * 100)}
          onChange={(e) => {
            e.stopPropagation();
            onVolumeChange(index, Number(e.target.value) / 100);
          }}
          className="w-20 accent-sky-400"
          title={`Volume: ${Math.round(track.volume * 100)}%`}
        />
        <span className="text-[10px] font-mono text-zinc-400">
          {Math.round(track.volume * 100)}
        </span>
      </div>

      {/* Phrase indicator */}
      <div
        className={`w-2 h-2 rounded-full mt-1 ${
          track.hasPhrase ? 'bg-sky-400' : 'bg-zinc-700'
        }`}
        title={track.hasPhrase ? 'Phrase exists' : 'No phrase'}
      />
    </div>
  );
}
