import type { Direction, KV } from './types';

export interface Settings { name: string; githubToken: string; newPerDay: number }

export const DEFAULT_SETTINGS: Settings = { name: '', githubToken: '', newPerDay: 10 };

const SETTINGS_KEY = 'greek.settings';
const NEW_SEEN_KEY = 'greek.newSeen';

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
