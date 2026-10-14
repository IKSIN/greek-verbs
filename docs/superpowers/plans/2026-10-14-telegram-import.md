# Telegram Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в словарь часть речи, перенести накопленные слова из Telegram-группы и настроить бота, который раз в час через GitHub Actions + OpenRouter добавляет новые слова из группы.

**Architecture:**
- Чистая логика лежит в `src/lib/telegram/*`, без Node API, тестируется Vitest с моками `fetch`.
- Оркестрация живёт в `scripts/telegram-import.ts`: HTTP к Telegram и OpenRouter, файлы, git. Скрипт запускается через `tsx` в workflow по cron.
- Разовый импорт:
  - скрипты `extract-telegram-export.ts` и `merge-import.ts`;
  - между ними чистка субагентами по тому же промпту, что у бота.

**Tech Stack:**
- Svelte 5 + TypeScript strict, Vitest 5;
- Node 24 + `tsx` для скриптов;
- GitHub Actions;
- Telegram Bot API (`getUpdates`/`sendMessage`), OpenRouter chat completions со structured outputs.

**Spec:** `docs/superpowers/specs/2026-10-14-telegram-import-design.md`

## Global Constraints

- **Значения `pos`** ровно такие: `verb | noun | adj | adv | phrase | other`. Подписи: глагол, существительное, прилагательное, наречие, фраза, другое.
- **Базовые слова:** 200 штук, у каждого `pos: "verb"`. Слова из Telegram: `source: "user"`, `addedBy: "Telegram"`, `addedAt` = дата сообщения (YYYY-MM-DD, UTC).
- **Формат `data/words.json`:** `JSON.stringify(words, null, 2) + '\n'`.
- **Ведущие артикли:** `ο|η|το|οι|τα`, без учёта регистра. `id` строится без артикля: `το κλειδί` → `kleidi`.
- **`dedupKey`:** NFC, trim, схлопнутые пробелы, нижний регистр, финальная σ→ς, без ведущего артикля, без завершающей пунктуации `.,!?;:·`, без диакритики.
- **OpenRouter:** модель по умолчанию `anthropic/claude-haiku-5.5`, переопределяется `OPENROUTER_MODEL`; `temperature: 0`; `response_format` — `json_schema` со `strict: true`.
- **Батчи:** до 30 сообщений на запрос к OpenRouter у бота, ~60 сообщений на субагента при разовом импорте.
- **Секреты:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `OPENROUTER_API_KEY`; переменная `OPENROUTER_MODEL`.
- **Cron:** `'17 * * * *'`; `concurrency: telegram-import`; `cancel-in-progress: false`.
- **Сообщения коммитов бота:** `words: add N from Telegram` / `telegram: advance offset`. Разовый импорт: `words: import N words from Telegram`.
- **Ответ бота:** до 10 слов, затем «и ещё K»; при одних дублях — «Уже в словаре: …»; если слов нет, бот молчит.
- **Код в `src/lib/**`** не использует Node API: он проверяется `svelte-check` с конфигом браузера.
- **Тексты UI** на русском. Комментарии в коде — по-русски и кратко, как в существующем коде.

## Review Focus

1. **Существительное с заглавным артиклем** (`Το μήνυμα`) против уже существующего `το μήνυμα`. Ожидается дубль, слово не добавляется. Тест в Task 2 (`dedupKey`) и Task 6 (merge).
2. **Ответ модели в ```json-ограждении или с лишним текстом.** Ожидается, что JSON всё равно разбирается. Если JSON нет — ошибка запуска, offset не двигается. Тест в Task 5.
3. **Одно сообщение пришло и как `message`, и как `edited_message` в одной пачке.** Ожидается, что в модель оно уходит один раз, в последней редакции. Тест в Task 4.
4. **Push бота конфликтует с коммитом из приложения.** Ожидается, что бот перечитает свежий `words.json`, заново проверит дубли и повторит попытку, не затерев чужое слово. Ручная проверка в Task 7, код повторов с `fetch` + `reset --hard origin/main`.
5. **Слово без `pos`** (старые пользовательские). В фильтре оно проходит только «другое». В форме редактирования показывается «другое», и поля спряжения скрыты, пока не выбрать «глагол». Тест в Task 3.

---

### Task 1: Поле `pos` в модели, валидации и данных

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/labels.ts`, `src/lib/validate.ts`, `data/words.json`
- Test: `tests/validate.test.ts`, `tests/words.test.ts`

**Interfaces:**
- Produces:
  - `type Pos = 'verb' | 'noun' | 'adj' | 'adv' | 'phrase' | 'other'`;
  - `Word.pos?: Pos`;
  - `POS_VALUES: Pos[]` (в `validate.ts`);
  - `POS_LABELS: Record<Pos, string>` (в `labels.ts`).

- [ ] **Step 1: Тесты.** В `tests/validate.test.ts` добавить `pos: 'verb'` в объект `base` (иначе он станет невалидным) и новые кейсы в `describe('validateWord')`:

```ts
  it('base word must be a verb', () =>
    expect(validateWord({ ...base, pos: undefined }).join()).toMatch('pos должен быть verb'));
  it('rejects unknown pos', () =>
    expect(validateWord({ ...user, pos: 'xxx' as never }).join()).toMatch('неизвестная часть речи'));
  it('user word may have any known pos or none', () => {
    expect(validateWord({ ...user, pos: 'noun', el: 'το κλειδί', id: 'kleidi' })).toEqual([]);
    expect(validateWord({ ...user, pos: undefined })).toEqual([]);
  });
```

В `tests/words.test.ts`:

```ts
  it('all base words are verbs', () => expect(ws.filter((w) => w.source === 'base' && w.pos !== 'verb')).toEqual([]));
```

- [ ] **Step 2:** `npx vitest run tests/validate.test.ts tests/words.test.ts` → FAIL (новые проверки).

- [ ] **Step 3: Реализация.**

`src/lib/types.ts`: после `Grade` добавить

```ts
export type Pos = 'verb' | 'noun' | 'adj' | 'adv' | 'phrase' | 'other';
```

В `Word` после `ru: string;` добавить `pos?: Pos;`.

`src/lib/validate.ts`: импорт `Pos`, рядом с `CONJ_VALUES`

