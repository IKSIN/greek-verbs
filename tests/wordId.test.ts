import { describe, it, expect } from 'vitest';
import { makeId, transliterate } from '../src/lib/wordId';

describe('wordId', () => {
  it('transliterates', () => {
    expect(transliterate('γράφω')).toBe('grafo');
    expect(transliterate('έρχομαι')).toBe('erchomai');
    expect(transliterate('μπορώ')).toBe('mporo');
    expect(transliterate('ψήνω')).toBe('psino');
    expect(transliterate('θα γράψω')).toBe('tha-grapso');
  });
  it('suffixes on collision', () => {
    expect(makeId('γράφω', new Set())).toBe('grafo');
    expect(makeId('γράφω', new Set(['grafo', 'grafo-2']))).toBe('grafo-3');
  });
  it('falls back to "word" for non-greek input', () => expect(makeId('писать', new Set())).toBe('word'));
});
