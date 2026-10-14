// Раз в час из GitHub Actions: новые сообщения группы → OpenRouter → data/words.json → коммит → ответ в группу.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import type { Word } from '../src/lib/types';
import { chatWarnings, extractMessages, listChats, nextOffset, type TgUpdate } from '../src/lib/telegram/updates';
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
    signal: AbortSignal.timeout(30_000),
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
  if (chatIdRaw && !Number.isInteger(Number(chatIdRaw))) throw new Error('TELEGRAM_CHAT_ID должен быть числом');
  const { offset } = readJson(STATE, { offset: 0 });
  const updates = await tg<TgUpdate[]>('getUpdates', { offset, timeout: 0, allowed_updates: ['message', 'edited_message'] });
  if (!chatIdRaw) {
    console.log('TELEGRAM_CHAT_ID не задан. Чаты в последних обновлениях:', listChats(updates));
    return;
  }
  if (!updates.length) return console.log('Новых сообщений нет');
  const chatId = Number(chatIdRaw);
  const warnings = chatWarnings(updates, chatId);
  warnings.forEach((w) => console.warn(w));
  // миграция группы: падаем до коммита, offset не сдвигается
  const migration = warnings.find((w) => w.startsWith('Группа перенесена'));
  if (migration) throw new Error(migration);
  const messages = extractMessages(updates, chatId);
  console.log(`Обновлений: ${updates.length}, сообщений с греческим: ${messages.length}`);
  const llm = await extractWords(messages, {
    apiKey: env('OPENROUTER_API_KEY'), model: env('OPENROUTER_MODEL', false),
    tags: [...new Set(readJson<Word[]>(WORDS, []).flatMap((w) => w.tags ?? []))].sort(), // существующие темы
  });
  llm.rejected.forEach((r) => console.warn('Отброшено моделью:', r));
  const dates = new Map(messages.map((m) => [m.id, m.date]));
  const newOffset = nextOffset(updates, offset);

  let result!: MergeResult;
  let alreadyPushed = false;
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1) { git('fetch', 'origin', 'main'); git('reset', '--hard', 'origin/main'); }
    result = mergeWords(readJson<Word[]>(WORDS, []), llm.words, dates);
    // прошлый push мог пройти несмотря на ошибку: слов нет, offset уже сдвинут
    if (attempt > 1 && !result.added.length && readJson(STATE, { offset: 0 }).offset === newOffset) { alreadyPushed = true; break; }
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
  if (alreadyPushed) return console.log('Уже отправлено, ответ пропущен');
  console.log(`Добавлено: ${result.added.length}, дублей: ${result.duplicates.length}`);
  const reply = formatReply(result);
  if (reply) await tg('sendMessage', { chat_id: chatId, text: reply }).catch((e) => console.warn('Ответ не отправлен:', e));
}

main().catch((e) => { console.error(e); process.exit(1); });