```ts
export const POS_VALUES: Pos[] = ['verb', 'noun', 'adj', 'adv', 'phrase', 'other'];
```

В `validateWord` после проверки `conj`:

```ts
  if (w.pos !== undefined && !POS_VALUES.includes(w.pos)) e.push(`${at}: неизвестная часть речи ${w.pos}`);
```

В блоке `if (w.source === 'base')` первой строкой:

```ts
    if (w.pos !== 'verb') e.push(`${at}: у базового слова pos должен быть verb`);
```

`src/lib/labels.ts`:

```ts
export const POS_LABELS: Record<Pos, string> = {
  verb: 'глагол', noun: 'существительное', adj: 'прилагательное', adv: 'наречие', phrase: 'фраза', other: 'другое',
};
```

`data/words.json`: всем 200 записям добавить `"pos": "verb"` сразу после `"ru"`. Скрипт:

```bash
node -e '
const fs=require("fs");const ws=JSON.parse(fs.readFileSync("data/words.json","utf8"));
const out=ws.map(w=>{const o={};for(const[k,v]of Object.entries(w)){o[k]=v;if(k==="ru")o.pos=w.source==="base"?"verb":w.pos;}return Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined));});
fs.writeFileSync("data/words.json",JSON.stringify(out,null,2)+"\n");'
git diff --stat data/words.json   # ожидается ровно 200 вставленных строк
```

- [ ] **Step 4:** `npm test && npm run check` → PASS.

- [ ] **Step 5: Commit:** `git add -A src/lib tests data && git commit -m "feat: part of speech field (pos)"`

---

### Task 2: Артикли — `stripArticle`, вердикт `article`, `dedupKey`, `makeId`

**Files:**
- Modify: `src/lib/answer.ts`, `src/lib/wordId.ts`, `src/screens/TypeAnswer.svelte`, `src/screens/AddWord.svelte`
- Test: `tests/answer.test.ts`, `tests/wordId.test.ts`

**Interfaces:**
- Produces:
  - `stripArticle(s: string): string` (в `answer.ts`);
  - `AnswerResult = 'correct' | 'accent' | 'article' | 'wrong'`;
  - `dedupKey(el: string): string` (в `wordId.ts`);
  - `makeId` транслитерирует `stripArticle(el)`.

- [ ] **Step 1: Тесты.** `tests/answer.test.ts`, новый `describe`:

```ts
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
```

Импорт дополнить `stripArticle`.

`tests/wordId.test.ts`, новые кейсы (импорт `dedupKey`):

```ts
  it('id ignores leading article', () => {
    expect(makeId('το κλειδί', new Set())).toBe('kleidi');
    expect(makeId('Η πετσέτα', new Set(['petseta']))).toBe('petseta-2');
  });
  it('dedupKey ignores case, accents, article, spaces and trailing punctuation', () => {
    expect(dedupKey('Το  Μήνυμα ')).toBe(dedupKey('το μήνυμα'));
    expect(dedupKey('γιατί;')).toBe(dedupKey('γιατι'));
    expect(dedupKey('καλοσ')).toBe(dedupKey('καλός'));
    expect(dedupKey('το κλειδί')).not.toBe(dedupKey('το κλειδιά'));
  });
```

- [ ] **Step 2:** `npx vitest run tests/answer.test.ts tests/wordId.test.ts` → FAIL.

- [ ] **Step 3: Реализация.** `src/lib/answer.ts`:

```ts
export type AnswerResult = 'correct' | 'accent' | 'article' | 'wrong';

const ARTICLE = /^(?:ο|η|το|οι|τα)\s+(?=\S)/iu;

export function stripArticle(s: string): string {
  return s.trim().replace(ARTICLE, '');
}
```

В `checkAnswer` перед `return 'wrong'`:

```ts
  const bare = stripArticle(b);
  if (bare !== b && stripAccents(a) === stripAccents(bare)) return 'article';
```

`src/lib/wordId.ts`:

```ts
import { normalize, stripAccents, stripArticle } from './answer';

export function dedupKey(el: string): string {
  return stripAccents(stripArticle(normalize(el)).replace(/[.,!?;:·]+$/, '').trim());
}
```

В `makeId`: `const base = transliterate(stripArticle(el)) || 'word';`

`src/screens/TypeAnswer.svelte`:
- `GRADE` дополнить `article: 'hard'`;
- после ветки `accent` добавить:

```svelte
  {:else if result === 'article'}
    <p class="warn">⚠️ Почти: не забудьте артикль — {item.word.el}</p>
```

`src/screens/AddWord.svelte`: удалить локальную `key` и импорт `stripAccents`, импортировать `dedupKey` из `../lib/wordId`. Проверка дубля:

```ts
  const duplicate = $derived(el.trim() ? app.words.find((w) => w.id !== edit?.id && dedupKey(w.el) === dedupKey(el)) : undefined);
```

- [ ] **Step 4:** `npm test && npm run check` → PASS. Существующий тест `transliterate('θα γράψω') → 'tha-grapso'` не меняется: `transliterate` артикли не трогает.

- [ ] **Step 5: Commit:** `git commit -am "feat: article-aware answers, ids and dedup key"`

---

### Task 3: Фильтр и UI части речи

**Files:**
- Modify: `src/lib/filters.ts`, `src/screens/Dictionary.svelte`, `src/screens/AddWord.svelte`, `src/components/WordInfo.svelte`
- Test: `tests/filters.test.ts`

**Interfaces:**
- Consumes: `Pos`, `POS_VALUES`, `POS_LABELS` (Task 1).
- Produces: `WordFilter.pos: Pos[]`; `emptyFilter().pos === []`.

- [ ] **Step 1: Тесты.** В `tests/filters.test.ts` (фикстуры `WORDS` не имеют `pos`, так что они все «другое»):

```ts
describe('pos filter', () => {
  const ws = [
    { ...WORDS[0], pos: 'verb' as const },
    { ...WORDS[4], pos: 'noun' as const },
    WORDS[5], // без pos
  ];
  const run = (pos: WordFilter['pos']) => applyFilter(ws, { ...emptyFilter(), pos }, {}, 'el-ru').map((w) => w.id);
  it('filters by pos (OR inside group)', () => expect(run(['verb', 'noun'])).toEqual(['grafo', 'psino']));
  it('word without pos counts as other', () => expect(run(['other'])).toEqual(['kolympao']));
  it('pos activates filter', () => {
    expect(emptyFilter().pos).toEqual([]);
    expect(isFilterActive({ ...emptyFilter(), pos: ['adj'] })).toBe(true);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/filters.test.ts` → FAIL.

