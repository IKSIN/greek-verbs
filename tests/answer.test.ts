import { describe, it, expect } from 'vitest';
import { checkAnswer, normalize, stripAccents } from '../src/lib/answer';

describe('checkAnswer', () => {
  it('exact match', () => expect(checkAnswer('γράφω', 'γράφω')).toBe('correct'));
  it('ignores case and surrounding spaces', () => expect(checkAnswer('  ΓΡΆΦΩ ', 'γράφω')).toBe('correct'));
  it('decomposed input equals composed', () => expect(checkAnswer('γράφω', 'γράφω')).toBe('correct'));
  it('missing accent -> accent', () => expect(checkAnswer('γραφω', 'γράφω')).toBe('accent'));
  it('accent on wrong syllable -> accent', () => expect(checkAnswer('γραφώ', 'γράφω')).toBe('accent'));
  it('different word -> wrong', () => expect(checkAnswer('γράψω', 'γράφω')).toBe('wrong'));
  it('empty input -> wrong', () => expect(checkAnswer('', 'γράφω')).toBe('wrong'));
  it('whitespace-only input -> wrong', () => expect(checkAnswer('   ', 'γράφω')).toBe('wrong'));
  it('latin transliteration -> wrong', () => expect(checkAnswer('grafo', 'γράφω')).toBe('wrong'));
});

describe('normalize', () => {
  it('collapses spaces and fixes final sigma', () =>
    expect(normalize('  καλοσ   φίλοσ ')).toBe('καλος φίλος'));
  it('keeps medial sigma', () => expect(normalize('σπίτι')).toBe('σπίτι'));
});

describe('stripAccents', () => {
  it('removes tonos and dialytika', () => expect(stripAccents('ά έ ϊ ΐ')).toBe('α ε ι ι'));
});
