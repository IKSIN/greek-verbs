import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openProgressStore } from '../src/lib/progressStore';
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