- [ ] **Step 3: Реализация.** `src/lib/filters.ts`:
- `WordFilter` получает `pos: Pos[]` (импорт `Pos`);
- в `emptyFilter` добавить `pos: []`;
- в `isFilterActive` добавить `f.pos` в массив групп;
- в `applyFilter` после строки `conj`:

```ts
    if (f.pos.length && !f.pos.includes(w.pos ?? 'other')) return false;
```

`src/screens/Dictionary.svelte`:
- импортировать `POS_LABELS` и `POS_VALUES`;
- объявить `const posOpts = POS_VALUES.map((v) => ({ value: v, label: POS_LABELS[v] }));`;
- перед чипами «Спряжение»:

```svelte
    <FilterChips label="Часть речи" options={posOpts} selected={app.filter.pos} onchange={(v) => (app.filter.pos = v)} />
```

`src/screens/AddWord.svelte`:
- `let pos = $state<Pos>(edit?.pos ?? 'other');` (импорт `Pos`, `POS_VALUES`, `POS_LABELS`);
- `const isVerb = $derived(pos === 'verb');`
- в `build()`: `w.pos = pos;`. Блоки `forms` и `conj` выполнять только `if (isVerb)`. Поле `pos` в объекте ставить после `ru`, чтобы порядок ключей совпадал с данными:

```ts
    const w: Word = {
      id: ..., el: el.trim(), ru: ru.trim(), pos,
      tags: [...tags], source: ..., addedBy: ..., addedAt: ...,
    };
```

- в `reset()`: `pos = 'other';`
- в разметке после поля «Перевод»:

```svelte
  <label>Часть речи
    <select bind:value={pos}>
      {#each POS_VALUES as p (p)}<option value={p}>{POS_LABELS[p]}</option>{/each}
    </select>
  </label>
```

- блок `<div class="two">` с аористом/будущим и `<label>Спряжение` обернуть в `{#if isVerb} … {/if}`.

`src/components/WordInfo.svelte`: заменить строку спряжения на

```svelte
  {#if word.pos || word.conj}
    <p class="muted">{[word.pos && POS_LABELS[word.pos], word.conj && `спряжение ${CONJ_LABELS[word.conj]}`].filter(Boolean).join(' · ')}</p>
  {/if}
```

- [ ] **Step 4:** `npm test && npm run check && npm run build` → PASS.

- [ ] **Step 5: Commit:** `git commit -am "feat: part of speech filter and form field"`

---

### Task 4: Telegram — промпт, схема, разбор updates и экспорта

**Files:**
- Create: `src/lib/telegram/prompt.ts`, `src/lib/telegram/updates.ts`, `src/lib/telegram/export.ts`
- Test: `tests/telegram-updates.test.ts`

**Interfaces:**
- Produces:
  - `interface TgMessage { id: number; date: string; text: string }` — `date` в формате YYYY-MM-DD (UTC);
  - `interface TgUpdate`;
  - `extractMessages(updates: TgUpdate[], chatId: number): TgMessage[]`;
  - `nextOffset(updates: TgUpdate[], current: number): number`;
  - `listChats(updates: TgUpdate[]): { id: number; title: string }[]`;
  - `hasGreek(s: string): boolean`;
  - `messagesFromExport(data: unknown): TgMessage[]`;
  - `SYSTEM_PROMPT: string`, `WORDS_SCHEMA: object`;
  - `interface LlmWord { el; ru; pos: Pos; tags: string[]; aorist: string | null; future: string | null; conj: Conj | null; note: string | null; sourceMessageId: number }`.
- Ruling: формы в ответе модели — плоские поля `aorist`/`future`, а не объект `forms`. Strict-схема проще, а `merge` всё равно собирает `Word.forms`.

- [ ] **Step 1: Тесты** `tests/telegram-updates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractMessages, hasGreek, listChats, nextOffset, type TgUpdate } from '../src/lib/telegram/updates';
import { messagesFromExport } from '../src/lib/telegram/export';

const CHAT = -100123;
const msg = (update_id: number, message_id: number, text: string, extra: Record<string, unknown> = {}): TgUpdate => ({
  update_id,
  message: { message_id, date: 1760400000, chat: { id: CHAT, type: 'supergroup', title: 'Greek' }, from: { is_bot: false }, text, ...extra },
});

describe('extractMessages', () => {
  it('keeps greek text messages of the chat with UTC date', () =>
    expect(extractMessages([msg(1, 10, 'το κλειδί - ключ')], CHAT)).toEqual([{ id: 10, date: '2025-10-14', text: 'το κλειδί - ключ' }]));
  it('drops other chats, bots and messages without greek', () => {
    const other = msg(2, 11, 'το νερό'); other.message!.chat.id = 5;
    const bot = msg(3, 12, 'το νερό', { from: { is_bot: true } });
    expect(extractMessages([other, bot, msg(4, 13, 'Д\\З: стр. 5')], CHAT)).toEqual([]);
  });
  it('uses caption when there is no text', () =>
    expect(extractMessages([msg(5, 14, undefined as never, { caption: 'η βροχή-дождь' })], CHAT)[0].text).toBe('η βροχή-дождь'));
  it('edited message replaces original with same id', () => {
    const edited: TgUpdate = { update_id: 7, edited_message: { ...msg(0, 10, 'το κλειδί - ключи').message! } };
    expect(extractMessages([msg(6, 10, 'το κλειδι'), edited], CHAT)).toEqual([{ id: 10, date: '2025-10-14', text: 'το κλειδί - ключи' }]);
  });
});

describe('offset and chats', () => {
  it('next offset is max update_id + 1', () => expect(nextOffset([msg(5, 1, 'α'), msg(9, 2, 'β')], 3)).toBe(10));
  it('keeps offset when no updates', () => expect(nextOffset([], 42)).toBe(42));
  it('lists distinct chats', () => expect(listChats([msg(1, 1, 'α'), msg(2, 2, 'β')])).toEqual([{ id: CHAT, title: 'Greek' }]));
  it('hasGreek', () => { expect(hasGreek('ключ κ')).toBe(true); expect(hasGreek('ключ')).toBe(false); });
});

describe('messagesFromExport', () => {
  it('flattens entity text and filters service and non-greek messages', () => {
    const data = { messages: [
      { id: 1, type: 'message', date: '2025-06-07T10:00:00', text: [{ type: 'bold', text: 'Сущ:' }, '\nτο κορίτσι-девочка'] },
      { id: 2, type: 'service', date: '2025-06-07T10:00:00', text: 'το' },
      { id: 3, type: 'message', date: '2025-06-07T10:00:00', text: 'Д\\З' },
    ] };
    expect(messagesFromExport(data)).toEqual([{ id: 1, date: '2025-06-07', text: 'Сущ:\nτο κορίτσι-девочка' }]);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/telegram-updates.test.ts` → FAIL (модулей нет).

