/**
 * MainPanel — Top-level layout assembling the loopstation UI.
 */

import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useKeyboard } from '../../hooks/useKeyboard';
import { useTransportStore } from '../../store/useTransportStore';
import { TrackStrip } from '../track/TrackStrip';
import { Display } from '../display/Display';
import { TransportControls } from '../controls/TransportControls';

export function MainPanel() {
  const controls = useAudioEngine();
  const {
    initAudio,
    toggleTrack,
    stopTrack,
    clearTrack,
    undoTrack,
    redoTrack,
    setTrackVolume,
    allStartStop,
    allClear,
  } = controls;

  useKeyboard(controls);

  const audioReady = useTransportStore((s) => s.audioReady);

  /* Audio must be initialized from a user gesture */
  if (!audioReady) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-wider text-zinc-200 mb-2">
            RC-505 MK2
          </h1>
          <p className="text-sm text-zinc-500">LOOP STATION</p>
        </div>
        <button
          className="hw-button px-8 py-4 text-lg font-bold tracking-wider bg-[var(--panel-surface)] hover:bg-zinc-700 border-[var(--led-blue)] text-[var(--lcd-text)]"
          onClick={initAudio}
        >
          START
        </button>
        <p className="text-xs text-zinc-600 max-w-md text-center">
          Click START to initialize the audio engine and connect your microphone.
          Microphone access is required for recording.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4 gap-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-widest text-zinc-300">
            RC-505 MK2
          </h1>
          <p className="text-[10px] tracking-[0.2em] text-zinc-600">LOOP STATION</p>
        </div>
        <div className="flex items-center gap-3">
          {/* GitHub */}
          <a
            href="https://www.github.com/askadvaith"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub"
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          {/* LinkedIn */}
          <a
            href="https://www.linkedin.com/in/advaithsanil"
            target="_blank"
            rel="noopener noreferrer"
            title="LinkedIn"
            className="text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        </div>
      </div>

      {/* Display */}
      <Display />

      {/* Main content: 5 tracks + transport */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* 5 Track strips */}
        <div className="flex gap-2 flex-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 min-w-0">
              <TrackStrip
                index={i}
                onToggle={toggleTrack}
                onStop={stopTrack}
                onClear={clearTrack}
                onVolumeChange={setTrackVolume}
              />
            </div>
          ))}
        </div>

        {/* Transport controls */}
        <div className="w-48 flex-shrink-0">
          <TransportControls
            onAllStartStop={allStartStop}
            onAllClear={allClear}
            onUndo={undoTrack}
            onRedo={redoTrack}
          />
        </div>
      </div>

      {/* Keyboard shortcut hints */}
      <div className="text-[9px] text-zinc-700 flex gap-4 justify-center">
        <span>1-5: Toggle track</span>
        <span>Q-T: Stop track</span>
        <span>Space: All Start/Stop</span>
        <span>Z: Undo</span>
        <span>X: Redo</span>
      </div>
    </div>
  );
}
