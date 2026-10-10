import { openDB } from 'idb';
import type { CardState, PracticeMap, PracticeState, ProgressMap } from './types';
import { progressKey } from './types';

export interface ProgressStore {
  getAll(): Promise<ProgressMap>;
  put(s: CardState): Promise<void>;
  deleteWord(wordId: string): Promise<void>;
  exportJSON(): Promise<string>;
  importJSON(json: string): Promise<number>;
  getAllPractice(): Promise<PracticeMap>;
  putPractice(s: PracticeState): Promise<void>;
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

function isPracticeState(x: unknown): x is PracticeState {
  const p = x as PracticeState;
  return (
    !!p && typeof p === 'object' &&
    typeof p.wordId === 'string' && !!p.wordId &&
    (p.direction === 'el-ru' || p.direction === 'ru-el') &&
    Number.isInteger(p.level) && p.level >= 0 && p.level <= 5 &&
    [p.seen, p.wrong].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0) &&
    typeof p.lastSeen === 'string' && DATE.test(p.lastSeen)
  );
}

export async function openProgressStore(name = 'greek'): Promise<ProgressStore> {
  const db = await openDB(name, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('progress');
        db.createObjectStore('cache');
      }
      if (oldVersion < 2) db.createObjectStore('practice');
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
    async getAllPractice() {
      const out: PracticeMap = {};
      for (const p of (await db.getAll('practice')) as PracticeState[]) out[progressKey(p.wordId, p.direction)] = p;
      return out;
    },
    async putPractice(s) {
      await db.put('practice', s, progressKey(s.wordId, s.direction));
    },
    async deleteWord(wordId) {
      const tx = db.transaction(['progress', 'practice'], 'readwrite');
      await Promise.all([
        ...(['progress', 'practice'] as const).flatMap((n) => [
          tx.objectStore(n).delete(progressKey(wordId, 'el-ru')),
          tx.objectStore(n).delete(progressKey(wordId, 'ru-el')),
        ]),
        tx.done,
      ]);
    },
    async exportJSON() {
      const tx = db.transaction(['progress', 'practice'], 'readonly');
      const [cards, practice] = await Promise.all([tx.objectStore('progress').getAll(), tx.objectStore('practice').getAll()]);
      return JSON.stringify({ app: 'greek', version: 2, exportedAt: new Date().toISOString(), cards, practice }, null, 2);
    },
    async importJSON(json) {
      let data: { app?: unknown; cards?: unknown; practice?: unknown };
      try {
        data = JSON.parse(json);
      } catch {
        throw new Error('Файл не является JSON');
      }
      if (!data || data.app !== 'greek' || !Array.isArray(data.cards) || !data.cards.every(isCardState)) {
        throw new Error('Неверный формат файла прогресса');
      }
      if (data.practice !== undefined && (!Array.isArray(data.practice) || !data.practice.every(isPracticeState))) {
        throw new Error('Неверный формат файла прогресса');
      }
      const cards = data.cards as CardState[];
      const practice = data.practice as PracticeState[] | undefined;
      const tx = db.transaction(['progress', 'practice'], 'readwrite');
      const ps = tx.objectStore('progress');
      const pr = tx.objectStore('practice');
      await Promise.all([
        ps.clear(),
        ...cards.map((c) => ps.put(c, progressKey(c.wordId, c.direction))),
        ...(practice ? [pr.clear(), ...practice.map((p) => pr.put(p, progressKey(p.wordId, p.direction)))] : []),
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
