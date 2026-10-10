import { describe, it, expect } from 'vitest';
import {
  MAX_LEVEL, RETRY_AFTER, answerPractice, applyPracticeAnswer, levelWeight, nextPracticeWord, practiceStatusOf,
  startPractice, type PracticeSession,
} from '../src/lib/practice';
import type { PracticeMap, PracticeState } from '../src/lib/types';
import { WORDS, T } from './fixtures';

const st = (id: string, level: number, patch: Partial<PracticeState> = {}): PracticeState =>
  ({ wordId: id, direction: 'el-ru', level, seen: 0, wrong: 0, lastSeen: T, ...patch });

describe('applyPracticeAnswer', () => {
  const lv = (level: number, g: 'again' | 'hard' | 'good' | 'easy') =>
    applyPracticeAnswer(st('a', level), 'a', 'el-ru', g, T).level;
  it('transitions', () => {
    expect(lv(1, 'easy')).toBe(3);
    expect(lv(1, 'good')).toBe(2);
    expect(lv(2, 'hard')).toBe(2);
    expect(lv(3, 'again')).toBe(0);
  });
  it('clamps', () => {
    expect(lv(0, 'again')).toBe(0);
    expect(lv(5, 'easy')).toBe(MAX_LEVEL);
    expect(lv(5, 'good')).toBe(5);
    expect(lv(4, 'easy')).toBe(5);
  });
  it('starts from nothing, counts seen/wrong, sets lastSeen', () => {
    const n = applyPracticeAnswer(undefined, 'a', 'ru-el', 'again', T);
    expect(n).toEqual({ wordId: 'a', direction: 'ru-el', level: 0, seen: 1, wrong: 1, lastSeen: T });
    const g = applyPracticeAnswer(undefined, 'a', 'ru-el', 'good', '2026-11-01');
    expect(g).toMatchObject({ level: 1, seen: 1, wrong: 0, lastSeen: '2026-11-01' });
  });
  it('is pure', () => {
    const prev = st('a', 2, { seen: 4 });
    const copy = { ...prev };
    applyPracticeAnswer(prev, 'a', 'el-ru', 'easy', T);
    expect(prev).toEqual(copy);
  });
});

describe('status and weight', () => {
  it('status', () => {
    expect(practiceStatusOf(undefined)).toBe('not-started');
    expect(practiceStatusOf(st('a', 0))).toBe('in-progress');
    expect(practiceStatusOf(st('a', 4))).toBe('in-progress');
    expect(practiceStatusOf(st('a', 5))).toBe('mastered');
  });
  it('weights', () => {
    expect(levelWeight(0)).toBe(32);
    expect(levelWeight(3)).toBe(4);
    expect(levelWeight(5)).toBe(1);
  });
});

describe('answerPractice', () => {
  it('counters', () => {
    let s = startPractice();
    s = answerPractice(s, 'a', 'good', 0, 1);
    expect(s).toMatchObject({ answered: 1, errors: 0, levelUps: 1, lastId: 'a', retry: [] });
    s = answerPractice(s, 'b', 'hard', 2, 2);
    expect(s).toMatchObject({ answered: 2, levelUps: 1 });
    s = answerPractice(s, 'b', 'again', 2, 0);
    expect(s).toMatchObject({ answered: 3, errors: 1, lastId: 'b', retry: [{ id: 'b', at: 3 + RETRY_AFTER }] });
  });
  it('replaces earlier retry of same word', () => {
    let s = answerPractice(startPractice(), 'a', 'again', 1, 0);
    s = answerPractice(s, 'a', 'again', 0, 0);
    expect(s.retry).toEqual([{ id: 'a', at: 2 + RETRY_AFTER }]);
    s = answerPractice(s, 'a', 'good', 0, 1);
    expect(s.retry).toEqual([]);
  });
  it('is pure', () => {
    const s = startPractice();
    const snap = JSON.stringify(s);
    answerPractice(s, 'a', 'again', 0, 0);
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe('nextPracticeWord', () => {
  const pool = WORDS.slice(0, 3); // grafo, agapao, mporo
  const sess = (p: Partial<PracticeSession> = {}): PracticeSession => ({ ...startPractice(), ...p });
  it('null on empty', () => expect(nextPracticeWord(sess(), [], {}, 'el-ru')).toBeNull());
  it('never repeats last word in a multi-word pool', () => {
    for (let i = 0; i < 30; i++) {
      const w = nextPracticeWord(sess({ lastId: 'grafo' }), pool, {}, 'el-ru', () => i / 30);
      expect(w!.id).not.toBe('grafo');
    }
  });
  it('single-word pool may repeat', () => {
    expect(nextPracticeWord(sess({ lastId: 'grafo' }), [pool[0]], {}, 'el-ru')!.id).toBe('grafo');
  });
  it('weighted pick favors low levels (deterministic)', () => {
    const practice: PracticeMap = {
      'grafo:el-ru': st('grafo', 5), // weight 1
      'agapao:el-ru': st('agapao', 5, { wordId: 'agapao' }), // weight 1
      // mporo no record -> weight 32
    };
    const pick = (r: number) => nextPracticeWord(sess(), pool, practice, 'el-ru', () => r)!.id;
    expect(pick(0)).toBe('grafo');
    expect(pick(1 / 34 + 0.001)).toBe('agapao');
    expect(pick(2 / 34 + 0.001)).toBe('mporo');
    expect(pick(0.999)).toBe('mporo');
  });
  it('per direction levels', () => {
    const practice: PracticeMap = { 'grafo:ru-el': st('grafo', 5, { direction: 'ru-el' }) };
    // el-ru: grafo has no record => weight 32 each; r=0.1 -> first (grafo)
    expect(nextPracticeWord(sess(), pool, practice, 'el-ru', () => 0.1)!.id).toBe('grafo');
    // ru-el: grafo weight 1; total 65; r=0.1 -> 6.5 > 1 -> agapao
    expect(nextPracticeWord(sess(), pool, practice, 'ru-el', () => 0.1)!.id).toBe('agapao');
  });
  it('retry appears after exactly 3 other answers, not before', () => {
    let s = startPractice();
    s = answerPractice(s, 'grafo', 'again', 0, 0); // answered 1, at 4
    const rng = () => 0.999;
    const p: PracticeMap = {};
    s = answerPractice(s, 'agapao', 'good', 0, 1); // 2
    expect(nextPracticeWord(s, pool, p, 'el-ru', rng)!.id).not.toBe('grafo');
    s = answerPractice(s, 'mporo', 'good', 0, 1); // 3
    expect(s.retry[0].at).toBe(4);
    // answered 3 < 4: not forced. Use rng=0 which would pick first non-last = grafo anyway; so check with rng high
    expect(nextPracticeWord(s, pool, p, 'el-ru', rng)!.id).not.toBe('grafo');
    s = answerPractice(s, 'agapao', 'good', 1, 2); // 4 => 3 other answers done
    expect(nextPracticeWord(s, pool, p, 'el-ru', rng)!.id).toBe('grafo');
  });
  it('retry skipped if not in pool or equals lastId', () => {
    const s = sess({ answered: 5, lastId: 'agapao', retry: [{ id: 'gone', at: 4 }, { id: 'mporo', at: 5 }] });
    expect(nextPracticeWord(s, pool, {}, 'el-ru', () => 0)!.id).toBe('mporo');
    const t = sess({ answered: 5, lastId: 'mporo', retry: [{ id: 'mporo', at: 5 }] });
    expect(nextPracticeWord(t, pool, {}, 'el-ru', () => 0)!.id).not.toBe('mporo');
  });
});
