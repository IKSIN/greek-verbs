import type { CardState, Direction, Grade } from './types';
import { addDays } from './date';

export const START_EASE = 2.5;
export const MIN_EASE = 1.3;

export function newCard(wordId: string, direction: Direction, today: string): CardState {
  return { wordId, direction, interval: 0, ease: START_EASE, due: today, reps: 0, lapses: 0, recent: [] };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function schedule(s: CardState, grade: Grade, today: string): CardState {
  let { interval, ease, reps, lapses } = s;
  if (grade === 'again') {
    reps = 0;
    interval = 1;
    ease -= 0.2;
    lapses += 1;
  } else if (grade === 'hard') {
    interval = Math.max(1, Math.round(interval * 1.2));
    ease -= 0.15;
  } else {
    const base = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease);
    interval = grade === 'easy' ? Math.max(1, Math.round(base * 1.3)) : base;
    if (grade === 'easy') ease += 0.15;
    reps += 1;
  }
  ease = Math.max(MIN_EASE, round2(ease));
  return {
    ...s,
    interval,
    ease,
    reps,
    lapses,
    due: addDays(today, interval),
    recent: [...s.recent, grade].slice(-5),
  };
}
