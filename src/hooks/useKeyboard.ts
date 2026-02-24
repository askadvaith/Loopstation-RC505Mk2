/**
 * useKeyboard — Keyboard shortcut bindings for loopstation control.
 *
 * Keys:
 *   1-5        → Toggle record/play/overdub for track 1-5
 *   Q-T        → Stop track 1-5
 *   Shift+1-5  → Clear track 1-5
 *   Space      → All Start/Stop
 *   Z          → Undo current track
 *   X          → Redo current track
 *   R          → Toggle reverse on current track
 *   O          → Toggle one-shot on current track
 *   D          → Cycle dub mode on current track
 *   A          → Toggle auto-rec on current track
 *   M          → Set mark on current track
 *   Shift+M    → Mark back on current track
 *   B          → REC back on current track
 *   Shift+Backspace → All Clear
 */

import { useEffect } from 'react';
import type { AudioControls } from './useAudioEngine';
import { useTrackStore } from '../store/useTrackStore';
import type { DubMode } from '../audio/LoopTrack';

const DUB_MODE_CYCLE: DubMode[] = ['overdub', 'replace1', 'replace2'];

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
      if (!e.shiftKey && !e.ctrlKey && stopKeys.includes(key)) {
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
      if (key === 'z' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
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

      // Toggle reverse: R (only if not in stop-key mode)
      if (key === 'r' && e.ctrlKey) {
        e.preventDefault();
        const track = useTrackStore.getState().tracks[currentTrack];
        controls.updateTrackSettings(currentTrack, { reverse: !track.reverse });
        return;
      }

      // Toggle one-shot: O
      if (key === 'o' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const track = useTrackStore.getState().tracks[currentTrack];
        controls.updateTrackSettings(currentTrack, { oneShot: !track.oneShot });
        return;
      }

      // Cycle dub mode: D
      if (key === 'd' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const track = useTrackStore.getState().tracks[currentTrack];
        const idx = DUB_MODE_CYCLE.indexOf(track.dubMode);
        const next = DUB_MODE_CYCLE[(idx + 1) % DUB_MODE_CYCLE.length];
        controls.updateTrackSettings(currentTrack, { dubMode: next });
        return;
      }

      // Toggle auto-rec: A
      if (key === 'a' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const track = useTrackStore.getState().tracks[currentTrack];
        controls.updateTrackSettings(currentTrack, { autoRecSw: !track.autoRecSw });
        return;
      }

      // Set mark: M
      if (key === 'm' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        controls.setMarkTrack(currentTrack);
        return;
      }

      // Mark back: Shift+M
      if (key === 'm' && e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        controls.markBackTrack(currentTrack);
        return;
      }

      // REC back: B
      if (key === 'b' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        controls.recBackTrack(currentTrack);
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
