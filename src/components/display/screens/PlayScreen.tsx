/**
 * PlayScreen — Default display showing tempo, track overview, and memory info.
 * Matches the RC-505 MK2 main play screen layout.
 */

import { useTransportStore } from '../../../store/useTransportStore';
import { useTrackStore } from '../../../store/useTrackStore';

const STATE_COLOR: Record<string, string> = {
  empty: '#52525b',
  'rec-standby': '#ff2d2d',
  recording: '#ff2d2d',
  playing: '#22c55e',
  overdubbing: '#eab308',
  stopped: '#a1a1aa',
  'fading-out': '#71717a',
  'stopping-at-loop-end': '#71717a',
};

const STATE_LABEL: Record<string, string> = {
  empty: '---',
  'rec-standby': 'STB',
  recording: 'REC',
  playing: 'PLY',
  overdubbing: 'OVR',
  stopped: 'STP',
  'fading-out': 'FDE',
  'stopping-at-loop-end': 'END',
};

export function PlayScreen() {
  const tempo = useTransportStore((s) => s.tempo);
  const timeSignature = useTransportStore((s) => s.timeSignature);
  const playMode = useTransportStore((s) => s.playMode);
  const currentMemory = useTransportStore((s) => s.currentMemory);
  const micConnected = useTransportStore((s) => s.micConnected);
  const tracks = useTrackStore((s) => s.tracks);
  const currentTrack = useTrackStore((s) => s.currentTrack);

  return (
    <div className="flex flex-col h-full">
      {/* Top status bar */}
      <div className="flex items-center justify-between text-[10px] mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-[var(--lcd-text)] font-bold">
            M{String(currentMemory).padStart(2, '0')}
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-zinc-500">INIT</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 ${
              micConnected ? 'text-green-400' : 'text-red-400'
            }`}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <rect x="3" y="0" width="2" height="5" rx="1" />
              <path d="M1 3v1a3 3 0 006 0V3" fill="none" stroke="currentColor" strokeWidth="0.8" />
              <rect x="3.5" y="6" width="1" height="1.5" />
            </svg>
            {micConnected ? 'ON' : 'OFF'}
          </span>
        </div>
      </div>

      {/* Central tempo display */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold text-[var(--lcd-text)] tabular-nums tracking-tight">
            {tempo.toFixed(1)}
          </span>
          <span className="text-xs text-zinc-500 font-medium">BPM</span>
        </div>
        <div className="text-[10px] text-zinc-600 mt-1 flex items-center gap-2">
          <span>{timeSignature}/4</span>
          <span className="text-[8px]">•</span>
          <span className="text-[8px]">{playMode === 'single' ? 'SINGLE' : 'MULTI'}</span>
        </div>
      </div>

      {/* Track status tiles */}
      <div className="flex gap-1 mt-auto">
        {tracks.map((t, i) => (
          <div
            key={i}
            className={`flex-1 rounded py-1 px-1 flex flex-col items-center transition-all ${
              currentTrack === i
                ? 'bg-white/5 ring-1 ring-[var(--lcd-text)]/30'
                : 'bg-white/[0.02]'
            }`}
          >
            <span className="text-[8px] text-zinc-600 font-bold">T{i + 1}</span>
            <span
              className="text-[10px] font-bold font-mono"
              style={{ color: STATE_COLOR[t.state] }}
            >
              {STATE_LABEL[t.state]}
            </span>
            {/* Mini loop indicator */}
            <div className="w-full h-[3px] bg-black/30 rounded-full mt-0.5 overflow-hidden">
              <div
                className="h-full rounded-full transition-none"
                style={{
                  width: `${(t.playbackPosition * 100).toFixed(0)}%`,
                  backgroundColor:
                    t.state === 'playing' || t.state === 'overdubbing' || t.state === 'recording'
                      ? STATE_COLOR[t.state]
                      : 'transparent',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
