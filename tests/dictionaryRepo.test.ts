import { describe, it, expect, vi } from 'vitest';
import {
  createDictionaryRepo, decodeBase64Utf8, DictionaryError, encodeBase64Utf8, type DictionarySnapshot,
} from '../src/lib/dictionaryRepo';
import type { RepoConfig } from '../src/lib/config';
import type { Word } from '../src/lib/types';
import { word } from './fixtures';

const CFG: RepoConfig = { owner: 'o', repo: 'r', path: 'data/words.json', branch: 'main' };
const GRAFO = word({ id: 'grafo', el: 'γράφω', ru: 'писать' });
const PSINO = word({ id: 'psino', el: 'ψήνω', ru: 'печь', source: 'user', addedBy: 'Маша' });

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function fakeGitHub(initial: Word[], opts: { putStatus?: number[]; beforeFirstPut?: (g: Fake) => void } = {}) {
  const g = {
    words: initial, sha: 'sha-1', n: 1, puts: [] as { body: any; headers: any }[],
    setRemote(ws: Word[]) { g.words = ws; g.sha = `sha-${++g.n}`; },
    fetch: vi.fn(async (_url: string, init: RequestInit = {}) => {
      if ((init.method ?? 'GET') === 'GET') {
        return json(200, { content: encodeBase64Utf8(JSON.stringify(g.words)), sha: g.sha });
      }
      if (g.puts.length === 0) opts.beforeFirstPut?.(g);
      const body = JSON.parse(init.body as string);
      g.puts.push({ body, headers: init.headers });
      const forced = opts.putStatus?.[g.puts.length - 1];
      if (forced) return json(forced, { message: 'x' });
      if (body.sha !== g.sha) return json(409, { message: 'sha mismatch' });
      g.setRemote(JSON.parse(decodeBase64Utf8(body.content)));
      return json(200, { content: { sha: g.sha } });
    }),
  };
  return g;
}
type Fake = ReturnType<typeof fakeGitHub>;

function deps(fetchImpl: typeof fetch, cached?: DictionarySnapshot) {
  const cache = { value: cached, get: vi.fn(async () => cache.value), set: vi.fn(async (s: DictionarySnapshot) => { cache.value = s; }) };
  return { fetch: fetchImpl, cache, bundled: vi.fn(async () => [GRAFO]) };
}

describe('base64 utf-8', () => {
  it('roundtrips greek, cyrillic and emoji', () => {
    const s = 'γράφω — писать 🎉';
    expect(decodeBase64Utf8(encodeBase64Utf8(s))).toBe(s);
  });
  it('decodes GitHub-style base64 with newlines', () => {
    const b = encodeBase64Utf8('ψήνω');
    expect(decodeBase64Utf8(b.slice(0, 4) + '\n' + b.slice(4))).toBe('ψήνω');
  });
});

