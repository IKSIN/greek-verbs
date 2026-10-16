import type { Direction, KV } from './types';
import { emptyFilter, type WordFilter } from './filters';
import { CONJ_VALUES, POS_VALUES } from './validate';

export interface Settings { name: string; githubToken: string; newPerDay: number }

export const DEFAULT_SETTINGS: Settings = { name: '', githubToken: '', newPerDay: 10 };

const SETTINGS_KEY = 'greek.settings';
const NEW_SEEN_KEY = 'greek.newSeen';
const PRACTICE_FILTER_KEY = 'greek.practiceFilter';

export function readJSON<T>(storage: KV, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function loadSettings(storage: KV = localStorage): Settings {
  const raw = readJSON<Partial<Settings>>(storage, SETTINGS_KEY) ?? {};
  const n = Number(raw.newPerDay);
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    githubToken: typeof raw.githubToken === 'string' ? raw.githubToken : '',
    newPerDay: Number.isFinite(n) && n >= 0 ? Math.min(100, Math.floor(n)) : DEFAULT_SETTINGS.newPerDay,
  };
}

export function saveSettings(s: Settings, storage: KV = localStorage): void {
  storage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

interface NewSeen { date: string; counts: Partial<Record<Direction, number>> }

export function newSeenToday(dir: Direction, today: string, storage: KV = localStorage): number {
  const r = readJSON<NewSeen>(storage, NEW_SEEN_KEY);
  return r && r.date === today ? (r.counts?.[dir] ?? 0) : 0;
}

export function incNewSeen(dir: Direction, today: string, storage: KV = localStorage): void {
  const r = readJSON<NewSeen>(storage, NEW_SEEN_KEY);
  const counts = r && r.date === today ? { ...r.counts } : {};
  counts[dir] = (counts[dir] ?? 0) + 1;
  storage.setItem(NEW_SEEN_KEY, JSON.stringify({ date: today, counts }));
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const known = <T extends string>(v: unknown, allowed: readonly T[]): T[] => strings(v).filter((x): x is T => (allowed as readonly string[]).includes(x));

// Фильтр тренировки ∞: берём только валидные поля, остальное — пусто (формат мог устареть)
export function loadPracticeFilter(storage: KV = localStorage): WordFilter {
  const raw = readJSON<Record<string, unknown>>(storage, PRACTICE_FILTER_KEY);
  const f = emptyFilter();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return f;
  if (typeof raw.query === 'string') f.query = raw.query;
  f.tags = strings(raw.tags);
  f.addedBy = strings(raw.addedBy);
  f.pos = known(raw.pos, POS_VALUES);
  f.conj = known(raw.conj, CONJ_VALUES);
  f.practice = known(raw.practice, ['not-started', 'in-progress', 'mastered'] as const);
  f.status = known(raw.status, ['new', 'learning', 'learned', 'hard'] as const);
  f.source = known(raw.source, ['base', 'user'] as const);
  return f;
}

export function savePracticeFilter(f: WordFilter, storage: KV = localStorage): void {
  try {
    storage.setItem(PRACTICE_FILTER_KEY, JSON.stringify(f));
  } catch {
    /* приватный режим / переполнение — фильтр просто не переживёт перезапуск */
  }
}
