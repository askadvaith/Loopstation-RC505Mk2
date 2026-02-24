/**
 * MixerScreen — Mixer view showing all 5 track levels and pans.
 * Activated by pressing ENTER on the play screen in the real unit.
 */

import { useTrackStore } from '../../../store/useTrackStore';

const STATE_COLOR: Record<string, string> = {
  empty: '#3f3f46',
  recording: '#ff2d2d',
  playing: '#22c55e',
  overdubbing: '#eab308',
  stopped: '#71717a',
};

export function MixerScreen() {
  const tracks = useTrackStore((s) => s.tracks);
  const currentTrack = useTrackStore((s) => s.currentTrack);

  return (
    <div className="flex flex-col h-full">
      <div className="text-[10px] text-zinc-500 font-bold tracking-wider mb-2">
        MIXER
      </div>

      <div className="flex gap-2 flex-1 items-end">
        {tracks.map((t, i) => {
          const level = (t.volume / 2) * 100; // Normalize to percentage
          const isActive = currentTrack === i;

          return (
            <div
              key={i}
              className={`flex-1 flex flex-col items-center gap-1 ${
                isActive ? 'opacity-100' : 'opacity-60'
              }`}
            >
              {/* Track label */}
              <span className="text-[8px] text-zinc-500 font-bold">T{i + 1}</span>

              {/* Level meter */}
              <div className="w-full flex-1 flex justify-center min-h-[50px]">
                <div className="relative w-3 h-full bg-black/40 rounded-sm overflow-hidden">
                  {/* Level bar */}
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-sm transition-all duration-100"
                    style={{
                      height: `${level}%`,
                      backgroundColor: STATE_COLOR[t.state],
                      boxShadow:
                        t.state !== 'empty' && t.state !== 'stopped'
                          ? `0 0 4px ${STATE_COLOR[t.state]}`
                          : 'none',
                    }}
                  />
                  {/* Unity mark */}
                  <div
                    className="absolute left-[-1px] right-[-1px] h-[1px] bg-zinc-500"
                    style={{ bottom: '50%' }}
                  />
                </div>
              </div>

              {/* Value */}
              <span className="text-[9px] font-mono text-zinc-400 tabular-nums">
                {Math.round(t.volume * 100)}
              </span>

              {/* Pan display */}
              <div className="flex items-center gap-[1px]">
                <div
                  className="h-[3px] rounded-full"
                  style={{
                    width: 12,
                    background:
                      t.pan < 0
                        ? `linear-gradient(to right, transparent, var(--lcd-text))`
                        : 'rgba(255,255,255,0.1)',
                  }}
                />
                <div
                  className="w-[3px] h-[3px] rounded-full"
                  style={{
                    backgroundColor:
                      t.pan === 0 ? 'var(--lcd-text)' : 'rgba(255,255,255,0.1)',
                  }}
                />
                <div
                  className="h-[3px] rounded-full"
                  style={{
                    width: 12,
                    background:
                      t.pan > 0
                        ? `linear-gradient(to left, transparent, var(--lcd-text))`
                        : 'rgba(255,255,255,0.1)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
