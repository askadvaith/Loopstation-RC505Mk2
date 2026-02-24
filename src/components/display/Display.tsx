/**
 * Display — Central LCD-style display matching the RC-505 MK2 hardware screen.
 *
 * Supports multiple screen views:
 * - PLAY: Main play screen with tempo and track overview
 * - MIXER: Level meters and pan for all tracks
 * - TRACK: Detailed track parameter editing
 *
 * Screen switching via < > buttons (maps to [◄] [►] on hardware).
 */

import { useState } from 'react';
import { PlayScreen } from './screens/PlayScreen';
import { MixerScreen } from './screens/MixerScreen';
import { TrackEditScreen } from './screens/TrackEditScreen';
import type { TrackSettings } from '../../audio/LoopTrack';

type ScreenId = 'play' | 'mixer' | 'track';

const SCREENS: { id: ScreenId; label: string }[] = [
  { id: 'play', label: 'PLAY' },
  { id: 'mixer', label: 'MIXER' },
  { id: 'track', label: 'TRACK' },
];

interface DisplayProps {
  onUpdateSettings?: (idx: number, settings: Partial<TrackSettings>) => void;
}

export function Display({ onUpdateSettings }: DisplayProps) {
  const [screenIdx, setScreenIdx] = useState(0);
  const currentScreen = SCREENS[screenIdx];

  const prevScreen = () => setScreenIdx((i) => (i - 1 + SCREENS.length) % SCREENS.length);
  const nextScreen = () => setScreenIdx((i) => (i + 1) % SCREENS.length);

  return (
    <div className="display-container flex flex-col">
      {/* LCD Screen */}
      <div
        className="relative rounded-lg overflow-hidden flex-1"
        style={{
          background: 'var(--lcd-bg)',
          border: '1px solid var(--panel-border)',
          boxShadow: `
            inset 0 1px 8px rgba(0, 0, 0, 0.6),
            0 1px 0 rgba(255, 255, 255, 0.03)
          `,
          minHeight: 160,
        }}
      >
        {/* Scanline overlay for CRT/LCD effect */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
          }}
        />

        {/* Screen content */}
        <div className="relative z-0 p-3 h-full font-mono">
          {currentScreen.id === 'play' && <PlayScreen />}
          {currentScreen.id === 'mixer' && <MixerScreen />}
          {currentScreen.id === 'track' && <TrackEditScreen onUpdateSettings={onUpdateSettings} />}
        </div>
      </div>

      {/* Navigation strip below display */}
      <div className="flex items-center justify-between mt-2 px-1">
        {/* Left nav button */}
        <button
          className="hw-button px-2 py-1 text-[10px] font-bold text-zinc-500 hover:text-zinc-300"
          onClick={prevScreen}
          title="Previous screen [←]"
        >
          ◄
        </button>

        {/* Screen indicators */}
        <div className="flex items-center gap-3">
          {SCREENS.map((s, i) => (
            <button
              key={s.id}
              className={`text-[9px] font-bold tracking-wider transition-colors ${
                i === screenIdx
                  ? 'text-[var(--lcd-text)]'
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}
              onClick={() => setScreenIdx(i)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Right nav button */}
        <button
          className="hw-button px-2 py-1 text-[10px] font-bold text-zinc-500 hover:text-zinc-300"
          onClick={nextScreen}
          title="Next screen [→]"
        >
          ►
        </button>
      </div>
    </div>
  );
}
