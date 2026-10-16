import type { Direction, Grade, PracticeMap, ProgressMap, Word, WordChange } from './types';
import { progressKey } from './types';
import { emptyFilter, type WordFilter } from './filters';
import { incNewSeen, loadPracticeFilter, loadSettings, newSeenToday, savePracticeFilter, saveSettings, type Settings } from './settings';
import { newCard, schedule } from './srs';
import { todayISO } from './date';
import { applyChange, createDictionaryRepo, DictionaryError, RATE_LIMIT_MESSAGE, type DictionarySnapshot } from './dictionaryRepo';
import { openProgressStore, type ProgressStore } from './progressStore';
import { resolveRepoConfig } from './config';
import type { SessionState } from './session';
import { applyPracticeAnswer, type PracticeSession } from './practice';
import { enqueuePending, flushPending, loadPending } from './pendingQueue';

export type Tab = 'learn' | 'dictionary' | 'add' | 'settings';

export const app = $state({
  ready: false,
  words: [] as Word[],
  origin: 'bundled' as DictionarySnapshot['origin'],
  progress: {} as ProgressMap,
  practice: {} as PracticeMap,
  practiceSession: null as PracticeSession | null,
  practiceWord: null as Word | null,
  practiceFilter: loadPracticeFilter(),
  practicePoolIds: [] as string[], // пул тренировки фиксируется на старте
  settings: loadSettings(),
  direction: 'el-ru' as Direction,
  filter: emptyFilter(),
  studyFilter: null as WordFilter | null,
  session: null as SessionState | null,
  learnMode: 'cards' as 'cards' | 'type',
  tab: 'learn' as Tab,
  toast: null as string | null,
  pending: loadPending().length,
});

export const repoConfig = resolveRepoConfig(location, import.meta.env);

let storePromise: Promise<ProgressStore> | null = null;
export function store(): Promise<ProgressStore> {
  return (storePromise ??= openProgressStore());
}

const repo = createDictionaryRepo(repoConfig, {
  fetch: (input, init) => fetch(input, init),
  cache: {
    get: async () => (await store()).getCache<DictionarySnapshot>('dictionary'),
    set: async (s) => (await store()).setCache('dictionary', s),
  },
  bundled: async () => (await import('../../data/words.json')).default as Word[],
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string): void {
  app.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (app.toast = null), 3500);
}

function reapplyPending(words: Word[]): Word[] {
  return loadPending().reduce((ws, p) => {
    try {
      return applyChange(ws, p.change);
    } catch {
      return ws;
    }
  }, words);
}

export async function initApp(): Promise<void> {
  try {
    try {
      const st = await store();
      app.progress = await st.getAll();
      app.practice = await st.getAllPractice();
    } catch {
      app.progress = {}; // хранилище прогресса недоступно — продолжаем с пустым
      app.practice = {};
    }
    await refreshDictionary(false);
  } catch (e) {
    toast(`Ошибка запуска: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    app.ready = true;
  }
  if (navigator.onLine) void syncPending();
}

export async function refreshDictionary(notify = true): Promise<void> {
  const snap = await repo.load(app.settings.githubToken || undefined);
  app.words = reapplyPending(snap.words);
  app.origin = snap.origin;
  if (snap.authError) {
    toast('GitHub-токен недействителен или истёк — обновите его в настройках');
  } else if (notify) {
    toast(snap.origin === 'remote'
      ? `Словарь обновлён: ${snap.words.length} слов`
      : 'Нет связи с GitHub — показана сохранённая копия');
  }
}

export async function gradeCard(word: Word, direction: Direction, grade: Grade): Promise<void> {
  const key = progressKey(word.id, direction);
  const today = todayISO();
  const prev = app.progress[key];
  // $state.snapshot: IndexedDB не умеет клонировать Svelte-прокси
  const next = schedule(prev ? $state.snapshot(prev) : newCard(word.id, direction, today), grade, today);
  app.progress[key] = next;
  if (!prev) incNewSeen(direction, today);
  await (await store()).put(next);
}

export async function gradePractice(word: Word, direction: Direction, grade: Grade): Promise<void> {
  const key = progressKey(word.id, direction);
  const prev = app.practice[key];
  // $state.snapshot: IndexedDB не умеет клонировать Svelte-прокси
  const next = applyPracticeAnswer(prev ? $state.snapshot(prev) : undefined, word.id, direction, grade, todayISO());
  app.practice[key] = next;
  await (await store()).putPractice($state.snapshot(next));
}

export function newLimit(direction: Direction): number {
  return Math.max(0, app.settings.newPerDay - newSeenToday(direction, todayISO()));
}

export function updateSettings(s: Settings): void {
  app.settings = s;
  saveSettings(s);
}

export function updatePracticeFilter(f: WordFilter): void {
  app.practiceFilter = f;
  savePracticeFilter($state.snapshot(f));
}

async function forgetProgress(id: string): Promise<void> {
  delete app.progress[progressKey(id, 'el-ru')];
  delete app.progress[progressKey(id, 'ru-el')];
  delete app.practice[progressKey(id, 'el-ru')];
  delete app.practice[progressKey(id, 'ru-el')];
  await (await store()).deleteWord(id);
}

async function queueChange(change: WordChange, author: string): Promise<boolean> {
  enqueuePending({ change, author });
  app.pending = loadPending().length;
  try {
    app.words = applyChange($state.snapshot(app.words), change);
  } catch {
    /* слово уже удалено — нечего применять локально */
  }
  if (change.type === 'delete') await forgetProgress(change.id);
  toast('Нет сети — сохраню, когда появится связь');
  return true;
}

export async function saveWordChange(change: WordChange): Promise<boolean> {
  const { githubToken, name } = app.settings;
  if (!repoConfig) {
    toast('Репозиторий GitHub не определён');
    return false;
  }
  if (!githubToken || !name) {
    toast('Укажите имя и токен в настройках');
    return false;
  }
  if (!navigator.onLine) return queueChange(change, name);
  try {
    const snap = await repo.commit(change, githubToken, name);
    app.words = reapplyPending(snap.words);
    app.origin = 'remote';
    if (change.type === 'delete') await forgetProgress(change.id);
    toast('Сохранено');
    return true;
  } catch (e) {
    if (e instanceof DictionaryError && e.kind === 'network') return queueChange(change, name);
    toast(e instanceof Error ? e.message : 'Не удалось сохранить');
    return false;
  }
}

let syncing: Promise<void> | null = null;

export function syncPending(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      await doSync();
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

async function doSync(): Promise<void> {
  if (!app.pending || !repoConfig || !app.settings.githubToken) return;
  const r = await flushPending(async (item) => {
    try {
      const snap = await repo.commit(item.change, app.settings.githubToken, item.author);
      app.words = snap.words;
      app.origin = 'remote';
    } catch (e) {
      // Неустранимая ошибка (например, правка удалённого слова) — выбрасываем изменение, чтобы не блокировать очередь
      if (e instanceof DictionaryError && e.kind === 'other' && e.message !== RATE_LIMIT_MESSAGE) {
        toast(`Изменение отброшено: ${e.message}`);
        return;
      }
      throw e;
    }
  });
  app.pending = r.remaining;
  app.words = reapplyPending($state.snapshot(app.words));
  if (r.sent) toast(`Отправлено изменений: ${r.sent}`);
  if (r.error && !(r.error instanceof DictionaryError && r.error.kind === 'network')) {
    toast(r.error instanceof Error ? r.error.message : 'Не удалось отправить изменения');
  }
}
