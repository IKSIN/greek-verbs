import { describe, it, expect, vi } from 'vitest';
import { enqueuePending, flushPending, loadPending } from '../src/lib/pendingQueue';
import { MemStorage } from './memStorage';
import { word } from './fixtures';

const item = (id: string) => ({ change: { type: 'add' as const, word: word({ id, el: 'ψήνω', ru: 'печь' }) }, author: 'Маша' });

describe('pendingQueue', () => {
  it('enqueue and load', () => {
    const st = new MemStorage();
    enqueuePending(item('a'), st);
    enqueuePending(item('b'), st);
    expect(loadPending(st).map((p) => (p.change as { word: { id: string } }).word.id)).toEqual(['a', 'b']);
  });
  it('corrupt storage -> empty', () => {
    const st = new MemStorage();
    st.setItem('greek.pending', 'nope');
    expect(loadPending(st)).toEqual([]);
  });
  it('flush sends in order and empties queue', async () => {
    const st = new MemStorage();
    enqueuePending(item('a'), st);
    enqueuePending(item('b'), st);
    const commit = vi.fn(async () => {});
    expect(await flushPending(commit, st)).toEqual({ sent: 2, remaining: 0, error: null });
    expect(commit).toHaveBeenCalledTimes(2);
    expect(loadPending(st)).toEqual([]);
  });
  it('flush stops on first error and keeps the rest', async () => {
    const st = new MemStorage();
    ['a', 'b', 'c'].forEach((id) => enqueuePending(item(id), st));
    const err = new Error('offline');
    const commit = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(err);
    expect(await flushPending(commit, st)).toEqual({ sent: 1, remaining: 2, error: err });
    expect(loadPending(st)).toHaveLength(2);
  });
});
