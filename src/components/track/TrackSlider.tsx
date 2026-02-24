/**
 * TrackSlider — Vertical volume fader matching RC-505 MK2 hardware style.
 *
 * A custom-styled vertical range input with a hardware-like track groove
 * and slider thumb.
 */

interface TrackSliderProps {
  value: number;        // 0–2 (1 = unity)
  onChange: (value: number) => void;
  label?: string;
  height?: number;      // px
}

export function TrackSlider({ value, onChange, label = 'LEVEL', height = 120 }: TrackSliderProps) {
  const percentage = (value / 2) * 100;
  const displayValue = Math.round(value * 100);

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      {/* Label */}
      <span className="text-[8px] font-bold tracking-wider text-zinc-600 uppercase">
        {label}
      </span>

      {/* Vertical slider container */}
      <div
        className="relative flex items-center justify-center"
        style={{ width: 32, height }}
      >
        {/* Track groove */}
        <div
          className="absolute rounded-full"
          style={{
            width: 4,
            height: height - 16,
            background: 'var(--slider-track)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)',
          }}
        >
          {/* Fill */}
          <div
            className="absolute bottom-0 left-0 right-0 rounded-full"
            style={{
              height: `${percentage}%`,
              background: 'linear-gradient(to top, var(--slider-fill), rgba(125, 211, 252, 0.5))',
            }}
          />
          {/* Unity mark at 50% */}
          <div
            className="absolute left-[-6px] right-[-6px] h-[1px] bg-zinc-500"
            style={{ bottom: '50%' }}
          />
        </div>

        {/* Invisible range input for interaction */}
        <input
          type="range"
          min={0}
          max={200}
          value={Math.round(value * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="track-slider-input absolute"
          style={{
            width: height,
            height: 32,
            transform: 'rotate(-90deg)',
            transformOrigin: 'center center',
          }}
          title={`${label}: ${displayValue}%`}
        />
      </div>

      {/* Value */}
      <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
        {displayValue}
      </span>
    </div>
  );
}
