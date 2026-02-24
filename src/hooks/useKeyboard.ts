/**
 * useKeyboard — Keyboard shortcut bindings for loopstation control.
 *
 * Keys:
 *   1-5      → Toggle record/play/overdub for track 1-5
 *   Q-T      → Stop track 1-5
 *   Shift+1-5 → Clear track 1-5
 *   Space    → All Start/Stop
 *   Z        → Undo current track
 *   X        → Redo current track
 */

import { useEffect } from 'react';
import type { AudioControls } from './useAudioEngine';
import { useTrackStore } from '../store/useTrackStore';

export function useKeyboard(controls: AudioControls): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const currentTrack = useTrackStore.getState().currentTrack;

      // Track toggle: 1-5
      if (!e.shiftKey && key >= '1' && key <= '5') {
        e.preventDefault();
        controls.toggleTrack(Number(key) - 1);
        return;
      }

      // Track stop: q, w, e, r, t
      const stopKeys = ['q', 'w', 'e', 'r', 't'];
      if (!e.shiftKey && stopKeys.includes(key)) {
        e.preventDefault();
        controls.stopTrack(stopKeys.indexOf(key));
        return;
      }

      // Track clear: Shift + 1-5
      if (e.shiftKey && key >= '1' && key <= '5') {
        e.preventDefault();
        controls.clearTrack(Number(key) - 1);
        return;
      }

      // All Start/Stop: Space
      if (key === ' ') {
        e.preventDefault();
        controls.allStartStop();
        return;
      }

      // Undo: Z
      if (key === 'z' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        controls.undoTrack(currentTrack);
        return;
      }

      // Redo: X
      if (key === 'x' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        controls.redoTrack(currentTrack);
        return;
      }

      // All Clear: Shift+Backspace
      if (e.shiftKey && key === 'backspace') {
        e.preventDefault();
        controls.allClear();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [controls]);
}
