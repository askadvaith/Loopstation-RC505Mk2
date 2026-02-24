/**
 * LoopIndicator — Waveform and position indicator bar for a single track.
 *
 * Displays a simplified waveform representation and an animated playback
 * position cursor that sweeps across the bar.
 */

import { useMemo } from 'react';
import type { TrackState } from '../../audio/LoopTrack';

interface LoopIndicatorProps {
  position: number;    // 0–1 normalized playback position
  state: TrackState;
  hasPhrase: boolean;
  duration: number;    // seconds
}

const STATE_GLOW: Record<string, string> = {
  recording: 'rgba(255, 45, 45, 0.4)',
  'rec-standby': 'rgba(255, 45, 45, 0.2)',
  playing: 'rgba(34, 197, 94, 0.3)',
  overdubbing: 'rgba(234, 179, 8, 0.3)',
  stopped: 'transparent',
  empty: 'transparent',
  'fading-out': 'rgba(161, 161, 170, 0.2)',
  'stopping-at-loop-end': 'rgba(161, 161, 170, 0.2)',
};

const STATE_BAR_COLOR: Record<string, string> = {
  recording: '#ff2d2d',
  'rec-standby': '#ff2d2d',
  playing: '#22c55e',
  overdubbing: '#eab308',
  stopped: '#71717a',
  empty: '#3f3f46',
  'fading-out': '#71717a',
  'stopping-at-loop-end': '#71717a',
};

export function LoopIndicator({ position, state, hasPhrase, duration }: LoopIndicatorProps) {
  // Generate a pseudo-waveform pattern for visual interest
  const waveform = useMemo(() => {
    if (!hasPhrase) return [];
    const bars = 48;
    // Deterministic pseudo-random based on duration
    const seed = Math.round(duration * 1000);
    return Array.from({ length: bars }, (_, i) => {
      const x = Math.sin(seed + i * 0.7) * 0.3 + Math.cos(i * 1.3 + seed * 0.1) * 0.3 + 0.5;
      return Math.max(0.15, Math.min(1, x));
    });
  }, [hasPhrase, duration]);

  const isActive = state === 'playing' || state === 'recording' || state === 'overdubbing' || state === 'fading-out' || state === 'stopping-at-loop-end';

  return (
    <div
      className="relative w-full rounded overflow-hidden"
      style={{
        height: 32,
        background: 'var(--lcd-bg)',
        border: '1px solid var(--panel-border)',
        boxShadow: isActive ? `inset 0 0 12px ${STATE_GLOW[state]}` : 'none',
      }}
    >
      {hasPhrase ? (
        <>
          {/* Waveform bars */}
          <div className="absolute inset-0 flex items-center px-[2px] gap-[1px]">
            {waveform.map((height, i) => {
              const barPosition = i / waveform.length;
              const isPast = barPosition <= position && isActive;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-colors duration-75"
                  style={{
                    height: `${height * 80}%`,
                    backgroundColor: isPast
                      ? STATE_BAR_COLOR[state]
                      : 'rgba(125, 211, 252, 0.2)',
                    opacity: isPast ? 1 : 0.5,
                  }}
                />
              );
            })}
          </div>

          {/* Playback cursor */}
          {isActive && (
            <div
              className="absolute top-0 bottom-0 w-[2px]"
              style={{
                left: `${position * 100}%`,
                backgroundColor: STATE_BAR_COLOR[state],
                boxShadow: `0 0 4px ${STATE_BAR_COLOR[state]}`,
                transition: 'left 50ms linear',
              }}
            />
          )}

          {/* Duration label */}
          <div className="absolute bottom-0 right-1 text-[8px] font-mono text-zinc-500 leading-none pb-[2px]">
            {formatDuration(duration)}
          </div>
        </>
      ) : (
        /* Empty state */
        <div className="flex items-center justify-center h-full">
          <span className="text-[10px] font-mono text-zinc-600">EMPTY</span>
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${String(secs).padStart(2, '0')}.${ms}`;
}
