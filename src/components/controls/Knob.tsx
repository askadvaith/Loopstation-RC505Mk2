/**
 * Knob — Rotary knob component mimicking the CR-606 MK-1 hardware knobs.
 *
 * Supports drag-to-rotate interaction (vertical mouse movement).
 * Visual: dark circle with an indicator line showing current position.
 */

import { useCallback, useRef, useState } from 'react';

interface KnobProps {
  value: number;       // 0–1 normalized
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  size?: number;       // px diameter
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  color?: string;      // indicator color
}

export function Knob({
  value,
  min = 0,
  max = 1,
  label,
  size = 48,
  onChange,
  formatValue,
  color = 'var(--knob-indicator)',
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startY: number; startValue: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Normalize value to 0-1 range for rotation calculation
  const normalized = (value - min) / (max - min);
  // Map 0-1 to -135° to +135° (270° sweep)
  const rotation = -135 + normalized * 270;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragState.current = { startY: e.clientY, startValue: value };
      setIsDragging(true);

      const handleMouseMove = (me: MouseEvent) => {
        if (!dragState.current) return;
        const deltaY = dragState.current.startY - me.clientY;
        const sensitivity = me.shiftKey ? 600 : 200; // Fine control with shift
        const range = max - min;
        const newValue = Math.max(
          min,
          Math.min(max, dragState.current.startValue + (deltaY / sensitivity) * range)
        );
        onChange(newValue);
      };

      const handleMouseUp = () => {
        dragState.current = null;
        setIsDragging(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [value, min, max, onChange]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const step = (max - min) / 100;
      const delta = e.deltaY < 0 ? step : -step;
      onChange(Math.max(min, Math.min(max, value + delta)));
    },
    [value, min, max, onChange]
  );

  const displayValue = formatValue
    ? formatValue(value)
    : Math.round(normalized * 100).toString();

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      {/* Knob body */}
      <div
        ref={knobRef}
        className={`relative rounded-full cursor-grab transition-shadow ${
          isDragging ? 'cursor-grabbing ring-2 ring-white/20' : ''
        }`}
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 35% 35%, #404048, #1a1a20)`,
          boxShadow: `
            0 2px 8px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.08),
            inset 0 -1px 0 rgba(0,0,0,0.3)
          `,
        }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        title={`${label ?? ''}: ${displayValue}`}
      >
        {/* Track arc (background) */}
        <svg
          className="absolute inset-0"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - 4}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={2}
            strokeDasharray={`${(270 / 360) * Math.PI * (size - 8)}`}
            strokeLinecap="round"
            transform={`rotate(135, ${size / 2}, ${size / 2})`}
          />
        </svg>

        {/* Indicator line */}
        <div
          className="absolute inset-0 flex items-start justify-center"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
          <div
            className="rounded-full mt-[3px]"
            style={{
              width: 3,
              height: size / 2 - 8,
              background: color,
              boxShadow: `0 0 6px ${color}`,
            }}
          />
        </div>

        {/* Center cap */}
        <div
          className="absolute rounded-full"
          style={{
            width: size * 0.32,
            height: size * 0.32,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'radial-gradient(circle at 40% 40%, #3a3a42, #1a1a20)',
          }}
        />
      </div>

      {/* Value display */}
      <span className="text-[10px] font-mono text-zinc-400 h-3 leading-3">
        {displayValue}
      </span>

      {/* Label */}
      {label && (
        <span className="text-[9px] font-bold tracking-wider text-zinc-500 uppercase">
          {label}
        </span>
      )}
    </div>
  );
}
