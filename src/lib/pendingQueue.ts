import type { KV, WordChange } from './types';
import { readJSON } from './settings';

export interface PendingItem { change: WordChange; author: string }

const KEY = 'greek.pending';

export function loadPending(storage: KV = localStorage): PendingItem[] {
  const v = readJSON<unknown>(storage, KEY);
  return Array.isArray(v) ? (v as PendingItem[]) : [];
}

function savePending(items: PendingItem[], storage: KV): void {
  storage.setItem(KEY, JSON.stringify(items));
}

export function enqueuePending(item: PendingItem, storage: KV = localStorage): void {
  savePending([...loadPending(storage), item], storage);
}

export interface FlushResult { sent: number; remaining: number; error: unknown | null }

export async function flushPending(
  commit: (item: PendingItem) => Promise<void>,
  storage: KV = localStorage,
): Promise<FlushResult> {
  let items = loadPending(storage);
  let sent = 0;
  while (items.length) {
    try {
      await commit(items[0]);
    } catch (error) {
      return { sent, remaining: items.length, error };
    }
    items = items.slice(1);
    savePending(items, storage);
    sent++;
  }
  return { sent, remaining: 0, error: null };
}
