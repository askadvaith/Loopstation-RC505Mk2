/**
 * TrackEditScreen — Interactive Phase 3 settings editor for the currently selected track.
 *
 * Each parameter row is clickable to cycle through its options.
 * Boolean params toggle, enums cycle, numeric params increment/wrap.
 */

import { useTrackStore } from '../../../store/useTrackStore';
import type { TrackSettings, DubMode, StartMode, StopMode, SpeedMode, QuantizeMode, RecAction, MeasureSetting } from '../../../audio/LoopTrack';

interface TrackEditScreenProps {
  onUpdateSettings?: (idx: number, settings: Partial<TrackSettings>) => void;
}

/* ─── Cycle helpers ─── */
const DUB_MODES: DubMode[] = ['overdub', 'replace1', 'replace2'];
const DUB_MODE_LABEL: Record<string, string> = { overdub: 'OVERDUB', replace1: 'REPLACE1', replace2: 'REPLACE2' };

const START_MODES: StartMode[] = ['immediate', 'fade'];
const STOP_MODES: StopMode[] = ['immediate', 'fade', 'loop'];

const SPEED_OPTIONS: SpeedMode[] = ['half', 'normal', 'double'];
const SPEED_LABEL: Record<string, string> = { half: 'HALF', normal: 'NORMAL', double: 'DOUBLE' };

const QUANTIZE_OPTIONS: QuantizeMode[] = ['off', 'measure'];
const REC_ACTION_OPTIONS: RecAction[] = ['rec-play', 'rec-dub'];
const MEASURE_OPTIONS: MeasureSetting[] = ['auto', 'free', 1, 2, 4, 8, 16];

const FADE_OPTIONS = [1, 2, 4, 8, 16, 32];

function nextInArray<T>(arr: T[], current: T): T {
  const idx = arr.indexOf(current);
  return arr[(idx + 1) % arr.length];
}

function formatMeasure(m: string | number): string {
  if (m === 'auto') return 'AUTO';
  if (m === 'free') return 'FREE';
  return `${m} MEAS`;
}

