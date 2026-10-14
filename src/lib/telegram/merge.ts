import type { Word } from '../types';
import { dedupKey, makeId } from '../wordId';
import { validateWord } from '../validate';
import { todayISO } from '../date';
import type { LlmWord } from './prompt';

export const TELEGRAM_AUTHOR = 'Telegram';

export interface MergeResult {
  words: Word[];
  added: Word[];
  duplicates: LlmWord[];
  invalid: { word: LlmWord; errors: string[] }[];
}

export function mergeWords(existing: Word[], incoming: LlmWord[], dates: Map<number, string>): MergeResult {
  const ids = new Set(existing.map((w) => w.id));
  const keys = new Set(existing.map((w) => dedupKey(w.el)));
  const dateOf = (x: LlmWord) => dates.get(x.sourceMessageId) ?? todayISO();
  // стабильная сортировка: при дублях внутри пачки побеждает более раннее сообщение
  const sorted = incoming.map((x, i) => ({ x, i })).sort((a, b) => dateOf(a.x).localeCompare(dateOf(b.x)) || a.i - b.i);
  const r: MergeResult = { words: [...existing], added: [], duplicates: [], invalid: [] };
  for (const { x } of sorted) {
    const key = dedupKey(x.el);
    if (keys.has(key)) { r.duplicates.push(x); continue; }
    const forms: NonNullable<Word['forms']> = {};
    if (x.aorist) forms.aorist = x.aorist;
    if (x.future) forms.future = x.future;
    const w: Word = {
      id: makeId(x.el, ids), el: x.el, ru: x.ru, pos: x.pos,
      ...(forms.aorist || forms.future ? { forms } : {}),
      ...(x.conj ? { conj: x.conj } : {}),
      tags: x.tags.slice(0, 2), source: 'user', addedBy: TELEGRAM_AUTHOR, addedAt: dateOf(x),
    };
    const errors = validateWord(w);
    if (errors.length) { r.invalid.push({ word: x, errors }); continue; }
    ids.add(w.id);
    keys.add(key);
    r.added.push(w);
    r.words.push(w);
  }
  return r;
}
