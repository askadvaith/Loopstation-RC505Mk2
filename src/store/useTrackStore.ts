/**
 * useTrackStore — Zustand store for the 5 loop track states.
 *
 * This store holds the reactive UI state for each track.
 * The actual audio processing lives in LoopTrack instances;
 * this store mirrors their state for React rendering.
 */

import { create } from 'zustand';
import type { TrackState } from '../audio/LoopTrack';

export interface TrackUIState {
  state: TrackState;
  volume: number;       // 0–2 (1 = unity)
  pan: number;          // -1 to 1
  hasPhrase: boolean;
  playbackPosition: number; // 0–1
  hasUndo: boolean;
  hasRedo: boolean;
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
  hasUndo: false,
  hasRedo: false,
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
