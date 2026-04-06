/**
 * ParameterKnobs — The [1]–[4] knobs panel matching the CR-606 MK-1 hardware.
 *
 * These knobs contextually control different parameters based on the
 * current screen/mode. In Phase 2, they control:
 * - [1] Volume of current track
 * - [2] Pan of current track
 * - [3] Master volume
 * - [4] Tempo
 */

import { Knob } from './Knob';
import { useTrackStore } from '../../store/useTrackStore';
import { useTransportStore } from '../../store/useTransportStore';

interface ParameterKnobsProps {
  onTrackVolumeChange: (idx: number, vol: number) => void;
  onTrackPanChange: (idx: number, pan: number) => void;
  onMasterVolumeChange: (vol: number) => void;
}

export function ParameterKnobs({
  onTrackVolumeChange,
  onTrackPanChange,
  onMasterVolumeChange,
}: ParameterKnobsProps) {
  const currentTrack = useTrackStore((s) => s.currentTrack);
  const track = useTrackStore((s) => s.tracks[s.currentTrack]);
  const tempo = useTransportStore((s) => s.tempo);
  const setTempo = useTransportStore((s) => s.setTempo);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Section label */}
      <div className="text-[9px] font-bold tracking-[0.2em] text-zinc-600 uppercase">
        PARAMETERS
      </div>

      {/* Knobs row */}
      <div className="grid grid-cols-2 gap-4">
        {/* [1] Track Volume */}
        <Knob
          value={track.volume}
          min={0}
          max={2}
          label={`[1] VOL`}
          size={44}
          onChange={(v) => onTrackVolumeChange(currentTrack, v)}
          formatValue={(v) => String(Math.round(v * 100))}
          color="var(--lcd-text)"
        />

        {/* [2] Track Pan */}
        <Knob
          value={track.pan}
          min={-1}
          max={1}
          label={`[2] PAN`}
          size={44}
          onChange={(v) => onTrackPanChange(currentTrack, v)}
          formatValue={(v) => {
            if (Math.abs(v) < 0.02) return 'C';
            return v < 0 ? `L${Math.round(Math.abs(v) * 50)}` : `R${Math.round(v * 50)}`;
          }}
          color="var(--lcd-text)"
        />

        {/* [3] Master Volume */}
        <Knob
          value={1.0}
          min={0}
          max={2}
          label="[3] MSTR"
          size={44}
          onChange={(v) => onMasterVolumeChange(v)}
          formatValue={(v) => String(Math.round(v * 100))}
          color="var(--lcd-text)"
        />

        {/* [4] Tempo */}
        <Knob
          value={tempo}
          min={40}
          max={300}
          label="[4] BPM"
          size={44}
          onChange={(v) => setTempo(Math.round(v * 10) / 10)}
          formatValue={(v) => v.toFixed(1)}
          color="var(--lcd-text)"
        />
      </div>
    </div>
  );
}
