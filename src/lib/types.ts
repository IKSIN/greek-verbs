export type Conj = 'A' | 'B1' | 'B2' | '-ομαι' | 'irregular';
export type Direction = 'el-ru' | 'ru-el';
export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface Word {
  id: string;
  el: string;
  ru: string;
  forms?: { aorist?: string; future?: string };
  conj?: Conj;
  tags: string[];
  example?: { el: string; ru: string };
  source: 'base' | 'user';
  addedBy: string | null;
  addedAt: string;
}

export interface CardState {
  wordId: string;
  direction: Direction;
  interval: number;
  ease: number;
  due: string;
  reps: number;
  lapses: number;
  recent: Grade[];
}

export type ProgressMap = Record<string, CardState>;

export interface PracticeState {
  wordId: string;
  direction: Direction;
  level: number; // 0..5
  seen: number; // total answers in practice
  wrong: number; // total 'again' answers
  lastSeen: string; // ISO date YYYY-MM-DD
}
export type PracticeMap = Record<string, PracticeState>; // key = progressKey(wordId, direction)

export type WordChange =
  | { type: 'add'; word: Word }
  | { type: 'update'; word: Word }
  | { type: 'delete'; id: string; el: string };

export type KV = Pick<Storage, 'getItem' | 'setItem'>;

export const progressKey = (wordId: string, dir: Direction): string => `${wordId}:${dir}`;