describe('load', () => {
  it('reads remote and caches it', async () => {
    const g = fakeGitHub([GRAFO]);
    const d = deps(g.fetch as unknown as typeof fetch);
    const snap = await createDictionaryRepo(CFG, d).load('tok');
    expect(snap).toEqual({ words: [GRAFO], sha: 'sha-1', origin: 'remote' });
    expect(d.cache.set).toHaveBeenCalledWith(snap);
    const [url, init] = g.fetch.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/o/r/contents/data/words.json?ref=main');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });
  it('falls back to cache when offline', async () => {
    const d = deps(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')), { words: [PSINO], sha: 's', origin: 'remote' });
    expect(await createDictionaryRepo(CFG, d).load()).toEqual({ words: [PSINO], sha: 's', origin: 'cache' });
  });
  it('falls back to bundled when no cache', async () => {
    const d = deps(vi.fn().mockResolvedValue(json(500, {})));
    expect(await createDictionaryRepo(CFG, d).load()).toEqual({ words: [GRAFO], sha: null, origin: 'bundled' });
  });
  it('uses bundled when repo is not configured', async () => {
    const f = vi.fn();
    expect((await createDictionaryRepo(null, deps(f)).load()).origin).toBe('bundled');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('commit', () => {
  it('adds a word with sha, message and auth header', async () => {
    const g = fakeGitHub([GRAFO]);
    const snap = await createDictionaryRepo(CFG, deps(g.fetch as unknown as typeof fetch))
      .commit({ type: 'add', word: PSINO }, 'tok', 'Маша');
    expect(g.puts[0].body).toMatchObject({ sha: 'sha-1', branch: 'main', message: 'words: add ψήνω (by Маша)' });
    expect(g.puts[0].headers.Authorization).toBe('Bearer tok');
    expect(decodeBase64Utf8(g.puts[0].body.content).endsWith('\n')).toBe(true);
    expect(g.words.map((w) => w.id)).toEqual(['grafo', 'psino']);
    expect(snap).toMatchObject({ sha: 'sha-2', origin: 'remote' });
  });
  it('retries on conflict; concurrent same-id add gets a suffix', async () => {
    const other = word({ id: 'psino', el: 'ψήνω', ru: 'жарить', source: 'user', addedBy: 'Саша' });
    const g = fakeGitHub([GRAFO], { beforeFirstPut: (f) => f.setRemote([GRAFO, other]) });
    await createDictionaryRepo(CFG, deps(g.fetch as unknown as typeof fetch))
      .commit({ type: 'add', word: PSINO }, 'tok', 'Маша');
    expect(g.puts).toHaveLength(2);
    expect(g.words.map((w) => w.id)).toEqual(['grafo', 'psino', 'psino-2']);
    expect(g.words[1].addedBy).toBe('Саша');
  });
  it('gives up after 3 conflicts', async () => {
    const g = fakeGitHub([GRAFO], { putStatus: [409, 409, 422] });
    const p = createDictionaryRepo(CFG, deps(g.fetch as unknown as typeof fetch)).commit({ type: 'add', word: PSINO }, 'tok', 'Маша');
    await expect(p).rejects.toMatchObject({ kind: 'conflict' });
    expect(g.puts).toHaveLength(3);
  });
  it('401 -> auth error without retry', async () => {
    const g = fakeGitHub([GRAFO], { putStatus: [401] });
    const p = createDictionaryRepo(CFG, deps(g.fetch as unknown as typeof fetch)).commit({ type: 'add', word: PSINO }, 'bad', 'Маша');
    await expect(p).rejects.toMatchObject({ kind: 'auth' });
    expect(g.puts).toHaveLength(1);
  });
  it('network failure -> network error', async () => {
    const p = createDictionaryRepo(CFG, deps(vi.fn().mockRejectedValue(new TypeError('x'))))
      .commit({ type: 'add', word: PSINO }, 'tok', 'Маша');
    await expect(p).rejects.toBeInstanceOf(DictionaryError);
    await expect(p).rejects.toMatchObject({ kind: 'network' });
  });
  it('missing token -> auth error', async () => {
    await expect(createDictionaryRepo(CFG, deps(vi.fn())).commit({ type: 'add', word: PSINO }, '', 'Маша'))
      .rejects.toMatchObject({ kind: 'auth' });
  });
  it('update of a deleted word -> other error', async () => {
    const g = fakeGitHub([GRAFO]);
    await expect(createDictionaryRepo(CFG, deps(g.fetch as unknown as typeof fetch))
      .commit({ type: 'update', word: PSINO }, 'tok', 'Маша')).rejects.toMatchObject({ kind: 'other' });
  });
  it('update and delete', async () => {
    const g = fakeGitHub([GRAFO, PSINO]);
    const repo = createDictionaryRepo(CFG, deps(g.fetch as unknown as typeof fetch));
    await repo.commit({ type: 'update', word: { ...PSINO, ru: 'запекать' } }, 'tok', 'Маша');
    expect(g.words[1].ru).toBe('запекать');
    await repo.commit({ type: 'delete', id: 'psino', el: 'ψήνω' }, 'tok', 'Маша');
    expect(g.words.map((w) => w.id)).toEqual(['grafo']);
    expect(g.puts[1].body.message).toBe('words: delete ψήνω (by Маша)');
  });
});
