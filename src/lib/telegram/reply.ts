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
