import type { Direction, Grade, PracticeMap, PracticeState, Word } from './types';
import { progressKey } from './types';

export const MAX_LEVEL = 5;
/** Слово с ответом «снова» показывается опять после стольких других ответов. */
export const RETRY_AFTER = 3;

export const levelWeight = (level: number): number => 2 ** (MAX_LEVEL - level);

const STEP: Record<Grade, number> = { easy: 2, good: 1, hard: 0, again: 0 };

export function applyPracticeAnswer(
  prev: PracticeState | undefined, wordId: string, direction: Direction, grade: Grade, today: string,
): PracticeState {
  const base = prev ?? { level: 0, seen: 0, wrong: 0 };
  const level = grade === 'again' ? 0 : Math.min(MAX_LEVEL, Math.max(0, base.level + STEP[grade]));
  return {
    wordId, direction, level,
    seen: base.seen + 1,
    wrong: base.wrong + (grade === 'again' ? 1 : 0),
    lastSeen: today,
  };
}

export type PracticeStatus = 'not-started' | 'in-progress' | 'mastered';

export function practiceStatusOf(p?: PracticeState): PracticeStatus {
  if (!p) return 'not-started';
  return p.level === MAX_LEVEL ? 'mastered' : 'in-progress';
}

export interface PracticeSession {
  answered: number;
  errors: number;
  levelUps: number;
  lastId: string | null;
  retry: { id: string; at: number }[];
}

export const startPractice = (): PracticeSession => ({ answered: 0, errors: 0, levelUps: 0, lastId: null, retry: [] });

export function nextPracticeWord(
  s: PracticeSession, words: Word[], practice: PracticeMap, dir: Direction, rng: () => number = Math.random,
): Word | null {
  if (!words.length) return null;
  let due: { id: string; at: number } | undefined;
  for (const r of s.retry) {
    if (r.at <= s.answered && r.id !== s.lastId && words.some((w) => w.id === r.id) && (!due || r.at < due.at)) due = r;
  }
  if (due) return words.find((w) => w.id === due.id) ?? null;

  const cands = words.length > 1 ? words.filter((w) => w.id !== s.lastId) : words;
  const weights = cands.map((w) => levelWeight(practice[progressKey(w.id, dir)]?.level ?? 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i];
    if (r < 0) return cands[i];
  }
  return cands[cands.length - 1];
}

export function answerPractice(
  s: PracticeSession, wordId: string, grade: Grade, prevLevel: number, newLevel: number,
): PracticeSession {
  const answered = s.answered + 1;
  const retry = s.retry.filter((r) => r.id !== wordId);
  if (grade === 'again') retry.push({ id: wordId, at: answered + RETRY_AFTER });
  return {
    answered,
    errors: s.errors + (grade === 'again' ? 1 : 0),
    levelUps: s.levelUps + (newLevel > prevLevel ? 1 : 0),
    lastId: wordId,
    retry,
  };
}
