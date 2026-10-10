import { describe, it, expect } from 'vitest';
import { answerSession, buildQueue, countDue, startSession } from '../src/lib/session';
import type { ProgressMap } from '../src/lib/types';
import { T, WORDS, card } from './fixtures';

const noShuffle = () => 0.999999;

const PROGRESS: ProgressMap = {
  'grafo:el-ru': card('grafo', 'el-ru', { interval: 3, due: '2026-10-09' }),   // просрочено
  'agapao:el-ru': card('agapao', 'el-ru', { interval: 1, due: T }),            // сегодня
  'mporo:el-ru': card('mporo', 'el-ru', { interval: 5, due: '2026-10-12' }),   // не сегодня
  'ghost:el-ru': card('ghost', 'el-ru', { due: '2026-01-01' }),                // слово удалено
};

describe('buildQueue', () => {
  it('due cards first, then new up to limit; skips future and orphan progress', () => {
    const q = buildQueue(WORDS, PROGRESS, 'el-ru', T, 2, noShuffle);
    expect(q.map((i) => [i.word.id, i.isNew])).toEqual([
      ['grafo', false], ['agapao', false], ['erchomai', true], ['psino', true],
    ]);
  });
  it('negative limit means no new words', () => {
    expect(buildQueue(WORDS, PROGRESS, 'el-ru', T, -3).every((i) => !i.isNew)).toBe(true);
  });
  it('direction-specific: other direction is all new', () => {
    expect(buildQueue(WORDS, PROGRESS, 'ru-el', T, 10)).toHaveLength(6);
  });
  it('countDue', () => expect(countDue(WORDS, PROGRESS, 'el-ru', T)).toEqual({ due: 2, fresh: 3 }));
});

describe('answerSession', () => {
  const items = buildQueue(WORDS.slice(0, 2), {}, 'el-ru', T, 10);

  it('good removes the card', () => {
    const s = answerSession(startSession(items), 'good');
    expect(s.queue.map((i) => i.word.id)).toEqual(['agapao']);
    expect(s).toMatchObject({ seen: ['grafo'], errors: 0, answered: 1, total: 2 });
  });
  it('again requeues once, at the end, as not-new', () => {
    let s = answerSession(startSession(items), 'again');
    expect(s.queue.map((i) => i.word.id)).toEqual(['agapao', 'grafo']);
    expect(s.queue[1].isNew).toBe(false);
    s = answerSession(s, 'good');
    s = answerSession(s, 'again');
    expect(s.queue).toHaveLength(0);
    expect(s).toMatchObject({ errors: 2, seen: ['grafo', 'agapao'], answered: 3 });
  });
  it('empty queue is a no-op', () => {
    const s = startSession([]);
    expect(answerSession(s, 'good')).toBe(s);
  });
});
