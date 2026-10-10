import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openProgressStore } from '../src/lib/progressStore';
import { openDB } from 'idb';
import type { PracticeState } from '../src/lib/types';
import { card } from './fixtures';

let n = 0;
const fresh = () => openProgressStore(`test-${n++}`);

describe('progressStore', () => {
  it('put/getAll keyed by id:direction, put overwrites', async () => {
    const s = await fresh();
    await s.put(card('grafo', 'el-ru', { interval: 1 }));
    await s.put(card('grafo', 'ru-el'));
    await s.put(card('grafo', 'el-ru', { interval: 3 }));
    const all = await s.getAll();
    expect(Object.keys(all).sort()).toEqual(['grafo:el-ru', 'grafo:ru-el']);
    expect(all['grafo:el-ru'].interval).toBe(3);
  });

  it('deleteWord removes both directions of that word only', async () => {
    const s = await fresh();
    await s.put(card('grafo', 'el-ru'));
    await s.put(card('grafo', 'ru-el'));
    await s.put(card('mporo', 'el-ru'));
    await s.deleteWord('grafo');
    expect(Object.keys(await s.getAll())).toEqual(['mporo:el-ru']);
  });

  it('export -> import roundtrip replaces progress', async () => {
    const a = await fresh();
    await a.put(card('grafo', 'el-ru', { interval: 7 }));
    const json = await a.exportJSON();
    const b = await fresh();
    await b.put(card('old', 'el-ru'));
    expect(await b.importJSON(json)).toBe(1);
    const all = await b.getAll();
    expect(Object.keys(all)).toEqual(['grafo:el-ru']);
    expect(all['grafo:el-ru'].interval).toBe(7);
  });

  it('invalid JSON is rejected and existing progress kept', async () => {
    const s = await fresh();
    await s.put(card('grafo', 'el-ru'));
    await expect(s.importJSON('{not json')).rejects.toThrow('Файл не является JSON');
    expect(Object.keys(await s.getAll())).toEqual(['grafo:el-ru']);
  });

  it('wrong shape is rejected and existing progress kept', async () => {
    const s = await fresh();
    await s.put(card('grafo', 'el-ru'));
    const bad = JSON.stringify({ app: 'greek', version: 1, cards: [{ wordId: 'x', direction: 'up' }] });
    await expect(s.importJSON(bad)).rejects.toThrow('Неверный формат файла прогресса');
    await expect(s.importJSON('[]')).rejects.toThrow('Неверный формат файла прогресса');
    expect(Object.keys(await s.getAll())).toEqual(['grafo:el-ru']);
  });

  it('cache get/set', async () => {
    const s = await fresh();
    expect(await s.getCache('dictionary')).toBeUndefined();
    await s.setCache('dictionary', { words: [], sha: 'abc' });
    expect(await s.getCache('dictionary')).toEqual({ words: [], sha: 'abc' });
  });
});

describe('progressStore practice (v2)', () => {
  const pr = (id: string, dir: 'el-ru' | 'ru-el' = 'el-ru', level = 2): PracticeState =>
    ({ wordId: id, direction: dir, level, seen: 3, wrong: 1, lastSeen: '2026-10-10' });

  it('putPractice/getAllPractice', async () => {
    const s = await fresh();
    await s.putPractice(pr('grafo'));
    await s.putPractice(pr('grafo', 'ru-el'));
    await s.putPractice(pr('grafo', 'el-ru', 4));
    const all = await s.getAllPractice();
    expect(Object.keys(all).sort()).toEqual(['grafo:el-ru', 'grafo:ru-el']);
    expect(all['grafo:el-ru'].level).toBe(4);
  });

  it('deleteWord removes practice for both directions', async () => {
    const s = await fresh();
    await s.putPractice(pr('grafo'));
    await s.putPractice(pr('grafo', 'ru-el'));
    await s.putPractice(pr('mporo'));
    await s.deleteWord('grafo');
    expect(Object.keys(await s.getAllPractice())).toEqual(['mporo:el-ru']);
  });

  it('export -> import roundtrip includes practice', async () => {
    const a = await fresh();
    await a.put(card('grafo', 'el-ru'));
    await a.putPractice(pr('grafo', 'el-ru', 5));
    const json = await a.exportJSON();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(2);
    expect(parsed.practice).toHaveLength(1);
    const b = await fresh();
    await b.putPractice(pr('old'));
    expect(await b.importJSON(json)).toBe(1);
    expect(Object.keys(await b.getAllPractice())).toEqual(['grafo:el-ru']);
  });

  it('v1 file (no practice) leaves practice untouched', async () => {
    const s = await fresh();
    await s.putPractice(pr('keep'));
    const v1 = JSON.stringify({ app: 'greek', version: 1, cards: [card('grafo', 'el-ru')] });
    expect(await s.importJSON(v1)).toBe(1);
    expect(Object.keys(await s.getAllPractice())).toEqual(['keep:el-ru']);
    expect(Object.keys(await s.getAll())).toEqual(['grafo:el-ru']);
  });

  it('invalid practice entry is rejected and nothing changes', async () => {
    const s = await fresh();
    await s.put(card('grafo', 'el-ru'));
    await s.putPractice(pr('keep'));
    const bad = (p: unknown) => JSON.stringify({ app: 'greek', version: 2, cards: [card('new', 'el-ru')], practice: p });
    for (const p of [
      [{ ...pr('x'), level: 6 }], [{ ...pr('x'), level: 1.5 }], [{ ...pr('x'), direction: 'up' }],
      [{ ...pr('x'), wordId: '' }], [{ ...pr('x'), seen: -1 }], [{ ...pr('x'), lastSeen: 'yesterday' }], 'nope',
    ]) {
      await expect(s.importJSON(bad(p))).rejects.toThrow('Неверный формат файла прогресса');
    }
    expect(Object.keys(await s.getAll())).toEqual(['grafo:el-ru']);
    expect(Object.keys(await s.getAllPractice())).toEqual(['keep:el-ru']);
  });

  it('upgrades a v1 database preserving data', async () => {
    const name = `test-v1-${n++}`;
    const old = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('progress');
        db.createObjectStore('cache');
      },
    });
    await old.put('progress', card('grafo', 'el-ru', { interval: 9 }), 'grafo:el-ru');
    old.close();
    const s = await openProgressStore(name);
    expect((await s.getAll())['grafo:el-ru'].interval).toBe(9);
    await s.putPractice(pr('grafo'));
    expect(Object.keys(await s.getAllPractice())).toEqual(['grafo:el-ru']);
  });
});
