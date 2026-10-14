import { describe, it, expect, vi } from 'vitest';
import { SYSTEM_PROMPT, WORDS_SCHEMA } from '../src/lib/telegram/prompt';
import { BATCH_SIZE, DEFAULT_MODEL, extractWords, parseLlmWords } from '../src/lib/telegram/llm';

describe('WORDS_SCHEMA', () => {
  const walk = (node: unknown, visit: (n: Record<string, unknown>) => void): void => {
    if (Array.isArray(node)) return node.forEach((c) => walk(c, visit));
    if (node && typeof node === 'object') {
      visit(node as Record<string, unknown>);
      Object.values(node).forEach((c) => walk(c, visit));
    }
  };
  it('no node combines enum with an array-valued type', () => {
    const bad: unknown[] = [];
    walk(WORDS_SCHEMA, (n) => {
      if ('enum' in n && Array.isArray(n.type)) bad.push(n);
    });
    expect(bad).toEqual([]);
  });
  it('conj accepts null via anyOf', () => {
    const conj = (WORDS_SCHEMA.properties.words.items.properties as Record<string, { anyOf?: unknown[] }>).conj;
    expect(conj.anyOf).toContainEqual({ type: 'null' });
  });
});

const item = (p: Record<string, unknown> = {}) => ({
  el: 'το κλειδί', ru: 'ключ', pos: 'noun', tags: ['дом'], aorist: null, future: null, conj: null, note: null, sourceMessageId: 1, ...p,
});
const body = (words: unknown[]) => JSON.stringify({ words });

describe('parseLlmWords', () => {
  it('accepts valid response', () => expect(parseLlmWords(body([item()]), new Set([1])).words).toEqual([item()]));
  it('accepts JSON in a code fence', () =>
    expect(parseLlmWords('```json\n' + body([item()]) + '\n```', new Set([1])).words).toHaveLength(1));
  it('throws on non-JSON', () => expect(() => parseLlmWords('Sorry, I cannot', new Set([1]))).toThrow());
  it('throws when words is not an array', () => expect(() => parseLlmWords('{"words":5}', new Set([1]))).toThrow());
  it('rejects unknown pos and foreign message id, keeps the rest', () => {
    const r = parseLlmWords(body([item({ pos: 'xxx' }), item({ sourceMessageId: 99 }), item({ el: 'η πόρτα' })]), new Set([1]));
    expect(r.words.map((w) => w.el)).toEqual(['η πόρτα']);
    expect(r.rejected).toHaveLength(2);
  });
  it('rejects empty el/ru and bad conj, normalizes tags', () => {
    const r = parseLlmWords(body([item({ ru: ' ' }), item({ conj: 'Z' }), item({ tags: [' Дом ', 'дом', ''] })]), new Set([1]));
    expect(r.rejected).toHaveLength(2);
    expect(r.words[0].tags).toEqual(['дом']);
  });
});

describe('extractWords', () => {
  const ok = (words: unknown[]) => new Response(JSON.stringify({ choices: [{ message: { content: body(words) } }] }), { status: 200 });
  const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, date: '2026-10-13', text: 'το νερό' }));

  it('sends model, schema and messages; returns words', async () => {
    const f = vi.fn(async () => ok([item()]));
    const r = await extractWords(msgs(1), { apiKey: 'k', fetch: f as never });
    expect(r.words).toHaveLength(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe(DEFAULT_MODEL);
    expect(sent).not.toHaveProperty('temperature');
    expect(sent.max_tokens).toBe(8000);
    expect(sent.provider.require_parameters).toBe(true);
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(JSON.parse(sent.messages[1].content)).toEqual(msgs(1));
  });
  it('system prompt is unchanged without tags', async () => {
    const f = vi.fn(async () => ok([]));
    await extractWords(msgs(1), { apiKey: 'k', fetch: f as never, tags: [] });
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.messages[0].content).toBe(SYSTEM_PROMPT);
  });
  it('appends existing tags to system prompt', async () => {
    const f = vi.fn(async () => ok([]));
    await extractWords(msgs(1), { apiKey: 'k', fetch: f as never, tags: ['дом', 'еда'] });
    const sent = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.messages[0].content).toContain('дом, еда');
    expect(sent.messages[0].content.startsWith(SYSTEM_PROMPT)).toBe(true);
  });
  it('batches by BATCH_SIZE', async () => {
    const f = vi.fn(async () => ok([]));
    await extractWords(msgs(BATCH_SIZE + 1), { apiKey: 'k', model: 'x/y', fetch: f as never });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('throws on HTTP error', async () => {
    const f = vi.fn(async () => new Response('boom', { status: 502 }));
    await expect(extractWords(msgs(1), { apiKey: 'k', fetch: f as never })).rejects.toThrow('OpenRouter 502');
  });
  it('makes no request for empty input', async () => {
    const f = vi.fn();
    expect(await extractWords([], { apiKey: 'k', fetch: f as never })).toEqual({ words: [], rejected: [] });
    expect(f).not.toHaveBeenCalled();
  });
});
