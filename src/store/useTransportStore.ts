/**
 * useTransportStore — Global transport state (tempo, playing, etc.)
 */

import { create } from 'zustand';

interface TransportState {
  tempo: number;           // BPM (40–300)
  isRhythmPlaying: boolean;
  currentMemory: number;   // 1–99
  micConnected: boolean;
  audioReady: boolean;

  setTempo: (bpm: number) => void;
  setRhythmPlaying: (v: boolean) => void;
  setCurrentMemory: (id: number) => void;
  setMicConnected: (v: boolean) => void;
  setAudioReady: (v: boolean) => void;
}

export const useTransportStore = create<TransportState>((set) => ({
  tempo: 120,
  isRhythmPlaying: false,
  currentMemory: 1,
  micConnected: false,
  audioReady: false,

  setTempo: (bpm) => set({ tempo: Math.max(40, Math.min(300, bpm)) }),
  setRhythmPlaying: (v) => set({ isRhythmPlaying: v }),
  setCurrentMemory: (id) => set({ currentMemory: Math.max(1, Math.min(99, id)) }),
  setMicConnected: (v) => set({ micConnected: v }),
  setAudioReady: (v) => set({ audioReady: v }),
}));
