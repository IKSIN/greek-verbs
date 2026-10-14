import { describe, it, expect } from 'vitest';
import { chatWarnings, extractMessages, hasGreek, listChats, nextOffset, type TgUpdate } from '../src/lib/telegram/updates';
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

describe('chatWarnings', () => {
  it('no warnings for the configured chat only', () => expect(chatWarnings([msg(1, 1, 'α')], CHAT)).toEqual([]));
  it('warns about migration', () => {
    const w = chatWarnings([msg(1, 1, 'α', { migrate_to_chat_id: -100999 })], CHAT);
    expect(w).toEqual(['Группа перенесена в чат -100999 — обновите TELEGRAM_CHAT_ID']);
  });
  it('warns once per other chat', () => {
    const a = msg(1, 1, 'α'); a.message!.chat = { id: 5, type: 'group', title: 'Other' };
    const b = msg(2, 2, 'β'); b.message!.chat = { id: 5, type: 'group', title: 'Other' };
    expect(chatWarnings([a, b, msg(3, 3, 'γ')], CHAT)).toEqual(['Сообщения из другого чата 5 (Other) пропущены']);
  });
});
