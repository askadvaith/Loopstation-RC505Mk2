/**
 * useTrackStore — Zustand store for the 5 loop track states (Phase 3).
 *
 * Mirrors the LoopTrack instances' state for React rendering.
 * Includes all Phase 3 track settings.
 */

import { create } from 'zustand';
import type {
  TrackState,
  DubMode,
  StartMode,
  StopMode,
  SpeedMode,
  MeasureSetting,
  QuantizeMode,
  RecAction,
} from '../audio/LoopTrack';

export interface TrackUIState {
  /* Core state */
  state: TrackState;
  volume: number;          // 0–2 (1 = unity)
  pan: number;             // -1 to 1
  hasPhrase: boolean;
  playbackPosition: number; // 0–1
  duration: number;         // seconds

  /* Undo/Redo/Mark */
  hasUndo: boolean;
  hasRedo: boolean;
  hasMark: boolean;
  hasRecBack: boolean;

  /* Track Settings */
  reverse: boolean;
  oneShot: boolean;
  dubMode: DubMode;
  startMode: StartMode;
  stopMode: StopMode;
  fadeTimeIn: number;
  fadeTimeOut: number;
  loopSync: boolean;
  tempoSyncSw: boolean;
  tempoSyncMode: 'pitch' | 'xfade';
  speed: SpeedMode;
  measure: MeasureSetting;
  quantize: QuantizeMode;
  autoRecSw: boolean;
  autoRecSens: number;
  bounceIn: boolean;
  recAction: RecAction;
}

interface TrackStoreState {
  tracks: TrackUIState[];
  currentTrack: number; // 0-indexed (0–4)
  setCurrentTrack: (idx: number) => void;
  updateTrack: (idx: number, partial: Partial<TrackUIState>) => void;
  resetTrack: (idx: number) => void;
}

const defaultTrackState = (): TrackUIState => ({
  state: 'empty',
  volume: 1.0,
  pan: 0,
  hasPhrase: false,
  playbackPosition: 0,
  duration: 0,
  hasUndo: false,
  hasRedo: false,
  hasMark: false,
  hasRecBack: false,
  reverse: false,
  oneShot: false,
  dubMode: 'overdub',
  startMode: 'immediate',
  stopMode: 'immediate',
  fadeTimeIn: 2,
  fadeTimeOut: 2,
  loopSync: true,
  tempoSyncSw: false,
  tempoSyncMode: 'pitch',
  speed: 'normal',
  measure: 'auto',
  quantize: 'off',
  autoRecSw: false,
  autoRecSens: 50,
  bounceIn: false,
  recAction: 'rec-play',
});

export const useTrackStore = create<TrackStoreState>((set) => ({
  tracks: Array.from({ length: 5 }, defaultTrackState),
  currentTrack: 0,

  setCurrentTrack: (idx) => set({ currentTrack: idx }),

  updateTrack: (idx, partial) =>
    set((s) => {
      const tracks = [...s.tracks];
      tracks[idx] = { ...tracks[idx], ...partial };
      return { tracks };
    }),

  resetTrack: (idx) =>
    set((s) => {
      const tracks = [...s.tracks];
      tracks[idx] = defaultTrackState();
      return { tracks };
    }),
}));
