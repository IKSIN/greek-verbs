// Разовый импорт, шаг 3: import/out-*.json → data/words.json + import/review.md
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Word } from '../src/lib/types';
import type { TgMessage } from '../src/lib/telegram/updates';
import { parseLlmWords } from '../src/lib/telegram/llm';
import { mergeWords } from '../src/lib/telegram/merge';
import { validateWords } from '../src/lib/validate';
import { POS_LABELS } from '../src/lib/labels';

const messages = JSON.parse(readFileSync('import/candidates.json', 'utf8')) as TgMessage[];
const ids = new Set(messages.map((m) => m.id));
const outs = readdirSync('import').filter((f) => /^out-\d+\.json$/.test(f)).sort();
const parsed = outs.map((f) => parseLlmWords(readFileSync(`import/${f}`, 'utf8'), ids));
const incoming = parsed.flatMap((p) => p.words);
const rejected = parsed.flatMap((p) => p.rejected);
const notes = new Map(incoming.map((w) => [w.el, w.note]));

const existing = JSON.parse(readFileSync('data/words.json', 'utf8')) as Word[];
const r = mergeWords(existing, incoming, new Map(messages.map((m) => [m.id, m.date])));
const errors = validateWords(r.words);
if (errors.length) throw new Error(`Словарь невалиден:\n${errors.join('\n')}`);
writeFileSync('data/words.json', JSON.stringify(r.words, null, 2) + '\n');

const cell = (s: string) => s.replace(/\|/g, '\\|');
const byPos = Object.entries(POS_LABELS).map(([p, l]) => `${l}: ${r.added.filter((w) => w.pos === p).length}`).join(', ');
const md = [
  `# Импорт из Telegram — ${r.added.length} слов`, '',
  `Файлов: ${outs.length}. Дублей пропущено: ${r.duplicates.length}. Невалидных: ${r.invalid.length}. Отброшено при разборе: ${rejected.length}.`,
  `По частям речи — ${byPos}.`, '',
  '| # | Греческое | Перевод | Часть речи | Темы | Дата | Исправлено |', '|---|---|---|---|---|---|---|',
  ...r.added.map((w, i) => `| ${i + 1} | ${cell(w.el)} | ${cell(w.ru)} | ${POS_LABELS[w.pos!]} | ${w.tags.join(', ')} | ${w.addedAt} | ${cell(notes.get(w.el) ?? '')} |`),
  '', '## Невалидные', ...r.invalid.map((x) => `- ${x.word.el}: ${x.errors.join('; ')}`),
  '', '## Отброшено при разборе', ...rejected.map((x) => `- ${x}`),
].join('\n');
writeFileSync('import/review.md', md + '\n');
console.log(`Добавлено ${r.added.length}, дублей ${r.duplicates.length}, невалидных ${r.invalid.length}. См. import/review.md`);
