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
