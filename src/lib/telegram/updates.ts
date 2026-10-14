export interface TgMessage { id: number; date: string; text: string }

interface RawMessage {
  message_id: number;
  date: number; // unix, секунды
  chat: { id: number; type: string; title?: string };
  from?: { is_bot?: boolean };
  text?: string;
  caption?: string;
  migrate_to_chat_id?: number;
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

// Предупреждения о чатах: миграция группы и сообщения из чужих чатов
export function chatWarnings(updates: TgUpdate[], chatId: number): string[] {
  const out: string[] = [];
  const others = new Map<number, string>();
  let migrated: number | undefined;
  for (const u of updates) {
    const m = u.message ?? u.edited_message;
    if (!m) continue;
    if (m.chat.id === chatId) migrated ??= m.migrate_to_chat_id;
    else others.set(m.chat.id, m.chat.title ?? m.chat.type);
  }
  if (migrated !== undefined) out.push(`Группа перенесена в чат ${migrated} — обновите TELEGRAM_CHAT_ID`);
  for (const [id, title] of others) out.push(`Сообщения из другого чата ${id} (${title}) пропущены`);
  return out;
}
