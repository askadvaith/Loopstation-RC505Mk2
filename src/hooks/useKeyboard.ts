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
 *
 *   When an FX slot is open for editing (real-time parameter editor, mirrors the
 *   hardware's CURSOR + VALUE dial):
 *   ← / →      → Move the cursor between the effect's parameters
 *   ↑ / ↓      → Change the focused parameter's value (Shift = coarse step)
 */

import { useEffect } from 'react';
import type { AudioControls } from './useAudioEngine';
import { useTrackStore } from '../store/useTrackStore';
import { useFXStore } from '../store/useFXStore';
import type { DubMode } from '../audio/LoopTrack';
import type { FXBankId } from '../audio/effects';
import { getEffectTypeDef } from '../audio/effects';

const DUB_MODE_CYCLE: DubMode[] = ['overdub', 'replace1', 'replace2'];
const FX_BANK_KEYS: FXBankId[] = ['A', 'B', 'C', 'D'];

/**
 * Real-time parameter editor: apply an arrow key to the currently-open FX slot.
 * ← / → move the CURSOR (focused parameter); ↑ / ↓ change its VALUE. This is the
 * software stand-in for the hardware's cursor buttons + VALUE dial, and works
 * for any effect because it is driven entirely by the effect's param metadata.
 * Returns true if an FX slot was open and the key was consumed.
 */
function handleParamEditor(
  key: string,
  shift: boolean,
  controls: AudioControls,
): boolean {
  const fx = useFXStore.getState();
  const target = fx.editTarget;
  if (!target) return false; // no FX open → let the arrows do their normal thing

  const isTrack = target.context === 'track';
  const trackIdx = isTrack ? (target as { trackIdx: number }).trackIdx : 0;
  const chain = isTrack ? fx.trackFX[trackIdx] : fx.inputFX;
  const slot = chain.banks[target.bankId].slots[target.slotIdx];
  const params = getEffectTypeDef(slot.fxType)?.params ?? [];
  if (params.length === 0) return true; // FX open but has no params — still consume

  // ← / → : move the cursor across the parameters.
  if (key === 'arrowleft' || key === 'arrowright') {
    const dir = key === 'arrowright' ? 1 : -1;
    const next = Math.min(params.length - 1, Math.max(0, fx.focusedParamIdx + dir));
    fx.setFocusedParamIdx(next);
    return true;
  }

  // ↑ / ↓ : change the focused parameter's value.
  const pIdx = Math.min(params.length - 1, Math.max(0, fx.focusedParamIdx));
  const def = params[pIdx];
  const current = slot.params[def.name] ?? def.default;
  const dir = key === 'arrowup' ? 1 : -1;

  // Choice params (e.g. ROBOT NOTE) step one entry at a time; numeric params
  // step by their declared `step`, with Shift giving a coarse ~10%-of-range jump.
  let step = def.step ?? 1;
  if (!def.choices && shift) {
    step = Math.max(step, Math.round((def.max - def.min) / 10));
  }
  const nextVal = Math.min(def.max, Math.max(def.min, current + dir * step));
  if (nextVal !== current) {
    controls.setFXSlotParam(
      target.context, trackIdx, target.bankId, target.slotIdx, def.name, nextVal
    );
  }
  return true;
}

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

      // ── Real-time parameter editor (CURSOR + VALUE) ──
      // When an FX slot is open, the arrow keys behave like the hardware: ← →
      // move the cursor across the effect's parameters and ↑ ↓ change the
      // focused one's value. This is a *general* mechanism — it works for every
      // effect, which is how e.g. the ROBOT NOTE is played as a live melody.
      // Handled BEFORE the e.repeat guard on purpose, so holding ↑/↓ sweeps the
      // value continuously the way turning the VALUE dial would.
      if (
        (key === 'arrowleft' || key === 'arrowright' ||
         key === 'arrowup' || key === 'arrowdown') &&
        !e.ctrlKey && !e.metaKey && !e.altKey
      ) {
        if (handleParamEditor(key, e.shiftKey, controls)) {
          e.preventDefault();
        }
        return;
      }

      // Ignore OS key auto-repeat. These keys emulate the RC-505's momentary
      // footswitches/pads: every binding is a discrete toggle, so a held key
      // must fire exactly once. Without this, holding [1] for longer than the
      // system repeat delay (~250-500ms) fires a second keydown that toggles
      // straight back out of the state you just entered — a held record key
      // starts and then immediately stops recording, leaving a phrase a few
      // hundred milliseconds long and a nonsense derived tempo.
      if (e.repeat) return;

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

      // Input FX bank toggle: F1–F4 → Bank A–D
      if (key === 'f1' || key === 'f2' || key === 'f3' || key === 'f4') {
        e.preventDefault();
        const bankIdx = parseInt(key.slice(1)) - 1;
        const bankId = FX_BANK_KEYS[bankIdx];
        if (bankId) controls.toggleInputFXBank(bankId);
        return;
      }

      // Track FX bank toggle: F5–F8 → Bank A–D
      if (key === 'f5' || key === 'f6' || key === 'f7' || key === 'f8') {
        e.preventDefault();
        const bankIdx = parseInt(key.slice(1)) - 5;
        const bankId = FX_BANK_KEYS[bankIdx];
        if (bankId) controls.toggleTrackFXBank(currentTrack, bankId);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [controls]);
}
