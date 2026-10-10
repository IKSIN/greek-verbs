import type { Conj, Direction, PracticeMap, ProgressMap, Word } from './types';
import { progressKey } from './types';
import { stripAccents } from './answer';
import { practiceStatusOf, type PracticeStatus } from './practice';
import { isHard, statusOf, type Status } from './status';

export type StatusFilter = Status | 'hard';

export interface WordFilter {
  query: string;
  conj: Conj[];
  tags: string[];
  source: ('base' | 'user')[];
  addedBy: string[];
  status: StatusFilter[];
  practice: PracticeStatus[];
}

export const emptyFilter = (): WordFilter => ({ query: '', conj: [], tags: [], source: [], addedBy: [], status: [], practice: [] });

export function isFilterActive(f: WordFilter): boolean {
  return !!f.query.trim() || [f.conj, f.tags, f.source, f.addedBy, f.status, f.practice].some((g) => g.length > 0);
}

export const searchKey = (s: string): string => stripAccents(s.toLocaleLowerCase('el'));

export function applyFilter(words: Word[], f: WordFilter, progress: ProgressMap, dir: Direction, practice: PracticeMap = {}): Word[] {
  const q = searchKey(f.query.trim());
  return words.filter((w) => {
    if (q && !searchKey(w.el).includes(q) && !searchKey(w.ru).includes(q)) return false;
    if (f.conj.length && !(w.conj && f.conj.includes(w.conj))) return false;
    if (f.tags.length && !w.tags.some((t) => f.tags.includes(t))) return false;
    if (f.source.length && !f.source.includes(w.source)) return false;
    if (f.addedBy.length && !(w.addedBy && f.addedBy.includes(w.addedBy))) return false;
    if (f.status.length) {
      const s = progress[progressKey(w.id, dir)];
      if (!f.status.some((st) => (st === 'hard' ? isHard(s) : statusOf(s) === st))) return false;
    }
    if (f.practice.length && !f.practice.includes(practiceStatusOf(practice[progressKey(w.id, dir)]))) return false;
    return true;
  });
}

const sortRu = (xs: Iterable<string>) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'ru'));

export function facets(words: Word[]): { tags: string[]; authors: string[] } {
  return {
    tags: sortRu(words.flatMap((w) => w.tags)),
    authors: sortRu(words.flatMap((w) => (w.addedBy ? [w.addedBy] : []))),
  };
}
