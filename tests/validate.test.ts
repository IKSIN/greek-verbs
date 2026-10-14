import { describe, it, expect } from 'vitest';
import { validateWord, validateWords } from '../src/lib/validate';
import { word } from './fixtures';

const base = word({
  id: 'grafo', el: 'γράφω', ru: 'писать', pos: 'verb', conj: 'A', tags: ['общение'],
  forms: { aorist: 'έγραψα', future: 'θα γράψω' },
  example: { el: 'Γράφω ένα γράμμα.', ru: 'Я пишу письмо.' },
});
const user = word({ id: 'kolympao', el: 'κολυμπάω', ru: 'плавать', source: 'user', addedBy: 'Саша' });

describe('validateWord', () => {
  it('accepts a complete base word', () => expect(validateWord(base)).toEqual([]));
  it('accepts a minimal user word', () => expect(validateWord(user)).toEqual([]));
  it('requires accent on polysyllabic words', () =>
    expect(validateWord({ ...base, el: 'γραφω' }).join()).toMatch('нет ударения'));
  it('monosyllable without accent is fine', () =>
    expect(validateWord({ ...user, id: 'zo', el: 'ζω' })).toEqual([]));
  it('base word needs forms, conj, example and known tags', () => {
    const e = validateWord({ ...base, forms: undefined, conj: undefined, example: undefined, tags: ['xxx'] }).join();
    expect(e).toMatch('нет форм');
    expect(e).toMatch('нет спряжения');
    expect(e).toMatch('нет примера');
    expect(e).toMatch('теги вне списка');
  });
  it('user word needs author', () => expect(validateWord({ ...user, addedBy: null }).join()).toMatch('нет автора'));
  it('rejects unknown conj and bad date', () => {
    const e = validateWord({ ...base, conj: 'Z' as never, addedAt: '10.10.2026' }).join();
    expect(e).toMatch('неизвестное спряжение');
    expect(e).toMatch('некорректная дата');
  });
  it('rejects non-greek el and empty ru', () => {
    const e = validateWord({ ...user, el: 'kolympao', ru: ' ' }).join();
    expect(e).toMatch('нет греческого слова');
    expect(e).toMatch('нет перевода');
  });
  it('base word must be a verb', () =>
    expect(validateWord({ ...base, pos: undefined }).join()).toMatch('pos должен быть verb'));
  it('rejects unknown pos', () =>
    expect(validateWord({ ...user, pos: 'xxx' as never }).join()).toMatch('неизвестная часть речи'));
  it('user word may have any known pos or none', () => {
    expect(validateWord({ ...user, pos: 'noun', el: 'το κλειδί', id: 'kleidi' })).toEqual([]);
    expect(validateWord({ ...user, pos: undefined })).toEqual([]);
  });
});

describe('validateWords', () => {
  it('detects duplicate ids and duplicate words ignoring accents', () => {
    const e = validateWords([base, { ...base }, { ...base, id: 'grafo-2', el: 'γραφώ' }]).join();
    expect(e).toMatch('дубликат id grafo');
    expect(e).toMatch('дубликат слова');
  });
});

describe('validateWords duplicates', () => {
  const u1 = word({ id: 'a1', el: 'κολυμπάω', ru: 'плавать', source: 'user', addedBy: 'Саша' });
  const u2 = word({ id: 'a2', el: 'κολυμπάω', ru: 'купаться', source: 'user', addedBy: 'Маша' });
  it('allows user words with the same el', () => expect(validateWords([u1, u2])).toEqual([]));
  it('rejects base words with the same el', () =>
    expect(validateWords([base, { ...base, id: 'grafo-2' }]).join()).toMatch('дубликат слова'));
  it('rejects duplicate ids of any source', () =>
    expect(validateWords([u1, { ...u2, id: 'a1' }]).join()).toMatch('дубликат id'));
});
