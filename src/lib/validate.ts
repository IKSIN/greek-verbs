import type { Conj, Pos, Word } from './types';
import { stripAccents } from './answer';

export const CONJ_VALUES: Conj[] = ['A', 'B1', 'B2', '-ομαι', 'irregular'];
export const POS_VALUES: Pos[] = ['verb', 'noun', 'adj', 'adv', 'phrase', 'other'];

export const BASE_TAGS = [
  'повседневное', 'движение', 'еда', 'общение', 'учёба', 'работа', 'дом',
  'покупки', 'чувства', 'здоровье', 'мышление', 'отношения', 'путешествия', 'действия',
];

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const vowelGroups = (s: string) => (stripAccents(s.toLocaleLowerCase('el')).match(/[αεηιουω]+/g) ?? []).length;
const hasAccent = (s: string) => stripAccents(s) !== s;
const blank = (s: unknown) => typeof s !== 'string' || !s.trim();

export function validateWord(w: Word): string[] {
  if (!w || typeof w !== 'object') return ['запись не является объектом'];
  const at = w.el || w.id || '?';
  const e: string[] = [];
  if (!/^[a-z0-9-]+$/.test(w.id ?? '')) e.push(`${at}: некорректный id`);
  if (blank(w.el) || !GREEK.test(w.el)) e.push(`${at}: нет греческого слова`);
  else if (vowelGroups(w.el) > 1 && !hasAccent(w.el)) e.push(`${at}: нет ударения`);
  if (blank(w.ru)) e.push(`${at}: нет перевода`);
  if (w.conj !== undefined && !CONJ_VALUES.includes(w.conj)) e.push(`${at}: неизвестное спряжение ${w.conj}`);
  if (w.pos !== undefined && !POS_VALUES.includes(w.pos)) e.push(`${at}: неизвестная часть речи ${w.pos}`);
  if (!Array.isArray(w.tags) || w.tags.some(blank)) e.push(`${at}: некорректные теги`);
  if (w.source !== 'base' && w.source !== 'user') e.push(`${at}: некорректный source`);
  if (w.source === 'base') {
    if (w.pos !== 'verb') e.push(`${at}: у базового слова pos должен быть verb`);
    if (w.addedBy !== null) e.push(`${at}: у базового слова addedBy должен быть null`);
    if (blank(w.forms?.aorist) || blank(w.forms?.future)) e.push(`${at}: нет форм`);
    if (!w.conj) e.push(`${at}: нет спряжения`);
    if (blank(w.example?.el) || blank(w.example?.ru)) e.push(`${at}: нет примера`);
    if (!w.tags?.length || w.tags.some((t) => !BASE_TAGS.includes(t))) e.push(`${at}: теги вне списка`);
  }
  if (w.source === 'user' && blank(w.addedBy)) e.push(`${at}: нет автора`);
  if (!ISO.test(w.addedAt ?? '')) e.push(`${at}: некорректная дата`);
  return e;
}

export function validateWords(ws: Word[]): string[] {
  const e = ws.flatMap(validateWord);
  const ids = new Set<string>();
  const els = new Set<string>();
  for (const w of ws) {
    if (ids.has(w.id)) e.push(`дубликат id ${w.id}`);
    ids.add(w.id);
    if (w.source !== 'base') continue; // у пользовательских слов омонимы допустимы
    const k = stripAccents((w.el ?? '').toLocaleLowerCase('el'));
    if (els.has(k)) e.push(`дубликат слова ${w.el}`);
    els.add(k);
  }
  return e;
}
