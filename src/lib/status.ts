import type { CardState } from './types';

export type Status = 'new' | 'learning' | 'learned';
export const LEARNED_INTERVAL = 21;
export const HARD_AGAINS = 3;

export function statusOf(s: CardState | undefined): Status {
  if (!s) return 'new';
  return s.interval >= LEARNED_INTERVAL ? 'learned' : 'learning';
}

export function isHard(s: CardState | undefined): boolean {
  return !!s && s.recent.filter((g) => g === 'again').length >= HARD_AGAINS;
}
