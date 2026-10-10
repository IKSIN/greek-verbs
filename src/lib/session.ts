import type { Direction, Grade, ProgressMap, Word } from './types';
import { progressKey } from './types';

export interface SessionItem { word: Word; isNew: boolean }

export interface SessionState {
  queue: SessionItem[];
  requeued: string[];
  seen: string[];
  errors: number;
  total: number;
  answered: number;
}

export function shuffle<T>(xs: T[], rng: () => number = Math.random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function split(words: Word[], progress: ProgressMap, dir: Direction, today: string) {
  const due: Word[] = [];
  const fresh: Word[] = [];
  for (const w of words) {
    const s = progress[progressKey(w.id, dir)];
    if (!s) fresh.push(w);
    else if (s.due <= today) due.push(w);
  }
  return { due, fresh };
}

export function buildQueue(
  words: Word[], progress: ProgressMap, dir: Direction, today: string, newLimit: number,
  rng: () => number = Math.random,
): SessionItem[] {
  const { due, fresh } = split(words, progress, dir, today);
  return [
    ...shuffle(due, rng).map((word) => ({ word, isNew: false })),
    ...fresh.slice(0, Math.max(0, newLimit)).map((word) => ({ word, isNew: true })),
  ];
}

export function countDue(words: Word[], progress: ProgressMap, dir: Direction, today: string) {
  const { due, fresh } = split(words, progress, dir, today);
  return { due: due.length, fresh: fresh.length };
}

export function startSession(items: SessionItem[]): SessionState {
  return { queue: items, requeued: [], seen: [], errors: 0, total: items.length, answered: 0 };
}

export function answerSession(s: SessionState, grade: Grade): SessionState {
  const [head, ...rest] = s.queue;
  if (!head) return s;
  const id = head.word.id;
  const again = grade === 'again';
  const requeue = again && !s.requeued.includes(id);
  return {
    ...s,
    queue: requeue ? [...rest, { ...head, isNew: false }] : rest,
    requeued: requeue ? [...s.requeued, id] : s.requeued,
    seen: s.seen.includes(id) ? s.seen : [...s.seen, id],
    errors: s.errors + (again ? 1 : 0),
    answered: s.answered + 1,
  };
}
