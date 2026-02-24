/**
 * useAudioEngine — React hook that initializes and exposes the AudioEngine + LoopTracks.
 *
 * Creates 5 LoopTrack instances, wires their state into Zustand, and provides
 * control functions for the UI and keyboard hooks.
 *
 * Phase 3: adds controls for all new loop features (DUB MODE, REVERSE, 1SHOT,
 * LOOP SYNC, QUANTIZE, AUTO REC, SPEED, MEASURE, BOUNCE, Mark/REC Back, etc.)
 */

import { useEffect, useRef, useCallback } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import { LoopTrack } from '../audio/LoopTrack';
import type { TrackState, TrackSettings } from '../audio/LoopTrack';
import { useTrackStore } from '../store/useTrackStore';
import { useTransportStore } from '../store/useTransportStore';

/* ─── Singleton track array ─── */
let trackInstances: LoopTrack[] | null = null;

function getOrCreateTracks(): LoopTrack[] {
  if (!trackInstances) {
    const updateTrack = useTrackStore.getState().updateTrack;
    trackInstances = Array.from({ length: 5 }, (_, i) =>
      new LoopTrack({
        id: i,
        onStateChange: (id: number, state: TrackState) => {
          const t = trackInstances![id];
          updateTrack(id, {
            state,
            hasPhrase: t.hasPhrase,
            hasUndo: t.hasUndo,
            hasRedo: t.hasRedo,
            hasMark: t.hasMark,
            hasRecBack: t.hasRecBack,
            duration: t.duration,
          });
        },
      })
    );
  }
  return trackInstances;
}

/* ─── Exported control interface ─── */

export interface AudioControls {
  engine: AudioEngine;
  tracks: LoopTrack[];

  /* Initialization */
  initAudio: () => Promise<void>;

  /* Track controls */
  toggleTrack: (idx: number) => void;
  stopTrack: (idx: number) => void;
  clearTrack: (idx: number) => void;
  undoTrack: (idx: number) => void;
  redoTrack: (idx: number) => void;
  setTrackVolume: (idx: number, volume: number) => void;
  setTrackPan: (idx: number, pan: number) => void;

  /* Phase 3: new track controls */
  updateTrackSettings: (idx: number, settings: Partial<TrackSettings>) => void;
  setMarkTrack: (idx: number) => void;
  clearMarkTrack: (idx: number) => void;
  markBackTrack: (idx: number) => void;
  recBackTrack: (idx: number) => void;

  /* Global controls */
  allStartStop: () => void;
  allClear: () => void;
}

export function useAudioEngine(): AudioControls {
  const engine = AudioEngine.getInstance();
  const tracks = getOrCreateTracks();
  const updateTrack = useTrackStore((s) => s.updateTrack);
  const positionRaf = useRef<number | null>(null);

  /* Sync engine tempo with transport store */
  useEffect(() => {
    let prev = useTransportStore.getState();
    engine.tempo = prev.tempo;
    engine.timeSignature = prev.timeSignature;
    engine.playMode = prev.playMode;

    const unsub = useTransportStore.subscribe((state) => {
      if (state.tempo !== prev.tempo) engine.tempo = state.tempo;
      if (state.timeSignature !== prev.timeSignature) engine.timeSignature = state.timeSignature;
      if (state.playMode !== prev.playMode) engine.playMode = state.playMode;
      prev = state;
    });

    return () => { unsub(); };
  }, [engine]);

  /* Position tracking loop — polls track positions at ~30fps */
  useEffect(() => {
    const tick = () => {
      for (let i = 0; i < 5; i++) {
        const t = tracks[i];
        if (
          t.state === 'playing' ||
          t.state === 'overdubbing' ||
          t.state === 'fading-out' ||
          t.state === 'stopping-at-loop-end'
        ) {
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

  /* ─── Control callbacks ─── */

  const initAudio = useCallback(async () => {
    await engine.resume();
    await engine.connectMicrophone();
    useTransportStore.getState().setMicConnected(true);
    useTransportStore.getState().setAudioReady(true);
  }, [engine]);

  const toggleTrack = useCallback(
    (idx: number) => {
      // PLAY MODE: SINGLE — stop other playing tracks
      if (engine.playMode === 'single') {
        for (let i = 0; i < 5; i++) {
          if (i !== idx) {
            const state = tracks[i].state;
            if (state === 'playing' || state === 'overdubbing') {
              tracks[i].stop();
            }
          }
        }
      }
      tracks[idx].toggleRecordPlay();
    },
    [engine, tracks]
  );

  const stopTrack = useCallback(
    (idx: number) => tracks[idx].stop(),
    [tracks]
  );

  const clearTrack = useCallback(
    (idx: number) => {
      tracks[idx].clear();
      useTrackStore.getState().resetTrack(idx);

      // Reset master loop if no synced tracks have audio
      const anyHasPhrase = tracks.some((t) => t.hasPhrase && t.settings.loopSync);
      if (!anyHasPhrase) {
        engine.resetMasterLoop();
      }
    },
    [engine, tracks]
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

  /* ─── Phase 3: new controls ─── */

  const updateTrackSettings = useCallback(
    (idx: number, settings: Partial<TrackSettings>) => {
      tracks[idx].updateSettings(settings);

      // Mirror settings to store for UI
      const trackSettings = tracks[idx].settings;
      updateTrack(idx, {
        reverse: trackSettings.reverse,
        oneShot: trackSettings.oneShot,
        dubMode: trackSettings.dubMode,
        startMode: trackSettings.startMode,
        stopMode: trackSettings.stopMode,
        fadeTimeIn: trackSettings.fadeTimeIn,
        fadeTimeOut: trackSettings.fadeTimeOut,
        loopSync: trackSettings.loopSync,
        tempoSyncSw: trackSettings.tempoSyncSw,
        tempoSyncMode: trackSettings.tempoSyncMode,
        speed: trackSettings.speed,
        measure: trackSettings.measure,
        quantize: trackSettings.quantize,
        autoRecSw: trackSettings.autoRecSw,
        autoRecSens: trackSettings.autoRecSens,
        bounceIn: trackSettings.bounceIn,
        recAction: trackSettings.recAction,
      });
    },
    [tracks, updateTrack]
  );

  const setMarkTrack = useCallback(
    (idx: number) => {
      tracks[idx].setMark();
      updateTrack(idx, { hasMark: tracks[idx].hasMark });
    },
    [tracks, updateTrack]
  );

  const clearMarkTrack = useCallback(
    (idx: number) => {
      tracks[idx].clearMark();
      updateTrack(idx, { hasMark: tracks[idx].hasMark });
    },
    [tracks, updateTrack]
  );

  const markBackTrack = useCallback(
    (idx: number) => {
      tracks[idx].markBack();
      updateTrack(idx, {
        hasMark: tracks[idx].hasMark,
        hasRecBack: tracks[idx].hasRecBack,
      });
    },
    [tracks, updateTrack]
  );

  const recBackTrack = useCallback(
    (idx: number) => {
      tracks[idx].recBack();
      updateTrack(idx, { hasRecBack: tracks[idx].hasRecBack });
    },
    [tracks, updateTrack]
  );

  const allStartStop = useCallback(() => {
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
    engine.resetMasterLoop();
  }, [engine, tracks]);

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
    updateTrackSettings,
    setMarkTrack,
    clearMarkTrack,
    markBackTrack,
    recBackTrack,
    allStartStop,
    allClear,
  };
}
