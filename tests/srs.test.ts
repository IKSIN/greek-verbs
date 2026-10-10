import { describe, it, expect } from 'vitest';
import { newCard, schedule } from '../src/lib/srs';
import { addDays, todayISO } from '../src/lib/date';

const T = '2026-10-10';
const fresh = () => newCard('grafo', 'el-ru', T);

describe('date', () => {
  it('addDays crosses month boundary', () => expect(addDays('2026-10-30', 3)).toBe('2026-11-02'));
  it('todayISO uses local date', () => expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05'));
});

describe('schedule', () => {
  it('new card + good -> 1 day', () => {
    expect(schedule(fresh(), 'good', T)).toMatchObject({
      interval: 1, reps: 1, ease: 2.5, due: '2026-10-11', lapses: 0, recent: ['good'],
    });
  });
  it('good progression: 1 -> 3 -> round(interval*ease)', () => {
    let s = schedule(fresh(), 'good', T);
    s = schedule(s, 'good', T);
    expect(s.interval).toBe(3);
    s = schedule(s, 'good', T);
    expect(s.interval).toBe(8);
  });
  it('easy boosts interval and ease', () => {
    let s = schedule(fresh(), 'easy', T);
    expect(s).toMatchObject({ interval: 1, ease: 2.65, reps: 1 });
    s = schedule(s, 'easy', T);
    expect(s).toMatchObject({ interval: 4, ease: 2.8, reps: 2 });
  });
  it('again resets reps and interval, counts lapse', () => {
    const s = schedule({ ...fresh(), interval: 8, reps: 3 }, 'again', T);
    expect(s).toMatchObject({ interval: 1, reps: 0, ease: 2.3, lapses: 1, due: '2026-10-11' });
  });
  it('hard grows interval slowly and keeps reps', () => {
    const s = schedule({ ...fresh(), interval: 8, reps: 3 }, 'hard', T);
    expect(s).toMatchObject({ interval: 10, reps: 3, ease: 2.35 });
  });
  it('hard on a new card gives 1 day', () => expect(schedule(fresh(), 'hard', T).interval).toBe(1));
  it('ease never drops below 1.3', () =>
    expect(schedule({ ...fresh(), ease: 1.4 }, 'again', T).ease).toBe(1.3));
  it('recent keeps the last 5 grades', () => {
    let s = fresh();
    for (const g of ['again', 'good', 'good', 'hard', 'easy', 'again'] as const) s = schedule(s, g, T);
    expect(s.recent).toEqual(['good', 'good', 'hard', 'easy', 'again']);
  });
  it('does not mutate input', () => {
    const a = fresh();
    schedule(a, 'good', T);
    expect(a.reps).toBe(0);
  });
});
