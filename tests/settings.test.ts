import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, incNewSeen, loadPracticeFilter, loadSettings, newSeenToday, savePracticeFilter, saveSettings } from '../src/lib/settings';
import { emptyFilter } from '../src/lib/filters';
import { MemStorage } from './memStorage';

describe('settings', () => {
  it('defaults when empty', () => expect(loadSettings(new MemStorage())).toEqual(DEFAULT_SETTINGS));
  it('roundtrip', () => {
    const st = new MemStorage();
    saveSettings({ name: 'Маша', githubToken: 'tok', newPerDay: 5 }, st);
    expect(loadSettings(st)).toEqual({ name: 'Маша', githubToken: 'tok', newPerDay: 5 });
  });
  it('corrupt JSON -> defaults', () => {
    const st = new MemStorage();
    st.setItem('greek.settings', '{oops');
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
  });
  it('invalid newPerDay -> default, zero allowed', () => {
    const st = new MemStorage();
    st.setItem('greek.settings', JSON.stringify({ newPerDay: 'abc' }));
    expect(loadSettings(st).newPerDay).toBe(10);
    st.setItem('greek.settings', JSON.stringify({ newPerDay: 0 }));
    expect(loadSettings(st).newPerDay).toBe(0);
  });
});

describe('newSeen counter', () => {
  it('counts per direction and resets on a new day', () => {
    const st = new MemStorage();
    incNewSeen('el-ru', '2026-10-10', st);
    incNewSeen('el-ru', '2026-10-10', st);
    incNewSeen('ru-el', '2026-10-10', st);
    expect(newSeenToday('el-ru', '2026-10-10', st)).toBe(2);
    expect(newSeenToday('ru-el', '2026-10-10', st)).toBe(1);
    expect(newSeenToday('el-ru', '2026-10-11', st)).toBe(0);
    incNewSeen('el-ru', '2026-10-11', st);
    expect(newSeenToday('el-ru', '2026-10-11', st)).toBe(1);
    expect(newSeenToday('ru-el', '2026-10-11', st)).toBe(0);
  });
});

describe('practice filter', () => {
  it('empty storage -> emptyFilter', () => expect(loadPracticeFilter(new MemStorage())).toEqual(emptyFilter()));
  it('roundtrip', () => {
    const st = new MemStorage();
    const f = { ...emptyFilter(), pos: ['noun' as const], tags: ['еда'], addedBy: ['Маша'], practice: ['not-started' as const] };
    savePracticeFilter(f, st);
    expect(loadPracticeFilter(st)).toEqual(f);
  });
  it('corrupt JSON -> emptyFilter', () => {
    const st = new MemStorage();
    st.setItem('greek.practiceFilter', '{oops');
    expect(loadPracticeFilter(st)).toEqual(emptyFilter());
    st.setItem('greek.practiceFilter', '"str"');
    expect(loadPracticeFilter(st)).toEqual(emptyFilter());
  });
  it('drops invalid values of an old or foreign format', () => {
    const st = new MemStorage();
    st.setItem('greek.practiceFilter', JSON.stringify({ tags: ['еда', 5], pos: ['noun', 'xxx'], practice: ['bogus'] }));
    expect(loadPracticeFilter(st)).toEqual({ ...emptyFilter(), tags: ['еда'], pos: ['noun'], practice: [] });
  });
  it('save does not throw when setItem throws', () => {
    const st = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => savePracticeFilter(emptyFilter(), st)).not.toThrow();
  });
});
