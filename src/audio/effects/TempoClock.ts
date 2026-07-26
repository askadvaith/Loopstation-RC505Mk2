/**
 * TempoClock — a tiny shared tempo reference for tempo-synced effects.
 *
 * Effects (e.g. the Slicers) need the current BPM to lock their step timing to
 * the song tempo, but they are constructed generically (sometimes against an
 * OfflineAudioContext for metadata extraction) and must not reach into the
 * AudioEngine singleton — doing so at module-load time would force a real
 * AudioContext to be created before a user gesture.
 *
 * Instead the engine writes tempo here whenever it changes, and effects read it.
 */

export const tempoClock = {
  /** Beats per minute. */
  bpm: 120,
  /** Beats per measure (time signature numerator). */
  timeSignature: 4,
};

/** Milliseconds per beat (quarter note) at the current tempo. */
export function msPerBeat(): number {
  return 60000 / (tempoClock.bpm || 120);
}

/**
 * Note-value → fraction of a beat (quarter note = 1). Used by tempo-synced FX.
 * Triplets are 2/3 of the straight value; dotted are 1.5×.
 */
export const NOTE_DIVISIONS: Record<string, number> = {
  '1/4': 1,        // quarter
  '1/4T': 2 / 3,   // quarter triplet
  '1/8': 0.5,      // eighth (quaver)
  '1/8T': 1 / 3,   // eighth triplet
  '1/16': 0.25,    // sixteenth
  '1/16T': 1 / 6,  // sixteenth triplet
  '1/32': 0.125,   // thirty-second
};

/** Ordered note-value labels for choice params. */
export const NOTE_VALUE_LABELS = Object.keys(NOTE_DIVISIONS);

/** Duration (ms) of one step at the given note-value label. */
export function noteValueMs(label: string): number {
  const frac = NOTE_DIVISIONS[label] ?? 0.5;
  return msPerBeat() * frac;
}
