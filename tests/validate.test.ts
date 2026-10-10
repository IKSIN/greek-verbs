import { describe, it, expect } from 'vitest';
import { validateWord, validateWords } from '../src/lib/validate';
import { word } from './fixtures';

const base = word({
  id: 'grafo', el: 'γράφω', ru: 'писать', conj: 'A', tags: ['общение'],
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
});

describe('validateWords', () => {
  it('detects duplicate ids and duplicate words ignoring accents', () => {
    const e = validateWords([base, { ...base }, { ...base, id: 'grafo-2', el: 'γραφώ' }]).join();
    expect(e).toMatch('дубликат id grafo');
    expect(e).toMatch('дубликат слова');
  });
});
