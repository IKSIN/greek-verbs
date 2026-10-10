import type { RepoConfig } from './config';
import type { Word, WordChange } from './types';
import { makeId } from './wordId';

export interface DictionarySnapshot { words: Word[]; sha: string | null; origin: 'remote' | 'cache' | 'bundled' }

export type DictionaryErrorKind = 'auth' | 'network' | 'conflict' | 'not-configured' | 'other';

export class DictionaryError extends Error {
  constructor(public kind: DictionaryErrorKind, message: string) {
    super(message);
    this.name = 'DictionaryError';
  }
}

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function applyChange(words: Word[], change: WordChange): Word[] {
  switch (change.type) {
    case 'add': {
      const ids = new Set(words.map((w) => w.id));
      const id = ids.has(change.word.id) ? makeId(change.word.el, ids) : change.word.id;
      return [...words, { ...change.word, id }];
    }
    case 'update':
      if (!words.some((w) => w.id === change.word.id)) {
        throw new DictionaryError('other', `Слово «${change.word.el}» не найдено — возможно, его удалили`);
      }
      return words.map((w) => (w.id === change.word.id ? change.word : w));
    case 'delete':
      return words.filter((w) => w.id !== change.id);
  }
}

export function commitMessage(change: WordChange, author: string): string {
  const label = change.type === 'delete' ? change.el : change.word.el;
  return `words: ${change.type} ${label} (by ${author || 'unknown'})`;
}

export interface RepoDeps {
  fetch: typeof fetch;
  cache: { get(): Promise<DictionarySnapshot | undefined>; set(s: DictionarySnapshot): Promise<void> };
  bundled(): Promise<Word[]>;
}

export interface DictionaryRepo {
  load(token?: string): Promise<DictionarySnapshot>;
  commit(change: WordChange, token: string, author: string): Promise<DictionarySnapshot>;
}

const MAX_ATTEMPTS = 3;

export function createDictionaryRepo(cfg: RepoConfig | null, deps: RepoDeps): DictionaryRepo {
  const url = cfg ? `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}` : '';

  function headers(token?: string): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  async function request(input: string, init: RequestInit): Promise<Response> {
    try {
      return await deps.fetch(input, init);
    } catch {
      throw new DictionaryError('network', 'Нет соединения с GitHub');
    }
  }

  function failFor(res: Response): DictionaryError {
    if (res.status === 401 || res.status === 403) return new DictionaryError('auth', 'GitHub отклонил запрос — проверьте токен');
    if (res.status === 409 || res.status === 422) return new DictionaryError('conflict', 'Словарь изменился во время сохранения — попробуйте ещё раз');
    return new DictionaryError('other', `GitHub ответил ошибкой ${res.status}`);
  }

  async function fetchRemote(token?: string): Promise<DictionarySnapshot> {
    if (!cfg) throw new DictionaryError('not-configured', 'Репозиторий GitHub не определён');
    const res = await request(`${url}?ref=${cfg.branch}`, { headers: headers(token), cache: 'no-store' });
    if (!res.ok) throw failFor(res);
    const body = (await res.json()) as { content: string; sha: string };
    const words = JSON.parse(decodeBase64Utf8(body.content)) as Word[];
    if (!Array.isArray(words)) throw new DictionaryError('other', 'Файл словаря повреждён');
    return { words, sha: body.sha, origin: 'remote' };
  }

  return {
    async load(token) {
      try {
        const snap = await fetchRemote(token);
        await deps.cache.set(snap);
        return snap;
      } catch {
        const cached = await deps.cache.get().catch(() => undefined);
        if (cached) return { ...cached, origin: 'cache' };
        return { words: await deps.bundled(), sha: null, origin: 'bundled' };
      }
    },

    async commit(change, token, author) {
      if (!token) throw new DictionaryError('auth', 'Не задан GitHub-токен');
      let lastErr = new DictionaryError('conflict', 'Словарь изменился во время сохранения — попробуйте ещё раз');
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const current = await fetchRemote(token);
        const words = applyChange(current.words, change);
        const res = await request(url, {
          method: 'PUT',
          headers: { ...headers(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: commitMessage(change, author),
            content: encodeBase64Utf8(JSON.stringify(words, null, 2) + '\n'),
            sha: current.sha,
            branch: cfg!.branch,
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as { content: { sha: string } };
          const snap: DictionarySnapshot = { words, sha: body.content.sha, origin: 'remote' };
          await deps.cache.set(snap);
          return snap;
        }
        lastErr = failFor(res);
        if (lastErr.kind !== 'conflict') throw lastErr;
      }
      throw lastErr;
    },
  };
}
