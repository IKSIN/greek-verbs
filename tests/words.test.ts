import { describe, it, expect } from 'vitest';
import words from '../data/words.json';
import { validateWords } from '../src/lib/validate';
import { transliterate } from '../src/lib/wordId';
import type { Word } from '../src/lib/types';

const ws = words as Word[];

describe('data/words.json', () => {
  it('is valid', () => expect(validateWords(ws)).toEqual([]));
  it('has exactly 200 base verbs', () => expect(ws.filter((w) => w.source === 'base')).toHaveLength(200));
  it('all base words are verbs', () => expect(ws.filter((w) => w.source === 'base' && w.pos !== 'verb')).toEqual([]));
  it('base ids are transliterations of el', () => {
    for (const w of ws.filter((x) => x.source === 'base')) expect(w.id).toMatch(new RegExp(`^${transliterate(w.el)}(-\\d+)?$`));
  });
});
