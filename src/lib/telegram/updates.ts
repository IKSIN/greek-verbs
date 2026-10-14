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
