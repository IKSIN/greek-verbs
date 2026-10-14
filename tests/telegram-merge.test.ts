import { describe, it, expect } from 'vitest';
import { mergeWords, TELEGRAM_AUTHOR } from '../src/lib/telegram/merge';
import { formatReply } from '../src/lib/telegram/reply';
import type { LlmWord } from '../src/lib/telegram/prompt';
import { WORDS, word } from './fixtures';

const lw = (p: Partial<LlmWord>): LlmWord => ({
  el: 'το κλειδί', ru: 'ключ', pos: 'noun', tags: [], aorist: null, future: null, conj: null, note: null, sourceMessageId: 1, ...p,
});
const dates = new Map([[1, '2025-06-07'], [2, '2025-08-16']]);

describe('mergeWords', () => {
  it('adds a new word as Telegram user word with message date', () => {
    const r = mergeWords(WORDS, [lw({ tags: ['дом'] })], dates);
    expect(r.added).toEqual([{ id: 'kleidi', el: 'το κλειδί', ru: 'ключ', pos: 'noun', tags: ['дом'], source: 'user', addedBy: TELEGRAM_AUTHOR, addedAt: '2025-06-07' }]);
    expect(r.words).toHaveLength(WORDS.length + 1);
    expect(r.words.at(-1)).toEqual(r.added[0]);
  });
  it('skips duplicates of dictionary words ignoring article, case and accents', () => {
    const existing = [...WORDS, word({ id: 'minyma', el: 'το μήνυμα', ru: 'сообщение', source: 'user', addedBy: 'Аня' })];
    const r = mergeWords(existing, [lw({ el: 'Το μηνυμα' }), lw({ el: 'γράφω', pos: 'verb' })], dates);
    expect(r.added).toEqual([]);
    expect(r.duplicates.map((d) => d.el)).toEqual(['Το μηνυμα', 'γράφω']);
  });
  it('keeps earliest of in-batch duplicates', () => {
    const r = mergeWords([], [lw({ ru: 'ключи', sourceMessageId: 2 }), lw({ ru: 'ключ', sourceMessageId: 1 })], dates);
    expect(r.added.map((w) => [w.ru, w.addedAt])).toEqual([['ключ', '2025-06-07']]);
    expect(r.duplicates).toHaveLength(1);
  });
  it('suffixes colliding ids', () => {
    const r = mergeWords([word({ id: 'kleidi', el: 'κλειδαριά', ru: 'замок', source: 'user', addedBy: 'А' })], [lw({})], dates);
    expect(r.added.map((w) => w.id)).toEqual(['kleidi-2']);
  });
  it('builds verb forms and conj', () => {
    const r = mergeWords([], [lw({ el: 'τελειώνω', ru: 'заканчивать', pos: 'verb', aorist: 'τελείωσα', future: null, conj: 'A' })], dates);
    expect(r.added[0]).toMatchObject({ forms: { aorist: 'τελείωσα' }, conj: 'A' });
    expect(r.added[0].forms).not.toHaveProperty('future');
  });
  it('limits tags to 2', () => expect(mergeWords([], [lw({ tags: ['а', 'б', 'в'] })], dates).added[0].tags).toEqual(['а', 'б']));
  it('reports invalid words and does not add them', () => {
    const r = mergeWords([], [lw({ el: 'κλειδι' })], dates); // многосложное без ударения
    expect(r.added).toEqual([]);
    expect(r.invalid[0].errors.join()).toMatch('нет ударения');
  });
});

describe('formatReply', () => {
  const added = (n: number) => Array.from({ length: n }, (_, i) => word({ id: `w${i}`, el: `λέξη${i}`, ru: `слово${i}` }));
  it('lists added words', () => expect(formatReply({ added: added(2), duplicates: [] })).toBe('📚 Добавлено 2:\nλέξη0 — слово0\nλέξη1 — слово1'));
  it('truncates after 10', () => expect(formatReply({ added: added(12), duplicates: [] })).toMatch(/λέξη9 — слово9\nи ещё 2$/));
  it('only duplicates', () => expect(formatReply({ added: [], duplicates: [lw({}), lw({ el: 'το νερό' })] })).toBe('Уже в словаре: το κλειδί, το νερό'));
  it('nothing -> null', () => expect(formatReply({ added: [], duplicates: [] })).toBeNull());
});