- [ ] **Step 3: Реализация.**

`src/lib/telegram/updates.ts`:

```ts
export interface TgMessage { id: number; date: string; text: string }

interface RawMessage {
  message_id: number;
  date: number; // unix, секунды
  chat: { id: number; type: string; title?: string };
  from?: { is_bot?: boolean };
  text?: string;
  caption?: string;
}
export interface TgUpdate { update_id: number; message?: RawMessage; edited_message?: RawMessage }

const GREEK = /[Ͱ-Ͽἀ-῿]/;
export const hasGreek = (s: string): boolean => GREEK.test(s);

export function extractMessages(updates: TgUpdate[], chatId: number): TgMessage[] {
  const byId = new Map<number, TgMessage>();
  for (const u of updates) {
    const m = u.edited_message ?? u.message;
    if (!m || m.chat.id !== chatId || m.from?.is_bot) continue;
    const text = (m.text ?? m.caption ?? '').trim();
    if (!hasGreek(text)) continue;
    byId.set(m.message_id, { id: m.message_id, date: new Date(m.date * 1000).toISOString().slice(0, 10), text });
  }
  return [...byId.values()];
}

export const nextOffset = (updates: TgUpdate[], current: number): number =>
  updates.length ? Math.max(...updates.map((u) => u.update_id)) + 1 : current;

export function listChats(updates: TgUpdate[]): { id: number; title: string }[] {
  const m = new Map<number, string>();
  for (const u of updates) {
    const c = (u.message ?? u.edited_message)?.chat;
    if (c) m.set(c.id, c.title ?? c.type);
  }
  return [...m].map(([id, title]) => ({ id, title }));
}
```

`src/lib/telegram/export.ts` (формат `result.json` Telegram Desktop):

```ts
import { hasGreek, type TgMessage } from './updates';

type ExportText = string | ({ text: string } | string)[];
interface ExportMessage { id: number; type: string; date: string; text?: ExportText }

const flatten = (t: ExportText | undefined): string =>
  typeof t === 'string' ? t : (t ?? []).map((x) => (typeof x === 'string' ? x : x.text)).join('');

export function messagesFromExport(data: unknown): TgMessage[] {
  const ms = (data as { messages?: ExportMessage[] }).messages ?? [];
  return ms
    .filter((m) => m.type === 'message')
    .map((m) => ({ id: m.id, date: m.date.slice(0, 10), text: flatten(m.text).trim() }))
    .filter((m) => hasGreek(m.text));
}
```

`src/lib/telegram/prompt.ts`:

```ts
import type { Conj, Pos } from '../types';

export interface LlmWord {
  el: string;
  ru: string;
  pos: Pos;
  tags: string[];
  aorist: string | null;
  future: string | null;
  conj: Conj | null;
  note: string | null;
  sourceMessageId: number;
}

const nullableString = { type: ['string', 'null'] };

export const WORDS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['words'],
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['el', 'ru', 'pos', 'tags', 'aorist', 'future', 'conj', 'note', 'sourceMessageId'],
        properties: {
          el: { type: 'string' },
          ru: { type: 'string' },
          pos: { type: 'string', enum: ['verb', 'noun', 'adj', 'adv', 'phrase', 'other'] },
          tags: { type: 'array', items: { type: 'string' } },
          aorist: nullableString,
          future: nullableString,
          conj: { type: ['string', 'null'], enum: ['A', 'B1', 'B2', '-ομαι', 'irregular', null] },
          note: nullableString,
          sourceMessageId: { type: 'integer' },
        },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `Ты помогаешь вести словарь современного греческого для двух русскоязычных учеников уровня A2.
На входе — JSON-массив сообщений из их учебного Telegram-чата: [{"id", "date", "text"}].
Извлеки из сообщений все греческие слова и выражения с переводом на русский и верни их в поле "words".

Что извлекать:
- Пары «греческое — русское» в любом виде: "το κλειδί-ключ", "βράζω - варить", "η ατζέντα (блокнот)", списки под заголовками «Существительные:», «Словарь:» и т. п.
- Греческое слово без перевода — тоже, переведи сам.
- Если в одной строке через "=" даны синонимы ("περισσότερο=πιο πολύ-больше"), сделай отдельную запись для каждого.

Что игнорировать (не возвращать ничего):
- домашние задания ("Д\\З", "Д.з."), расписание, бытовую переписку, ссылки, названия файлов;
- вопросы преподавателю и объяснения грамматических правил, если в них нет новых слов;
- предложения-упражнения целиком (например "1. Λύγο πιο μακριά βλέπουμε…"), таблицы спряжений и склонений (μου αρέσει/σου αρέσει/… — возьми только базовое выражение один раз).

