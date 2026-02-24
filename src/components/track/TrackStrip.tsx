/**
 * TrackStrip — A single track column in the loopstation UI (Phase 3).
 *
 * Shows: track number, status LED, state label, feature indicators (REV/1SHOT/SYNC),
 * loop position bar, main REC/PLAY button, STOP button, volume fader, CLEAR button.
 */

import { useTrackStore } from '../../store/useTrackStore';
import { LoopIndicator } from './LoopIndicator';
import { TrackSlider } from './TrackSlider';
import type { TrackSettings } from '../../audio/LoopTrack';

interface TrackStripProps {
  index: number;
  onToggle: (idx: number) => void;
  onStop: (idx: number) => void;
  onClear: (idx: number) => void;
  onVolumeChange: (idx: number, vol: number) => void;
  onUpdateSettings: (idx: number, settings: Partial<TrackSettings>) => void;
}

const STATE_LED: Record<string, { bg: string; glow: string }> = {
  empty: { bg: '#3f3f46', glow: '' },
  'rec-standby': { bg: '#ff2d2d', glow: 'led-glow-red' },
  recording: { bg: '#ff2d2d', glow: 'led-glow-red' },
  playing: { bg: '#22c55e', glow: 'led-glow-green' },
  overdubbing: { bg: '#eab308', glow: 'led-glow-yellow' },
  stopped: { bg: '#a1a1aa', glow: '' },
  'fading-out': { bg: '#a1a1aa', glow: '' },
  'stopping-at-loop-end': { bg: '#a1a1aa', glow: '' },
};

const STATE_LABELS: Record<string, string> = {
  empty: 'EMPTY',
  'rec-standby': 'STBY',
  recording: 'REC',
  playing: 'PLAY',
  overdubbing: 'O-DUB',
  stopped: 'STOP',
  'fading-out': 'FADE',
  'stopping-at-loop-end': 'END…',
};

const TRACK_KEYS = ['1', '2', '3', '4', '5'];
const STOP_KEYS = ['Q', 'W', 'E', 'R', 'T'];

const DUB_MODE_LABELS: Record<string, string> = {
  overdub: 'OVR',
  replace1: 'R1',
  replace2: 'R2',
};

