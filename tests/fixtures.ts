import type { CardState, Direction, Word } from '../src/lib/types';
import { newCard } from '../src/lib/srs';

export const T = '2026-10-10';

export function word(p: Partial<Word> & Pick<Word, 'id' | 'el' | 'ru'>): Word {
  return { tags: [], source: 'base', addedBy: null, addedAt: T, ...p };
}

export function card(id: string, dir: Direction, patch: Partial<CardState> = {}): CardState {
  return { ...newCard(id, dir, T), ...patch };
}

export const WORDS: Word[] = [
  word({ id: 'grafo', el: 'γράφω', ru: 'писать', conj: 'A', tags: ['общение', 'учёба'] }),
  word({ id: 'agapao', el: 'αγαπάω', ru: 'любить', conj: 'B1', tags: ['чувства'] }),
  word({ id: 'mporo', el: 'μπορώ', ru: 'мочь', conj: 'B2', tags: ['повседневное'] }),
  word({ id: 'erchomai', el: 'έρχομαι', ru: 'приходить', conj: '-ομαι', tags: ['движение'] }),
  word({ id: 'psino', el: 'ψήνω', ru: 'жарить, печь', conj: 'A', tags: ['еда'], source: 'user', addedBy: 'Маша' }),
  word({ id: 'kolympao', el: 'κολυμπάω', ru: 'плавать', tags: ['движение'], source: 'user', addedBy: 'Саша' }),
];
