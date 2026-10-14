import { describe, it, expect } from 'vitest';
import { applyFilter, emptyFilter, facets, isFilterActive, type WordFilter } from '../src/lib/filters';
import { isHard, statusOf } from '../src/lib/status';
import type { PracticeMap, ProgressMap } from '../src/lib/types';
import type { PracticeStatus } from '../src/lib/practice';
import { WORDS, card } from './fixtures';

const ids = (f: Partial<WordFilter>, progress: ProgressMap = {}, dir: 'el-ru' | 'ru-el' = 'el-ru') =>
  applyFilter(WORDS, { ...emptyFilter(), ...f }, progress, dir).map((w) => w.id);

const PROGRESS: ProgressMap = {
  'grafo:el-ru': card('grafo', 'el-ru', { interval: 30, reps: 4 }),
  'agapao:el-ru': card('agapao', 'el-ru', { interval: 2, recent: ['again', 'good', 'again', 'again'] }),
};

describe('status', () => {
  it('no record -> new', () => expect(statusOf(undefined)).toBe('new'));
  it('interval < 21 -> learning', () => expect(statusOf(card('x', 'el-ru', { interval: 20 }))).toBe('learning'));
  it('interval >= 21 -> learned', () => expect(statusOf(card('x', 'el-ru', { interval: 21 }))).toBe('learned'));
  it('hard needs 3 agains in recent', () => {
    expect(isHard(card('x', 'el-ru', { recent: ['again', 'again', 'good'] }))).toBe(false);
    expect(isHard(card('x', 'el-ru', { recent: ['again', 'again', 'good', 'again'] }))).toBe(true);
    expect(isHard(undefined)).toBe(false);
  });
});

describe('applyFilter', () => {
  it('empty filter returns everything', () => expect(ids({})).toHaveLength(6));
  it('search greek without accents', () => expect(ids({ query: 'γραφω' })).toEqual(['grafo']));
  it('search greek prefix', () => expect(ids({ query: 'γρα' })).toEqual(['grafo']));
  it('search russian case-insensitive', () => expect(ids({ query: 'ЛЮБ' })).toEqual(['agapao']));
  it('conj OR within group', () => expect(ids({ conj: ['A', 'B1'] })).toEqual(['grafo', 'agapao', 'psino']));
  it('tags OR within group', () =>
    expect(ids({ tags: ['движение', 'еда'] })).toEqual(['erchomai', 'psino', 'kolympao']));
  it('source', () => expect(ids({ source: ['user'] })).toEqual(['psino', 'kolympao']));
  it('addedBy', () => expect(ids({ addedBy: ['Маша'] })).toEqual(['psino']));
  it('status new', () =>
    expect(ids({ status: ['new'] }, PROGRESS)).toEqual(['mporo', 'erchomai', 'psino', 'kolympao']));
  it('status learned', () => expect(ids({ status: ['learned'] }, PROGRESS)).toEqual(['grafo']));
  it('status hard', () => expect(ids({ status: ['hard'] }, PROGRESS)).toEqual(['agapao']));
  it('status is per direction', () => expect(ids({ status: ['new'] }, PROGRESS, 'ru-el')).toHaveLength(6));
  it('groups combine with AND', () =>
    expect(ids({ source: ['user'], tags: ['движение'] })).toEqual(['kolympao']));
});

describe('facets & isFilterActive', () => {
  it('collects sorted unique tags and authors', () => {
    const f = facets(WORDS);
    expect(f.authors).toEqual(['Маша', 'Саша']);
    expect(f.tags).toEqual(['движение', 'еда', 'общение', 'повседневное', 'учёба', 'чувства']);
  });
  it('detects active filter', () => {
    expect(isFilterActive(emptyFilter())).toBe(false);
    expect(isFilterActive({ ...emptyFilter(), query: ' x ' })).toBe(true);
    expect(isFilterActive({ ...emptyFilter(), tags: ['еда'] })).toBe(true);
  });
});

describe('practice filter', () => {
  const PRACTICE: PracticeMap = {
    'grafo:el-ru': { wordId: 'grafo', direction: 'el-ru', level: 5, seen: 9, wrong: 0, lastSeen: '2026-10-10' },
    'agapao:el-ru': { wordId: 'agapao', direction: 'el-ru', level: 2, seen: 3, wrong: 1, lastSeen: '2026-10-10' },
    'mporo:ru-el': { wordId: 'mporo', direction: 'ru-el', level: 0, seen: 1, wrong: 1, lastSeen: '2026-10-10' },
  };
  const pids = (st: PracticeStatus[], dir: 'el-ru' | 'ru-el' = 'el-ru') =>
    applyFilter(WORDS, { ...emptyFilter(), practice: st }, {}, dir, PRACTICE).map((w) => w.id);
  it('emptyFilter has practice group; active when set', () => {
    expect(emptyFilter().practice).toEqual([]);
    expect(isFilterActive({ ...emptyFilter(), practice: ['mastered'] })).toBe(true);
  });
  it('mastered', () => expect(pids(['mastered'])).toEqual(['grafo']));
  it('in-progress', () => expect(pids(['in-progress'])).toEqual(['agapao']));
  it('not-started', () => expect(pids(['not-started'])).toHaveLength(4));
  it('multiple statuses', () => expect(pids(['mastered', 'in-progress'])).toEqual(['grafo', 'agapao']));
  it('is per direction', () => {
    expect(pids(['in-progress'], 'ru-el')).toEqual(['mporo']);
    expect(pids(['mastered'], 'ru-el')).toEqual([]);
  });
  it('practice param optional: everything not-started', () =>
    expect(applyFilter(WORDS, { ...emptyFilter(), practice: ['not-started'] }, {}, 'el-ru')).toHaveLength(6));
});

describe('pos filter', () => {
  const ws = [
    { ...WORDS[0], pos: 'verb' as const },
    { ...WORDS[4], pos: 'noun' as const },
    WORDS[5], // без pos
  ];
  const run = (pos: WordFilter['pos']) => applyFilter(ws, { ...emptyFilter(), pos }, {}, 'el-ru').map((w) => w.id);
  it('filters by pos (OR inside group)', () => expect(run(['verb', 'noun'])).toEqual(['grafo', 'psino']));
  it('word without pos counts as other', () => expect(run(['other'])).toEqual(['kolympao']));
  it('pos activates filter', () => {
    expect(emptyFilter().pos).toEqual([]);
    expect(isFilterActive({ ...emptyFilter(), pos: ['adj'] })).toBe(true);
  });
});
