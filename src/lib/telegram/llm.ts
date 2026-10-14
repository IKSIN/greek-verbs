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
      signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'greek-verbs' },
      body: JSON.stringify({
        model: opts.model || DEFAULT_MODEL,
        temperature: 0,
        provider: { require_parameters: true }, // только провайдеры с поддержкой json_schema
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