Как записывать:
- el — с правильными ударениями, исправь опечатки (έφηβοσ → ο έφηβος, διαδύκτιο → το διαδίκτυο, υπα'λληλος → ο υπάλληλος). Строчная буква в начале, кроме имён собственных.
- Существительное (pos "noun"): с артиклем в именительном падеже единственного числа ("το κλειδί"). Если артикля нет — добавь правильный. Множественное только для слов, которые существуют лишь во множественном ("τα λεφτά", "οι διακοπές").
- Прилагательное (pos "adj"): мужской род ("ψηλός"), без окончаний ",η,ο".
- Глагол (pos "verb"): 1-е лицо ед. ч. настоящего времени ("τελειώνει" → "τελειώνω", "ξύπνησα" → "ξυπνάω"). Если известны — aorist (1 л. ед. ч., "έγραψα"), future ("θα γράψω"), conj: "A" (-ω с ударением не на окончании), "B1" (-άω/-ώ как αγαπάω), "B2" (-ώ как μπορώ), "-ομαι", "irregular". Иначе null.
- pos "adv": наречия, предлоги, союзы, местоимения, вопросительные слова ("εδώ", "για", "γιατί;", "πότε;").
- pos "phrase": любое многословное выражение, кроме существительного с артиклем и глагола с θα/να ("καλή όρεξη!", "κάνω βόλτα", "μου αρέσει").
- pos "other": числительные и всё, что не подходит выше.
- ru — перевод как в сообщении, исправь опечатки; несколько значений через запятую; уточнения в скобках сохрани ("встреча (официальная)"). Транскрипции кириллицей ("(йенэслья)") убери.
- tags — 0–2 тематических тега на русском в нижнем регистре ("еда", "дом", "погода", "работа", "транспорт", "семья", "спорт", "здоровье", "город", "время"…). Без тегов частей речи.
- note — коротко, что ты исправил ("опечатка: διαδύκτιο", "форма: τελειώνει → τελειώνω", "добавлен артикль"), иначе null.
- sourceMessageId — id сообщения, откуда взято слово.
- Одно и то же слово в пределах ответа — один раз.

Примеры.
Вход: [{"id":1,"date":"2025-06-07","text":"Наречия2:\\n\\nμαζί-вместе\\n\\nπερισσότερο=πιο πολύ-больше"}]
Выход: {"words":[{"el":"μαζί","ru":"вместе","pos":"adv","tags":[],"aorist":null,"future":null,"conj":null,"note":null,"sourceMessageId":1},{"el":"περισσότερο","ru":"больше","pos":"adv","tags":[],"aorist":null,"future":null,"conj":null,"note":null,"sourceMessageId":1},{"el":"πιο πολύ","ru":"больше","pos":"phrase","tags":[],"aorist":null,"future":null,"conj":null,"note":null,"sourceMessageId":1}]}

Вход: [{"id":2,"date":"2025-08-28","text":"ψηλός,η,ο-высокий\\n\\nτο κρυολόγημα-простуда\\n\\nτελειώνει закончится"}]
Выход: {"words":[{"el":"ψηλός","ru":"высокий","pos":"adj","tags":[],"aorist":null,"future":null,"conj":null,"note":null,"sourceMessageId":2},{"el":"το κρυολόγημα","ru":"простуда","pos":"noun","tags":["здоровье"],"aorist":null,"future":null,"conj":null,"note":null,"sourceMessageId":2},{"el":"τελειώνω","ru":"заканчивать, заканчиваться","pos":"verb","tags":[],"aorist":"τελείωσα","future":"θα τελειώσω","conj":"A","note":"форма: τελειώνει → τελειώνω","sourceMessageId":2}]}

Вход: [{"id":3,"date":"2025-07-02","text":"Д\\\\З: Урок 4 упр.1 (1-7 предл.)+Μάθημα 2 трэк 20 стр.37 упр.26"}]
Выход: {"words":[]}`;
```

- [ ] **Step 4:** `npm test && npm run check` → PASS.

- [ ] **Step 5: Commit:** `git add src/lib/telegram tests/telegram-updates.test.ts && git commit -m "feat(telegram): updates/export parsing and extraction prompt"`

---

### Task 5: Telegram — запрос к OpenRouter и проверка ответа

**Files:**
- Create: `src/lib/telegram/llm.ts`
- Test: `tests/telegram-llm.test.ts`

**Interfaces:**
- Consumes: `TgMessage`, `LlmWord`, `SYSTEM_PROMPT`, `WORDS_SCHEMA` (Task 4); `POS_VALUES`, `CONJ_VALUES` (`validate.ts`).
- Produces:
  - `DEFAULT_MODEL = 'anthropic/claude-haiku-5.5'`;
  - `BATCH_SIZE = 30`;
  - `parseLlmWords(content: string, ids: Set<number>): { words: LlmWord[]; rejected: string[] }` — бросает `Error` при невалидном JSON или структуре;
  - `extractWords(messages: TgMessage[], opts: { apiKey: string; model?: string; fetch?: typeof fetch }): Promise<{ words: LlmWord[]; rejected: string[] }>`.

- [ ] **Step 1: Тесты** `tests/telegram-llm.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { BATCH_SIZE, DEFAULT_MODEL, extractWords, parseLlmWords } from '../src/lib/telegram/llm';

const item = (p: Record<string, unknown> = {}) => ({
  el: 'το κλειδί', ru: 'ключ', pos: 'noun', tags: ['дом'], aorist: null, future: null, conj: null, note: null, sourceMessageId: 1, ...p,
});
const body = (words: unknown[]) => JSON.stringify({ words });

describe('parseLlmWords', () => {
  it('accepts valid response', () => expect(parseLlmWords(body([item()]), new Set([1])).words).toEqual([item()]));
  it('accepts JSON in a code fence', () =>
    expect(parseLlmWords('```json\n' + body([item()]) + '\n```', new Set([1])).words).toHaveLength(1));
  it('throws on non-JSON', () => expect(() => parseLlmWords('Sorry, I cannot', new Set([1]))).toThrow());
  it('throws when words is not an array', () => expect(() => parseLlmWords('{"words":5}', new Set([1]))).toThrow());
  it('rejects unknown pos and foreign message id, keeps the rest', () => {
    const r = parseLlmWords(body([item({ pos: 'xxx' }), item({ sourceMessageId: 99 }), item({ el: 'η πόρτα' })]), new Set([1]));
    expect(r.words.map((w) => w.el)).toEqual(['η πόρτα']);
    expect(r.rejected).toHaveLength(2);
  });
  it('rejects empty el/ru and bad conj, normalizes tags', () => {
    const r = parseLlmWords(body([item({ ru: ' ' }), item({ conj: 'Z' }), item({ tags: [' Дом ', 'дом', ''] })]), new Set([1]));
    expect(r.rejected).toHaveLength(2);
    expect(r.words[0].tags).toEqual(['дом']);
  });
});

describe('extractWords', () => {
  const ok = (words: unknown[]) => new Response(JSON.stringify({ choices: [{ message: { content: body(words) } }] }), { status: 200 });
  const msgs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, date: '2026-10-13', text: 'το νερό' }));

  it('sends model, schema and messages; returns words', async () => {
    const f = vi.fn(async () => ok([item()]));
    const r = await extractWords(msgs(1), { apiKey: 'k', fetch: f as never });
    expect(r.words).toHaveLength(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe(DEFAULT_MODEL);
    expect(sent.temperature).toBe(0);
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(JSON.parse(sent.messages[1].content)).toEqual(msgs(1));
  });
  it('batches by BATCH_SIZE', async () => {
    const f = vi.fn(async () => ok([]));
    await extractWords(msgs(BATCH_SIZE + 1), { apiKey: 'k', model: 'x/y', fetch: f as never });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('throws on HTTP error', async () => {
    const f = vi.fn(async () => new Response('boom', { status: 502 }));
    await expect(extractWords(msgs(1), { apiKey: 'k', fetch: f as never })).rejects.toThrow('OpenRouter 502');
  });
  it('makes no request for empty input', async () => {
    const f = vi.fn();
    expect(await extractWords([], { apiKey: 'k', fetch: f as never })).toEqual({ words: [], rejected: [] });
    expect(f).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/telegram-llm.test.ts` → FAIL.

- [ ] **Step 3: Реализация** `src/lib/telegram/llm.ts`:

```ts
import { CONJ_VALUES, POS_VALUES } from '../validate';
import { SYSTEM_PROMPT, WORDS_SCHEMA, type LlmWord } from './prompt';
import type { TgMessage } from './updates';

export const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';
export const BATCH_SIZE = 30;
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

const str = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const optStr = (v: unknown): string | null => (str(v) ? v.trim() : null);

function parseJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1);
  return JSON.parse(raw); // бросает SyntaxError на мусоре
}

export function parseLlmWords(content: string, ids: Set<number>): { words: LlmWord[]; rejected: string[] } {
  const data = parseJson(content) as { words?: unknown };
  if (!data || !Array.isArray(data.words)) throw new Error('Ответ модели без массива words');
  const words: LlmWord[] = [];
  const rejected: string[] = [];
  for (const x of data.words as Record<string, unknown>[]) {
    const label = JSON.stringify(x);
    if (!x || !str(x.el) || !str(x.ru)) { rejected.push(`нет el/ru: ${label}`); continue; }
    if (!POS_VALUES.includes(x.pos as never)) { rejected.push(`неизвестная часть речи: ${label}`); continue; }
    if (!ids.has(x.sourceMessageId as number)) { rejected.push(`чужой sourceMessageId: ${label}`); continue; }
    if (x.conj != null && !CONJ_VALUES.includes(x.conj as never)) { rejected.push(`неизвестное спряжение: ${label}`); continue; }
    const tags = Array.isArray(x.tags) ? x.tags.filter(str).map((t) => t.trim().toLocaleLowerCase('ru')) : [];
    words.push({
      el: x.el.trim(), ru: x.ru.trim(), pos: x.pos as LlmWord['pos'], tags: [...new Set(tags)],
      aorist: optStr(x.aorist), future: optStr(x.future), conj: (x.conj ?? null) as LlmWord['conj'],
      note: optStr(x.note), sourceMessageId: x.sourceMessageId as number,
    });
  }
  return { words, rejected };
}

export async function extractWords(
  messages: TgMessage[],
  opts: { apiKey: string; model?: string; fetch?: typeof fetch },
): Promise<{ words: LlmWord[]; rejected: string[] }> {
  const doFetch = opts.fetch ?? fetch;
  const out = { words: [] as LlmWord[], rejected: [] as string[] };
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'greek-verbs' },
      body: JSON.stringify({
        model: opts.model || DEFAULT_MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(batch) },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'words', strict: true, schema: WORDS_SCHEMA } },
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('OpenRouter: пустой ответ');
    const r = parseLlmWords(content, new Set(batch.map((m) => m.id)));
    out.words.push(...r.words);
    out.rejected.push(...r.rejected);
  }
  return out;
}
```

- [ ] **Step 4:** `npm test && npm run check` → PASS.

- [ ] **Step 5: Commit:** `git add src/lib/telegram/llm.ts tests/telegram-llm.test.ts && git commit -m "feat(telegram): OpenRouter extraction with response validation"`

---

### Task 6: Telegram — слияние со словарём и текст ответа

**Files:**
- Create: `src/lib/telegram/merge.ts`, `src/lib/telegram/reply.ts`
- Test: `tests/telegram-merge.test.ts`

**Interfaces:**
- Consumes: `LlmWord`, `TgMessage`; `dedupKey`, `makeId` (Task 2); `validateWord`; `todayISO`.
- Produces:
  - `TELEGRAM_AUTHOR = 'Telegram'`;
  - `interface MergeResult { words: Word[]; added: Word[]; duplicates: LlmWord[]; invalid: { word: LlmWord; errors: string[] }[] }` — `words` = существующие + добавленные, в конце;
  - `mergeWords(existing: Word[], incoming: LlmWord[], dates: Map<number, string>): MergeResult`;
  - `formatReply(r: Pick<MergeResult, 'added' | 'duplicates'>): string | null`.

- [ ] **Step 1: Тесты** `tests/telegram-merge.test.ts`:

```ts
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
```

- [ ] **Step 2:** `npx vitest run tests/telegram-merge.test.ts` → FAIL.

- [ ] **Step 3: Реализация.**

`src/lib/telegram/merge.ts`:

```ts
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
    const w: Word = {
      id: makeId(x.el, ids), el: x.el, ru: x.ru, pos: x.pos, tags: x.tags.slice(0, 2),
      source: 'user', addedBy: TELEGRAM_AUTHOR, addedAt: dateOf(x),
    };
    const forms: NonNullable<Word['forms']> = {};
    if (x.aorist) forms.aorist = x.aorist;
    if (x.future) forms.future = x.future;
    if (forms.aorist || forms.future) w.forms = forms;
    if (x.conj) w.conj = x.conj;
    const errors = validateWord(w);
    if (errors.length) { r.invalid.push({ word: x, errors }); continue; }
    ids.add(w.id);
    keys.add(key);
    r.added.push(w);
    r.words.push(w);
  }
  return r;
}
```

Порядок ключей в объекте (`id, el, ru, pos, tags, source, addedBy, addedAt`, затем `forms`, `conj`) соответствует ожиданию `toEqual` в тесте. `toEqual` порядок не проверяет, но для читаемого `words.json` лучше вставить `forms`/`conj` после `pos`. Поэтому собрать объект в порядке `id, el, ru, pos, forms?, conj?, tags, source, addedBy, addedAt`, через промежуточные переменные, без `undefined`-ключей.

`src/lib/telegram/reply.ts`:

```ts
import type { Word } from '../types';
import type { LlmWord } from './prompt';

const MAX = 10;
const more = (n: number) => (n > MAX ? `и ещё ${n - MAX}` : '');

export function formatReply(r: { added: Word[]; duplicates: LlmWord[] }): string | null {
  if (r.added.length) {
    const lines = r.added.slice(0, MAX).map((w) => `${w.el} — ${w.ru}`);
    return [`📚 Добавлено ${r.added.length}:`, ...lines, more(r.added.length)].filter(Boolean).join('\n');
  }
  if (r.duplicates.length) {
    const tail = more(r.duplicates.length);
    return `Уже в словаре: ${r.duplicates.slice(0, MAX).map((d) => d.el).join(', ')}${tail ? ` ${tail}` : ''}`;
  }
  return null;
}
```

- [ ] **Step 4:** `npm test && npm run check` → PASS.

- [ ] **Step 5: Commit:** `git add src/lib/telegram tests/telegram-merge.test.ts && git commit -m "feat(telegram): merge into dictionary and reply text"`

---

### Task 7: Скрипт бота, workflow, документация

**Files:**
- Create: `scripts/telegram-import.ts`, `tsconfig.scripts.json`, `.github/workflows/telegram-import.yml`, `data/telegram-state.json`
- Modify: `package.json` (devDependency `tsx`, скрипт `check`), `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: всё из `src/lib/telegram/*` (Tasks 4–6).

- [ ] **Step 1: Зависимость и конфиг.**
  - `npm i -D tsx`.
  - `tsconfig.scripts.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "types": ["node"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["scripts/**/*.ts"]
}
```

  - В `package.json` дописать к `check`: `&& tsc -p tsconfig.scripts.json`.
  - `data/telegram-state.json`: `{ "offset": 0 }` + `\n`.

- [ ] **Step 2: `scripts/telegram-import.ts`:**

```ts
// Раз в час из GitHub Actions: новые сообщения группы → OpenRouter → data/words.json → коммит → ответ в группу.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { Word } from '../src/lib/types';
import { extractMessages, listChats, nextOffset, type TgUpdate } from '../src/lib/telegram/updates';
import { extractWords } from '../src/lib/telegram/llm';
import { mergeWords, type MergeResult } from '../src/lib/telegram/merge';
import { formatReply } from '../src/lib/telegram/reply';

