/**
 * useAudioEngine — React hook that initializes and exposes the AudioEngine + LoopTracks.
 *
 * Creates 5 LoopTrack instances and wires their state changes into the Zustand store.
 * Returns control functions for the UI to call.
 */

import { useEffect, useRef, useCallback } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { LoopTrack } from '../audio/LoopTrack';
import type { TrackState } from '../audio/LoopTrack';
import { useTrackStore } from '../store/useTrackStore';
import { useTransportStore } from '../store/useTransportStore';

// Singleton array of track instances
let trackInstances: LoopTrack[] | null = null;

function getOrCreateTracks(): LoopTrack[] {
  if (!trackInstances) {
    const updateTrack = useTrackStore.getState().updateTrack;
    trackInstances = Array.from({ length: 5 }, (_, i) =>
      new LoopTrack({
        id: i,
        onStateChange: (id: number, state: TrackState) => {
          updateTrack(id, {
            state,
            hasPhrase: trackInstances![id].hasPhrase,
            hasUndo: trackInstances![id].hasUndo,
            hasRedo: trackInstances![id].hasRedo,
          });
        },
      })
    );
  }
  return trackInstances;
}

export interface AudioControls {
  engine: AudioEngine;
  tracks: LoopTrack[];
  initAudio: () => Promise<void>;
  toggleTrack: (idx: number) => void;
  stopTrack: (idx: number) => void;
  clearTrack: (idx: number) => void;
  undoTrack: (idx: number) => void;
  redoTrack: (idx: number) => void;
  setTrackVolume: (idx: number, volume: number) => void;
  setTrackPan: (idx: number, pan: number) => void;
  allStartStop: () => void;
  allClear: () => void;
}

export function useAudioEngine(): AudioControls {
  const engine = AudioEngine.getInstance();
  const tracks = getOrCreateTracks();
  const updateTrack = useTrackStore((s) => s.updateTrack);
  const positionRaf = useRef<number | null>(null);

  // Position tracking loop — polls track positions at 30fps
  useEffect(() => {
    const tick = () => {
      for (let i = 0; i < 5; i++) {
        const t = tracks[i];
        if (t.state === 'playing' || t.state === 'overdubbing') {
          updateTrack(i, { playbackPosition: t.playbackPosition });
        }
      }
      positionRaf.current = requestAnimationFrame(tick);
    };
    positionRaf.current = requestAnimationFrame(tick);

    return () => {
      if (positionRaf.current !== null) {
        cancelAnimationFrame(positionRaf.current);
      }
    };
  }, [tracks, updateTrack]);

  const initAudio = useCallback(async () => {
    await engine.resume();
    await engine.connectMicrophone();
    useTransportStore.getState().setMicConnected(true);
    useTransportStore.getState().setAudioReady(true);
  }, [engine]);

  const toggleTrack = useCallback(
    (idx: number) => tracks[idx].toggleRecordPlay(),
    [tracks]
  );

  const stopTrack = useCallback(
    (idx: number) => tracks[idx].stop(),
    [tracks]
  );

  const clearTrack = useCallback(
    (idx: number) => {
      tracks[idx].clear();
      useTrackStore.getState().resetTrack(idx);
    },
    [tracks]
  );

  const undoTrack = useCallback(
    (idx: number) => {
      tracks[idx].undo();
      updateTrack(idx, {
        hasUndo: tracks[idx].hasUndo,
        hasRedo: tracks[idx].hasRedo,
      });
    },
    [tracks, updateTrack]
  );

  const redoTrack = useCallback(
    (idx: number) => {
      tracks[idx].redo();
      updateTrack(idx, {
        hasUndo: tracks[idx].hasUndo,
        hasRedo: tracks[idx].hasRedo,
      });
    },
    [tracks, updateTrack]
  );

  const setTrackVolume = useCallback(
    (idx: number, volume: number) => {
      tracks[idx].setVolume(volume);
      updateTrack(idx, { volume });
    },
    [tracks, updateTrack]
  );

  const setTrackPan = useCallback(
    (idx: number, pan: number) => {
      tracks[idx].setPan(pan);
      updateTrack(idx, { pan });
    },
    [tracks, updateTrack]
  );

  const allStartStop = useCallback(() => {
    // If any track is playing/recording/overdubbing, stop all. Otherwise start all that have phrases.
    const anyActive = tracks.some(
      (t) => t.state === 'playing' || t.state === 'recording' || t.state === 'overdubbing'
    );
    if (anyActive) {
      for (const t of tracks) {
        if (t.state !== 'empty') t.stop();
      }
    } else {
      for (const t of tracks) {
        if (t.hasPhrase && t.state === 'stopped') t.toggleRecordPlay();
      }
    }
  }, [tracks]);

  const allClear = useCallback(() => {
    for (let i = 0; i < 5; i++) {
      tracks[i].clear();
      useTrackStore.getState().resetTrack(i);
    }
  }, [tracks]);

  return {
    engine,
    tracks,
    initAudio,
    toggleTrack,
    stopTrack,
    clearTrack,
    undoTrack,
    redoTrack,
    setTrackVolume,
    setTrackPan,
    allStartStop,
    allClear,
  };
}
