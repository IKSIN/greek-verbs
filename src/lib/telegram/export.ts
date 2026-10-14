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
