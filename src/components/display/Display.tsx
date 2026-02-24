/**
 * Display — Central LCD-style display showing key information.
 */

import { useTransportStore } from '../../store/useTransportStore';
import { useTrackStore } from '../../store/useTrackStore';

const STATE_COLORS: Record<string, string> = {
  empty: 'text-zinc-600',
  recording: 'text-red-400',
  playing: 'text-green-400',
  overdubbing: 'text-yellow-400',
  stopped: 'text-zinc-400',
};

export function Display() {
  const tempo = useTransportStore((s) => s.tempo);
  const currentMemory = useTransportStore((s) => s.currentMemory);
  const micConnected = useTransportStore((s) => s.micConnected);
  const audioReady = useTransportStore((s) => s.audioReady);
  const tracks = useTrackStore((s) => s.tracks);
  const currentTrack = useTrackStore((s) => s.currentTrack);

  return (
    <div className="bg-[var(--lcd-bg)] border border-[var(--panel-border)] rounded-lg p-4 font-mono min-h-[140px]">
      {/* Header row */}
      <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-2">
        <span>
          MEM {String(currentMemory).padStart(2, '0')}
        </span>
        <span className="flex items-center gap-2">
          <span className={micConnected ? 'text-green-400' : 'text-red-400'}>
            MIC {micConnected ? 'ON' : 'OFF'}
          </span>
          <span className={audioReady ? 'text-green-400' : 'text-zinc-600'}>
            {audioReady ? 'READY' : 'INIT'}
          </span>
        </span>
      </div>

      {/* Tempo */}
      <div className="text-center mb-3">
        <span className="text-3xl text-[var(--lcd-text)] font-bold">
          {tempo.toFixed(1)}
        </span>
        <span className="text-xs text-zinc-500 ml-1">BPM</span>
      </div>

      {/* Track status row */}
      <div className="flex justify-center gap-3">
        {tracks.map((t, i) => (
          <div
            key={i}
            className={`flex flex-col items-center ${
              currentTrack === i ? 'opacity-100' : 'opacity-60'
            }`}
          >
            <span className="text-[9px] text-zinc-500">T{i + 1}</span>
            <span className={`text-xs font-bold ${STATE_COLORS[t.state]}`}>
              {t.state === 'empty'
                ? '---'
                : t.state === 'recording'
                  ? 'REC'
                  : t.state === 'playing'
                    ? 'PLY'
                    : t.state === 'overdubbing'
                      ? 'OVR'
                      : 'STP'}
            </span>
            {/* Mini position bar */}
            <div className="w-8 h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-[var(--lcd-text)]"
                style={{ width: `${(t.playbackPosition * 100).toFixed(0)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