const WORDS = 'data/words.json';
const STATE = 'data/telegram-state.json';
const env = (k: string, required = true): string => {
  const v = process.env[k]?.trim() ?? '';
  if (required && !v) throw new Error(`Не задан ${k}`);
  return v;
};
const token = env('TELEGRAM_BOT_TOKEN');
const chatIdRaw = env('TELEGRAM_CHAT_ID', false);

async function tg<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const j = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}

const git = (...args: string[]) => execFileSync('git', args, { stdio: 'inherit' });
const readJson = <T>(p: string, fallback: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : fallback);
const writeJson = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

async function main() {
  const { offset } = readJson(STATE, { offset: 0 });
  const updates = await tg<TgUpdate[]>('getUpdates', { offset, timeout: 0, allowed_updates: ['message', 'edited_message'] });
  if (!chatIdRaw) {
    console.log('TELEGRAM_CHAT_ID не задан. Чаты в последних обновлениях:', listChats(updates));
    return;
  }
  if (!updates.length) return console.log('Новых сообщений нет');
  const chatId = Number(chatIdRaw);
  const messages = extractMessages(updates, chatId);
  console.log(`Обновлений: ${updates.length}, сообщений с греческим: ${messages.length}`);
  const llm = await extractWords(messages, { apiKey: env('OPENROUTER_API_KEY'), model: env('OPENROUTER_MODEL', false) });
  llm.rejected.forEach((r) => console.warn('Отброшено моделью:', r));
  const dates = new Map(messages.map((m) => [m.id, m.date]));
  const newOffset = nextOffset(updates, offset);

  let result!: MergeResult;
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1) { git('fetch', 'origin', 'main'); git('reset', '--hard', 'origin/main'); }
    result = mergeWords(readJson<Word[]>(WORDS, []), llm.words, dates);
    result.invalid.forEach((i) => console.warn('Невалидно:', i.word.el, i.errors.join('; ')));
    if (result.added.length) writeJson(WORDS, result.words);
    writeJson(STATE, { offset: newOffset });
    git('add', WORDS, STATE);
    git('commit', '-m', result.added.length ? `words: add ${result.added.length} from Telegram` : 'telegram: advance offset');
    try { git('push', 'origin', 'HEAD:main'); break; } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`push отклонён, попытка ${attempt + 1}`);
    }
  }
  console.log(`Добавлено: ${result.added.length}, дублей: ${result.duplicates.length}`);
  const reply = formatReply(result);
  if (reply) await tg('sendMessage', { chat_id: chatId, text: reply }).catch((e) => console.warn('Ответ не отправлен:', e));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: `.github/workflows/telegram-import.yml`:**

