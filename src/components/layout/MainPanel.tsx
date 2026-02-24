/**
 * MainPanel — Top-level hardware panel layout for the RC-505 MK2 emulator.
 *
 * Layout (matches the physical unit's top panel):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  [BOSS Logo / Title]                              [Social Links]│
 * ├──────────────────────────────────────────────────────────────────┤
 * │  [INPUT FX placeholder]  │  [Display]  │  [TRACK FX placeholder]│
 * │                          │  [Knobs]    │                        │
 * ├──────────────────────────────────────────────────────────────────┤
 * │  Track 1 │ Track 2 │ Track 3 │ Track 4 │ Track 5 │  Transport  │
 * ├──────────────────────────────────────────────────────────────────┤
 * │                     [Keyboard Shortcuts]                        │
 * └──────────────────────────────────────────────────────────────────┘
 */

import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useKeyboard } from '../../hooks/useKeyboard';
import { useTransportStore } from '../../store/useTransportStore';
import { TrackStrip } from '../track/TrackStrip';
import { Display } from '../display/Display';
import { TransportControls } from '../controls/TransportControls';
import { ParameterKnobs } from '../controls/ParameterKnobs';

export function MainPanel() {
  const controls = useAudioEngine();
  const {
    engine,
    initAudio,
    toggleTrack,
    stopTrack,
    clearTrack,
    undoTrack,
    redoTrack,
    setTrackVolume,
    setTrackPan,
    updateTrackSettings,
    setMarkTrack,
    // clearMarkTrack available via controls if needed
    markBackTrack,
    recBackTrack,
    allStartStop,
    allClear,
  } = controls;

  useKeyboard(controls);

  const audioReady = useTransportStore((s) => s.audioReady);

  /* Audio must be initialized from a user gesture */
  if (!audioReady) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-8 p-8 select-none">
        {/* Logo area */}
        <div className="text-center">
          <div className="text-[10px] font-bold tracking-[0.4em] text-zinc-600 mb-1">
            BOSS
          </div>
          <h1 className="text-3xl font-bold tracking-[0.15em] text-zinc-200">
            RC-505 MK2
          </h1>
          <p className="text-[11px] tracking-[0.3em] text-zinc-500 mt-1">
            LOOP STATION
          </p>
        </div>

        {/* Start button */}
        <button
          className="start-button group relative px-12 py-5"
          onClick={initAudio}
        >
          <span className="text-lg font-bold tracking-[0.2em] text-[var(--lcd-text)] group-hover:text-white transition-colors">
            START
          </span>
          <div className="absolute inset-0 rounded-xl border border-[var(--led-blue)]/30 group-hover:border-[var(--led-blue)]/60 transition-colors" />
          <div className="absolute inset-[2px] rounded-[10px] bg-gradient-to-b from-white/[0.03] to-transparent" />
        </button>

        <div className="text-center max-w-sm">
          <p className="text-[11px] text-zinc-600 leading-relaxed">
            Click START to initialize the audio engine.
            Microphone access is required for recording.
          </p>
          <p className="text-[10px] text-zinc-700 mt-2">
            Use keys 1–5 to toggle tracks, Space for all start/stop
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-panel h-full flex flex-col select-none">
      {/* ═══ TOP BAR — Title + Social ═══ */}
      <div className="flex items-center justify-between px-5 py-2 border-b border-[var(--panel-border)]/50">
        <div>
          <h1 className="text-sm font-bold tracking-[0.15em] text-zinc-300 leading-tight">
            RC-505 MK2
          </h1>
          <p className="text-[8px] tracking-[0.25em] text-zinc-600 leading-tight">LOOP STATION</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="https://www.github.com/askadvaith"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub"
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          <a
            href="https://www.linkedin.com/in/advaithsanil"
            target="_blank"
            rel="noopener noreferrer"
            title="LinkedIn"
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        </div>
      </div>

      {/* ═══ CENTER SECTION — FX placeholders + Display + Knobs ═══ */}
      <div className="flex gap-4 px-5 py-3">
        {/* Input FX placeholder (Phase 4) */}
        <div className="flex-1 flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--panel-border)]/40 p-2 min-h-[80px]">
          <span className="text-[9px] font-bold tracking-[0.2em] text-zinc-700">INPUT FX</span>
          <div className="flex gap-1 mt-1">
            {['A', 'B', 'C', 'D'].map((bank) => (
              <div
                key={bank}
                className="w-6 h-5 rounded text-[8px] font-bold flex items-center justify-center bg-zinc-800/60 text-zinc-600 border border-zinc-700/50"
              >
                {bank}
              </div>
            ))}
          </div>
        </div>

        {/* Display (central) */}
        <div className="flex-[2] min-w-[280px]">
          <Display onUpdateSettings={updateTrackSettings} />
        </div>

        {/* Parameter Knobs + Output Level */}
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <ParameterKnobs
            onTrackVolumeChange={setTrackVolume}
            onTrackPanChange={setTrackPan}
            onMasterVolumeChange={(v) => engine.setMasterVolume(v)}
          />
        </div>

        {/* Track FX placeholder (Phase 4) */}
        <div className="flex-1 flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--panel-border)]/40 p-2 min-h-[80px]">
          <span className="text-[9px] font-bold tracking-[0.2em] text-zinc-700">TRACK FX</span>
          <div className="flex gap-1 mt-1">
            {['A', 'B', 'C', 'D'].map((bank) => (
              <div
                key={bank}
                className="w-6 h-5 rounded text-[8px] font-bold flex items-center justify-center bg-zinc-800/60 text-zinc-600 border border-zinc-700/50"
              >
                {bank}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ MAIN SECTION — Track Strips + Transport ═══ */}
      <div className="flex gap-3 flex-1 min-h-0 px-5 pb-3">
        {/* 5 Track Strips */}
        <div className="flex gap-2 flex-1 min-w-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 min-w-0">
              <TrackStrip
                index={i}
                onToggle={toggleTrack}
                onStop={stopTrack}
                onClear={clearTrack}
                onVolumeChange={setTrackVolume}
                onUpdateSettings={updateTrackSettings}
              />
            </div>
          ))}
        </div>

        {/* Transport Controls */}
        <div className="w-44 flex-shrink-0">
          <TransportControls
            onAllStartStop={allStartStop}
            onAllClear={allClear}
            onUndo={undoTrack}
            onRedo={redoTrack}
            onMarkSet={setMarkTrack}
            onMarkBack={markBackTrack}
            onRecBack={recBackTrack}
          />
        </div>
      </div>

      {/* ═══ FOOTER — Keyboard Shortcuts ═══ */}
      <div className="flex items-center justify-center gap-4 px-5 py-1.5 border-t border-[var(--panel-border)]/30">
        {[
          { key: '1–5', action: 'Toggle track' },
          { key: 'Q–T', action: 'Stop track' },
          { key: 'Shift+1-5', action: 'Clear track' },
          { key: 'Space', action: 'All Start/Stop' },
          { key: 'Z', action: 'Undo' },
          { key: 'X', action: 'Redo' },
          { key: 'D', action: 'Dub mode' },
          { key: 'O', action: '1-Shot' },
          { key: 'M', action: 'Mark' },
          { key: 'B', action: 'Rec Back' },
        ].map((shortcut) => (
          <span key={shortcut.key} className="text-[8px] text-zinc-700 flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-zinc-800/60 rounded text-zinc-500 font-mono text-[7px] border border-zinc-700/50">
              {shortcut.key}
            </kbd>
            {shortcut.action}
          </span>
        ))}
      </div>
    </div>
  );
}
