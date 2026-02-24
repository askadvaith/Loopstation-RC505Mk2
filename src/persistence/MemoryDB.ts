/**
 * MemoryDB — IndexedDB persistence for loop station memories.
 *
 * Each memory contains:
 *   - 5 tracks of raw audio (Float32Array × 2 channels)
 *   - Settings JSON (track params, FX config, rhythm config, name, tempo)
 *
 * Uses the `idb` wrapper for a cleaner Promise-based API over IndexedDB.
 */

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'rc505mk2-loopstation';
const DB_VERSION = 1;

/* ─── Types ─── */

export interface TrackAudioData {
  left: Float32Array;
  right: Float32Array;
  length: number;
}

export interface MemorySettings {
  name: string;
  tempo: number;
  tracks: {
    volume: number;
    pan: number;
    reverse: boolean;
    oneShot: boolean;
    playLevel: number;
    dubMode: 'overdub' | 'replace1' | 'replace2';
    loopSync: boolean;
  }[];
  // Future: FX settings, rhythm settings
}

export interface MemoryData {
  id: number; // 1–99
  settings: MemorySettings;
  trackAudio: (TrackAudioData | null)[]; // index 0–4 for tracks 1–5
}

/* ─── Default memory template ─── */

function createDefaultSettings(): MemorySettings {
  return {
    name: '',
    tempo: 120,
    tracks: Array.from({ length: 5 }, () => ({
      volume: 1.0,
      pan: 0,
      reverse: false,
      oneShot: false,
      playLevel: 100,
      dubMode: 'overdub' as const,
      loopSync: true,
    })),
  };
}

/* ─── Database ─── */

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Store for memory settings (JSON-serializable)
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
        // Store for track audio blobs (raw PCM data)
        if (!db.objectStoreNames.contains('audio')) {
          db.createObjectStore('audio');
        }
      },
    });
  }
  return dbPromise;
}

/* ─── Public API ─── */

/**
 * Save a complete memory (settings + audio for all tracks).
 */
export async function saveMemory(memory: MemoryData): Promise<void> {
  const db = await getDB();

  // Save settings
  const tx1 = db.transaction('settings', 'readwrite');
  await tx1.store.put({
    id: memory.id,
    settings: memory.settings,
  });
  await tx1.done;

  // Save audio for each track
  const tx2 = db.transaction('audio', 'readwrite');
  for (let t = 0; t < 5; t++) {
    const key = `${memory.id}-track-${t}`;
    const audio = memory.trackAudio[t];
    if (audio) {
      await tx2.store.put(
        {
          left: audio.left,
          right: audio.right,
          length: audio.length,
        },
        key
      );
    } else {
      await tx2.store.delete(key);
    }
  }
  await tx2.done;
}

/**
 * Load a memory by id (1–99). Returns null if not found.
 */
export async function loadMemory(id: number): Promise<MemoryData | null> {
  const db = await getDB();

  const settingsRow = await db.get('settings', id);
  if (!settingsRow) return null;

  const trackAudio: (TrackAudioData | null)[] = [];
  for (let t = 0; t < 5; t++) {
    const key = `${id}-track-${t}`;
    const audio = await db.get('audio', key);
    trackAudio.push(audio || null);
  }

  return {
    id,
    settings: settingsRow.settings,
    trackAudio,
  };
}

/**
 * Clear a memory slot (delete settings + audio).
 */
export async function clearMemory(id: number): Promise<void> {
  const db = await getDB();

  const tx1 = db.transaction('settings', 'readwrite');
  await tx1.store.delete(id);
  await tx1.done;

  const tx2 = db.transaction('audio', 'readwrite');
  for (let t = 0; t < 5; t++) {
    await tx2.store.delete(`${id}-track-${t}`);
  }
  await tx2.done;
}

/**
 * List all saved memory IDs and their names.
 */
export async function listMemories(): Promise<{ id: number; name: string }[]> {
  const db = await getDB();
  const all = await db.getAll('settings');
  return all.map((row: { id: number; settings: MemorySettings }) => ({
    id: row.id,
    name: row.settings.name || `Memory ${String(row.id).padStart(2, '0')}`,
  }));
}

/**
 * Get a default, empty memory for a given slot.
 */
export function getDefaultMemory(id: number): MemoryData {
  return {
    id,
    settings: createDefaultSettings(),
    trackAudio: [null, null, null, null, null],
  };
}