export function TrackStrip({
  index,
  onToggle,
  onStop,
  onClear,
  onVolumeChange,
  onUpdateSettings: _onUpdateSettings,
}: TrackStripProps) {
  void _onUpdateSettings; // available for future inline controls
  const track = useTrackStore((s) => s.tracks[index]);
  const currentTrack = useTrackStore((s) => s.currentTrack);
  const setCurrentTrack = useTrackStore((s) => s.setCurrentTrack);

  const isSelected = currentTrack === index;
  const led = STATE_LED[track.state] ?? STATE_LED.empty;

  return (
    <div
      className={`track-strip flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'bg-[var(--panel-surface)] ring-1 ring-[var(--led-blue)]/60 shadow-lg shadow-blue-500/5'
          : 'bg-[var(--panel-surface)]/60 hover:bg-[var(--panel-surface)]/80'
      }`}
      onClick={() => setCurrentTrack(index)}
    >
      {/* ── Track Header ── */}
      <div className="flex items-center gap-2 w-full justify-between">
        <span
          className={`text-[10px] font-bold tracking-[0.2em] ${
            isSelected ? 'text-[var(--lcd-text)]' : 'text-zinc-500'
          }`}
        >
          TRACK {index + 1}
        </span>
        {/* Status LED */}
        <div
          className={`w-3 h-3 rounded-full ${led.glow} transition-all duration-100 ${
            track.state === 'rec-standby' ? 'animate-pulse' : ''
          }`}
          style={{ backgroundColor: led.bg }}
        />
      </div>

      {/* ── State Label ── */}
      <div
        className="text-[10px] font-mono font-bold tracking-wider h-4"
        style={{
          color:
            track.state === 'recording' || track.state === 'rec-standby'
              ? 'var(--led-red)'
              : track.state === 'playing'
                ? 'var(--led-green)'
                : track.state === 'overdubbing'
                  ? 'var(--led-yellow)'
                  : '#71717a',
        }}
      >
        {STATE_LABELS[track.state]}
      </div>

      {/* ── Feature Indicators (REV / 1SHOT / DUB / SYNC / SPD) ── */}
      <div className="flex flex-wrap gap-[2px] justify-center w-full min-h-[14px]">
        {track.reverse && (
          <span className="text-[7px] font-bold px-1 py-[1px] rounded bg-pink-900/40 text-pink-400 border border-pink-700/40">
            REV
          </span>
        )}
        {track.oneShot && (
          <span className="text-[7px] font-bold px-1 py-[1px] rounded bg-cyan-900/40 text-cyan-400 border border-cyan-700/40">
            1SH
          </span>
        )}
        {track.dubMode !== 'overdub' && (
          <span className="text-[7px] font-bold px-1 py-[1px] rounded bg-amber-900/40 text-amber-400 border border-amber-700/40">
            {DUB_MODE_LABELS[track.dubMode]}
          </span>
        )}
        {track.loopSync && (
          <span className="text-[7px] font-bold px-1 py-[1px] rounded bg-blue-900/40 text-blue-400 border border-blue-700/40">
            SYN
          </span>
        )}
        {track.speed !== 'normal' && (
          <span className="text-[7px] font-bold px-1 py-[1px] rounded bg-purple-900/40 text-purple-400 border border-purple-700/40">
            {track.speed === 'half' ? '½×' : '2×'}
          </span>
        )}
        {track.autoRecSw && (
          <span className="text-[7px] font-bold px-1 py-[1px] rounded bg-red-900/40 text-red-400 border border-red-700/40">
            ARC
          </span>
        )}
        {track.bounceIn && (
          <span className="text-[7px] font-bold px-1 py-[1px] rounded bg-green-900/40 text-green-400 border border-green-700/40">
            BNC
          </span>
        )}
      </div>

      {/* ── Loop Indicator (waveform + position) ── */}
      <LoopIndicator
        position={track.playbackPosition}
        state={track.state}
        hasPhrase={track.hasPhrase}
        duration={track.duration}
      />

      {/* ── Main REC/PLAY Button ── */}
      <button
        className="track-main-btn relative"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(index);
        }}
        title={`Record / Play / Overdub [${TRACK_KEYS[index]}]`}
      >
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center text-lg transition-all duration-150 ${
            track.state === 'recording' || track.state === 'rec-standby'
              ? 'track-btn-rec'
              : track.state === 'playing'
                ? 'track-btn-play'
                : track.state === 'overdubbing'
                  ? 'track-btn-odub'
                  : 'track-btn-idle'
          } ${track.state === 'rec-standby' ? 'animate-pulse' : ''}`}
        >
          {track.state === 'empty' && (
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6" fill="currentColor" />
            </svg>
          )}
          {track.state === 'rec-standby' && (
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6" fill="currentColor" opacity="0.6" />
            </svg>
          )}
          {track.state === 'recording' && (
            <svg width="14" height="14" viewBox="0 0 14 14">
              <rect x="2" y="2" width="10" height="10" rx="1" fill="currentColor" />
            </svg>
          )}
          {(track.state === 'playing' || track.state === 'stopped' || track.state === 'fading-out' || track.state === 'stopping-at-loop-end') && (
            <svg width="16" height="16" viewBox="0 0 16 16">
              <polygon points="4,2 14,8 4,14" fill="currentColor" />
            </svg>
          )}
          {track.state === 'overdubbing' && (
            <svg width="16" height="16" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <circle cx="8" cy="8" r="2.5" fill="currentColor" />
            </svg>
          )}
        </div>
        {/* Keyboard hint */}
        <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 text-[8px] text-zinc-600 font-mono">
          {TRACK_KEYS[index]}
        </span>
      </button>

      {/* ── STOP Button ── */}
      <button
        className="hw-button w-12 h-7 text-[10px] font-bold tracking-wider flex items-center justify-center gap-1"
        onClick={(e) => {
          e.stopPropagation();
          onStop(index);
        }}
        title={`Stop [${STOP_KEYS[index]}]`}
      >
        <svg width="8" height="8" viewBox="0 0 8 8">
          <rect width="8" height="8" rx="1" fill="currentColor" />
        </svg>
        STOP
      </button>

      {/* ── Volume Fader ── */}
      <TrackSlider
        value={track.volume}
        onChange={(vol) => onVolumeChange(index, vol)}
        label="LEVEL"
        height={100}
      />

      {/* ── Clear Button ── */}
      <button
        className="hw-button w-full py-1 text-[9px] font-bold text-zinc-600 hover:text-red-400 tracking-wider transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onClear(index);
        }}
        title={`Clear track [Shift+${TRACK_KEYS[index]}]`}
      >
        CLEAR
      </button>
    </div>
  );
}