```yaml
name: Telegram import

on:
  schedule:
    - cron: '17 * * * *'
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: telegram-import
  cancel-in-progress: false

jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: |
          git config user.name "greek-telegram-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
      - run: npx tsx scripts/telegram-import.ts
        env:
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          OPENROUTER_MODEL: ${{ vars.OPENROUTER_MODEL }}
```

В `deploy.yml`: `paths-ignore: ['data/words.json']` → `paths-ignore: ['data/**']`.

- [ ] **Step 4: README.** Добавить раздел «Слова из Telegram» после «Добавление слов»:

```markdown
## Слова из Telegram

Бот раз в час (GitHub Actions, `telegram-import.yml`) читает новые сообщения группы, через OpenRouter извлекает слова и добавляет их в `data/words.json` с автором «Telegram», затем отвечает в группу списком добавленного. Неверно распознанное слово правится или удаляется в приложении.

Настройка:
1. @BotFather → `/newbot`, сохранить токен. Затем `/setprivacy` → выбрать бота → **Disable** (иначе бот не видит обычные сообщения).
2. Добавить бота в группу.
3. Settings → Secrets and variables → Actions → **Secrets**: `TELEGRAM_BOT_TOKEN`, `OPENROUTER_API_KEY` (openrouter.ai → Keys). **Variables** (необязательно): `OPENROUTER_MODEL`, по умолчанию `anthropic/claude-haiku-5.5`.
4. Написать в группу любое сообщение, запустить Actions → Telegram import → Run workflow. В логе будет `id` группы (отрицательное число) — сохранить его в секрет `TELEGRAM_CHAT_ID`.
5. Написать в группу слово (например `το νερό - вода`) и снова запустить workflow — бот ответит «📚 Добавлено 1».

Ограничения: бот видит только сообщения после добавления в группу; Telegram хранит необработанные сообщения 24 часа — если Actions не запускались дольше, эти слова пропадут. GitHub отключает cron-workflow после 60 дней без коммитов в репозитории — тогда включить его снова на вкладке Actions.
```

