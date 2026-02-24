/**
 * useTransportStore — Global transport state (Phase 3).
 */

import { create } from 'zustand';

type PlayMode = 'multi' | 'single';

interface TransportState {
  tempo: number;              // BPM (40–300)
  timeSignature: number;      // beats per measure (2–15, default 4)
  isRhythmPlaying: boolean;
  currentMemory: number;      // 1–99
  micConnected: boolean;
  audioReady: boolean;
  playMode: PlayMode;

  setTempo: (bpm: number) => void;
  setTimeSignature: (ts: number) => void;
  setRhythmPlaying: (v: boolean) => void;
  setCurrentMemory: (id: number) => void;
  setMicConnected: (v: boolean) => void;
  setAudioReady: (v: boolean) => void;
  setPlayMode: (mode: PlayMode) => void;
}

export const useTransportStore = create<TransportState>((set) => ({
  tempo: 120,
  timeSignature: 4,
  isRhythmPlaying: false,
  currentMemory: 1,
  micConnected: false,
  audioReady: false,
  playMode: 'multi',

  setTempo: (bpm) => set({ tempo: Math.max(40, Math.min(300, bpm)) }),
  setTimeSignature: (ts) => set({ timeSignature: Math.max(2, Math.min(15, ts)) }),
  setRhythmPlaying: (v) => set({ isRhythmPlaying: v }),
  setCurrentMemory: (id) => set({ currentMemory: Math.max(1, Math.min(99, id)) }),
  setMicConnected: (v) => set({ micConnected: v }),
  setAudioReady: (v) => set({ audioReady: v }),
  setPlayMode: (mode) => set({ playMode: mode }),
}));
