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
  step,
  label,
  size = 48,
  onChange,
  formatValue,
  color = 'var(--knob-indicator)',
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; startValue: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Normalize value to 0-1 range for rotation calculation
  const normalized = (value - min) / (max - min);
  // Map 0-1 to -135° to +135° (270° sweep)
  const rotation = -135 + normalized * 270;

  /** Clamp to range and snap to `step` if the param defines one. */
  const quantize = useCallback(
    (v: number) => {
      const clamped = Math.max(min, Math.min(max, v));
      if (!step || step <= 0) return clamped;
      return Math.max(min, Math.min(max, min + Math.round((clamped - min) / step) * step));
    },
    [min, max, step]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragState.current = { startX: e.clientX, startY: e.clientY, startValue: value };
      setIsDragging(true);
      // Capture so the drag keeps tracking even if the cursor leaves the knob.
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

      const handlePointerMove = (me: PointerEvent) => {
        if (!dragState.current) return;
        // Respond to BOTH axes: up or right increases, down or left decreases.
        // Vertical-only tracking made natural arc-style drags (right + slightly
        // down) read as a decrease, so the knob appeared to snap back left.
        const deltaY = dragState.current.startY - me.clientY;
        const deltaX = me.clientX - dragState.current.startX;
        const delta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;

        const sensitivity = me.shiftKey ? 600 : 200; // Fine control with shift
        const range = max - min;
        onChange(quantize(dragState.current.startValue + (delta / sensitivity) * range));
      };

      const handlePointerUp = () => {
        dragState.current = null;
        setIsDragging(false);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [value, min, max, onChange, quantize]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const increment = step && step > 0 ? step : (max - min) / 100;
      const delta = e.deltaY < 0 ? increment : -increment;
      onChange(quantize(value + delta));
    },
    [value, max, min, step, onChange, quantize]
  );

  const displayValue = formatValue
    ? formatValue(value)
    : Math.round(normalized * 100).toString();

  return (
    <div className="flex flex-col items-center gap-1 select-none">
      {/* Knob body */}
      <div
        ref={knobRef}
        className={`relative rounded-full cursor-grab touch-none transition-shadow ${
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
        onPointerDown={handlePointerDown}
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