- [ ] **Step 5: Проверка.**
  - `npm test && npm run check && npm run build` → PASS.
  - Пробный запуск без сети: `TELEGRAM_BOT_TOKEN=x npx tsx scripts/telegram-import.ts` должен упасть с понятной ошибкой Telegram (401/404), а `git status` после этого должен остаться чистым.

- [ ] **Step 6: Commit:** `git add -A scripts tsconfig.scripts.json .github data/telegram-state.json package.json package-lock.json README.md && git commit -m "feat(telegram): hourly import workflow"`

---

### Task 8: Скрипты разового импорта

**Files:**
- Create: `scripts/extract-telegram-export.ts`, `scripts/merge-import.ts`
- Modify: `.gitignore` (+ `import/`)

**Interfaces:**
- Consumes: `messagesFromExport` (Task 4), `parseLlmWords` (Task 5), `mergeWords` (Task 6), `validateWords`.
- Produces (файлы в `import/`):
  - `candidates.json` — `TgMessage[]`;
  - `batch-01.json`, `batch-02.json`… — по 60 сообщений;
  - чистку пишут субагенты в `out-01.json`… в формате `{ "words": LlmWord[] }`;
  - `review.md` — таблица для пользователя.

- [ ] **Step 1: `scripts/extract-telegram-export.ts`:**

```ts
// Разовый импорт, шаг 1: result.json экспорта Telegram Desktop → import/candidates.json + import/batch-NN.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { messagesFromExport } from '../src/lib/telegram/export';

const src = process.argv[2];
if (!src) throw new Error('Использование: npx tsx scripts/extract-telegram-export.ts <result.json>');
const BATCH = 60;
const messages = messagesFromExport(JSON.parse(readFileSync(src, 'utf8')));
mkdirSync('import', { recursive: true });
writeFileSync('import/candidates.json', JSON.stringify(messages, null, 2) + '\n');
for (let i = 0; i < messages.length; i += BATCH) {
  const n = String(i / BATCH + 1).padStart(2, '0');
  writeFileSync(`import/batch-${n}.json`, JSON.stringify(messages.slice(i, i + BATCH), null, 2) + '\n');
}
console.log(`Сообщений с греческим: ${messages.length}, партий: ${Math.ceil(messages.length / BATCH)}`);
```

- [ ] **Step 2: `scripts/merge-import.ts`:**

```ts
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
```

- [ ] **Step 3:** В `.gitignore` добавить строку `import/`.

- [ ] **Step 4: Проверка.**
  - `npm run check` → PASS.
  - Запустить `npx tsx scripts/extract-telegram-export.ts "$HOME/Downloads/Telegram Desktop/ChatExport_2026-10-14/result.json"`: должно напечатать число сообщений > 200 и создать `import/batch-*.json`.
  - Скопировать `tests`-подобный пример в `import/out-01.json` (`{"words":[]}`), запустить `npx tsx scripts/merge-import.ts`: «Добавлено 0» и неизменный `data/words.json` (`git diff --quiet data/words.json`). Затем удалить `import/out-01.json`.

- [ ] **Step 5: Commit:** `git add scripts .gitignore && git commit -m "feat(telegram): one-off export import scripts"`

---

### Task 9: Разовый импорт накопленного (выполняет контроллер)

Это не задача для субагента-реализатора. Её выполняет контроллер после Task 8.

- [ ] **Step 1:** Запустить `npx tsx scripts/extract-telegram-export.ts "$HOME/Downloads/Telegram Desktop/ChatExport_2026-10-14/result.json"`.
- [ ] **Step 2: Чистка.** На каждую партию `import/batch-NN.json` диспетчеризовать субагента (модель sonnet, не больше 3 параллельно). Инструкция:
  - прочитать `src/lib/telegram/prompt.ts` (`SYSTEM_PROMPT`) и партию;
  - выполнить промпт как модель;
  - записать `import/out-NN.json` строго по `WORDS_SCHEMA`;
  - в ответе вернуть только число слов.
- [ ] **Step 3:** Запустить `npx tsx scripts/merge-import.ts`, затем `npm test` (валидность `words.json`).
- [ ] **Step 4: Ревью таблицы.** Выборочно проверить `import/review.md` самому: 30 случайных строк плюс все записи с `note`, чтобы поймать системные ошибки (неверные артикли, формы). Исправить точечно в `import/out-NN.json` и повторить Step 3.
- [ ] **Step 5: Показать таблицу пользователю** (опубликовать как Artifact) и **дождаться согласия**. Только после этого: `git add data/words.json && git commit -m "words: import N words from Telegram"`.

---

## Финал

- После Task 9 выполняется финальное ревью всей ветки. Затем пользователь сам решает про push в `main`.
- Настройку бота (BotFather, секреты, `TELEGRAM_CHAT_ID`) делает пользователь по README. Контроллер проводит его по шагам и проверяет первый запуск через `gh workflow run telegram-import.yml` / `gh run watch`.
