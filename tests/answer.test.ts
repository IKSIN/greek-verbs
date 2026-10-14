import { describe, it, expect } from 'vitest';
import { checkAnswer, normalize, stripAccents, stripArticle } from '../src/lib/answer';

describe('checkAnswer', () => {
  it('exact match', () => expect(checkAnswer('γράφω', 'γράφω')).toBe('correct'));
  it('ignores case and surrounding spaces', () => expect(checkAnswer('  ΓΡΆΦΩ ', 'γράφω')).toBe('correct'));
  it('decomposed input equals composed', () => expect(checkAnswer('γρα\u0301φω', 'γράφω')).toBe('correct'));
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

describe('articles', () => {
  it('strips leading article of any case', () => {
    expect(stripArticle('το κλειδί')).toBe('κλειδί');
    expect(stripArticle('Το μήνυμα')).toBe('μήνυμα');
    expect(stripArticle('οι φίλοι')).toBe('φίλοι');
    expect(stripArticle('η ώρα')).toBe('ώρα');
  });
  it('keeps words that only start like an article', () => {
    expect(stripArticle('ηθοποιός')).toBe('ηθοποιός');
    expect(stripArticle('τα')).toBe('τα');
  });
  it('missing article -> article', () => expect(checkAnswer('κλειδί', 'το κλειδί')).toBe('article'));
  it('missing article and accent -> article', () => expect(checkAnswer('κλειδι', 'το κλειδί')).toBe('article'));
  it('full answer with article -> correct', () => expect(checkAnswer('το κλειδί', 'το κλειδί')).toBe('correct'));
  it('wrong article -> wrong', () => expect(checkAnswer('η κλειδί', 'το κλειδί')).toBe('wrong'));
});
