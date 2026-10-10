import { openDB } from 'idb';
import type { CardState, ProgressMap } from './types';
import { progressKey } from './types';

export interface ProgressStore {
  getAll(): Promise<ProgressMap>;
  put(s: CardState): Promise<void>;
  deleteWord(wordId: string): Promise<void>;
  exportJSON(): Promise<string>;
  importJSON(json: string): Promise<number>;
  getCache<T>(key: string): Promise<T | undefined>;
  setCache(key: string, value: unknown): Promise<void>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCardState(x: unknown): x is CardState {
  const c = x as CardState;
  return (
    !!c && typeof c === 'object' &&
    typeof c.wordId === 'string' && !!c.wordId &&
    (c.direction === 'el-ru' || c.direction === 'ru-el') &&
    [c.interval, c.ease, c.reps, c.lapses].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    typeof c.due === 'string' && DATE.test(c.due) &&
    Array.isArray(c.recent)
  );
}

export async function openProgressStore(name = 'greek'): Promise<ProgressStore> {
  const db = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('progress');
      db.createObjectStore('cache');
    },
  });

  return {
    async getAll() {
      const out: ProgressMap = {};
      for (const c of (await db.getAll('progress')) as CardState[]) out[progressKey(c.wordId, c.direction)] = c;
      return out;
    },
    async put(s) {
      await db.put('progress', s, progressKey(s.wordId, s.direction));
    },
    async deleteWord(wordId) {
      const tx = db.transaction('progress', 'readwrite');
      await Promise.all([
        tx.store.delete(progressKey(wordId, 'el-ru')),
        tx.store.delete(progressKey(wordId, 'ru-el')),
        tx.done,
      ]);
    },
    async exportJSON() {
      const cards = await db.getAll('progress');
      return JSON.stringify({ app: 'greek', version: 1, exportedAt: new Date().toISOString(), cards }, null, 2);
    },
    async importJSON(json) {
      let data: { app?: unknown; cards?: unknown };
      try {
        data = JSON.parse(json);
      } catch {
        throw new Error('Файл не является JSON');
      }
      if (!data || data.app !== 'greek' || !Array.isArray(data.cards) || !data.cards.every(isCardState)) {
        throw new Error('Неверный формат файла прогресса');
      }
      const cards = data.cards as CardState[];
      const tx = db.transaction('progress', 'readwrite');
      await Promise.all([
        tx.store.clear(),
        ...cards.map((c) => tx.store.put(c, progressKey(c.wordId, c.direction))),
        tx.done,
      ]);
      return cards.length;
    },
    async getCache<T>(key: string) {
      return (await db.get('cache', key)) as T | undefined;
    },
    async setCache(key, value) {
      await db.put('cache', value, key);
    },
  };
}