export function TrackEditScreen({ onUpdateSettings }: TrackEditScreenProps) {
  const currentTrack = useTrackStore((s) => s.currentTrack);
  const track = useTrackStore((s) => s.tracks[s.currentTrack]);

  const update = (partial: Partial<TrackSettings>) => {
    onUpdateSettings?.(currentTrack, partial);
  };

  const params: { label: string; value: string; active?: boolean; onClick?: () => void }[] = [
    { label: 'VOLUME', value: `${Math.round(track.volume * 100)}` },
    {
      label: 'PAN',
      value:
        Math.abs(track.pan) < 0.02
          ? 'CENTER'
          : track.pan < 0
            ? `L${Math.round(Math.abs(track.pan) * 50)}`
            : `R${Math.round(track.pan * 50)}`,
    },
    { label: 'STATE', value: track.state.toUpperCase() },
    {
      label: 'DUB MODE',
      value: DUB_MODE_LABEL[track.dubMode] || track.dubMode,
      onClick: () => update({ dubMode: nextInArray(DUB_MODES, track.dubMode) }),
    },
    {
      label: 'REVERSE',
      value: track.reverse ? 'ON' : 'OFF',
      active: track.reverse,
      onClick: () => update({ reverse: !track.reverse }),
    },
    {
      label: '1SHOT',
      value: track.oneShot ? 'ON' : 'OFF',
      active: track.oneShot,
      onClick: () => update({ oneShot: !track.oneShot }),
    },
    {
      label: 'SPEED',
      value: SPEED_LABEL[track.speed] || track.speed,
      onClick: () => update({ speed: nextInArray(SPEED_OPTIONS, track.speed) }),
    },
    {
      label: 'LOOP SYNC',
      value: track.loopSync ? 'ON' : 'OFF',
      active: track.loopSync,
      onClick: () => update({ loopSync: !track.loopSync }),
    },
    {
      label: 'QUANTIZE',
      value: track.quantize.toUpperCase(),
      onClick: () => update({ quantize: nextInArray(QUANTIZE_OPTIONS, track.quantize) }),
    },
    {
      label: 'MEASURE',
      value: formatMeasure(track.measure),
      onClick: () => update({ measure: nextInArray(MEASURE_OPTIONS, track.measure) }),
    },
    {
      label: 'START',
      value: track.startMode.toUpperCase(),
      onClick: () => update({ startMode: nextInArray(START_MODES, track.startMode) }),
    },
    {
      label: 'STOP',
      value: track.stopMode.toUpperCase(),
      onClick: () => update({ stopMode: nextInArray(STOP_MODES, track.stopMode) }),
    },
    {
      label: 'FADE IN',
      value: `${track.fadeTimeIn} MEAS`,
      onClick: () => update({ fadeTimeIn: nextInArray(FADE_OPTIONS, track.fadeTimeIn) }),
    },
    {
      label: 'FADE OUT',
      value: `${track.fadeTimeOut} MEAS`,
      onClick: () => update({ fadeTimeOut: nextInArray(FADE_OPTIONS, track.fadeTimeOut) }),
    },
    {
      label: 'BOUNCE',
      value: track.bounceIn ? 'ON' : 'OFF',
      active: track.bounceIn,
      onClick: () => update({ bounceIn: !track.bounceIn }),
    },
    {
      label: 'AUTO REC',
      value: track.autoRecSw ? `ON (${track.autoRecSens})` : 'OFF',
      active: track.autoRecSw,
      onClick: () => update({ autoRecSw: !track.autoRecSw }),
    },
    {
      label: 'T-SYNC',
      value: track.tempoSyncSw ? track.tempoSyncMode.toUpperCase() : 'OFF',
      onClick: () => {
        if (!track.tempoSyncSw) {
          update({ tempoSyncSw: true, tempoSyncMode: 'pitch' });
        } else if (track.tempoSyncMode === 'pitch') {
          update({ tempoSyncMode: 'xfade' });
        } else {
          update({ tempoSyncSw: false });
        }
      },
    },
    {
      label: 'REC ACT',
      value: track.recAction === 'rec-dub' ? 'REC→DUB' : 'REC→PLAY',
      onClick: () => update({ recAction: nextInArray(REC_ACTION_OPTIONS, track.recAction) }),
    },
    { label: 'PHRASE', value: track.hasPhrase ? 'YES' : 'NO' },
    { label: 'MARK', value: track.hasMark ? 'SET' : '---' },
    { label: 'REC BACK', value: track.hasRecBack ? 'SAVED' : '---' },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-500 font-bold tracking-wider">
          TRACK {currentTrack + 1} EDIT
        </span>
        <span className="text-[10px] text-[var(--lcd-text)]">
          {track.state.toUpperCase()}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin pr-1" style={{ maxHeight: 120 }}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-[3px] content-start">
          {params.map((p) => (
            <div
              key={p.label}
              className={`flex justify-between items-center px-1 rounded ${
                p.onClick
                  ? 'cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors'
                  : ''
              }`}
              onClick={p.onClick}
              role={p.onClick ? 'button' : undefined}
              tabIndex={p.onClick ? 0 : undefined}
              onKeyDown={p.onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onClick!(); } } : undefined}
            >
              <span className="text-[8px] text-zinc-500 font-bold">{p.label}</span>
              <span
                className={`text-[9px] font-mono ${
                  p.active
                    ? 'text-[var(--led-green)]'
                    : p.onClick
                      ? 'text-[var(--lcd-text)]'
                      : 'text-zinc-500'
                }`}
              >
                {p.value}
                {p.onClick && (
                  <span className="text-zinc-600 ml-0.5">▸</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="text-[7px] text-zinc-600 text-center mt-1">
        Click a parameter to change it · Keyboard: D O Ctrl+R A M B
      </div>
    </div>
  );
}
