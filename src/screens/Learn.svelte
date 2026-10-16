<script lang="ts">
  import { app, gradeCard, gradePractice, newLimit, toast, updatePracticeFilter } from '../lib/app.svelte';
  import { applyFilter, emptyFilter, facets, isFilterActive, type WordFilter } from '../lib/filters';
  import { POS_LABELS, PRACTICE_LABELS } from '../lib/labels';
  import { POS_VALUES } from '../lib/validate';
  import type { PracticeStatus } from '../lib/practice';
  import { answerSession, buildQueue, countDue, startSession, type SessionState } from '../lib/session';
  import { todayISO } from '../lib/date';
  import { answerPractice, MAX_LEVEL, nextPracticeWord, startPractice } from '../lib/practice';
  import { progressKey, type Grade } from '../lib/types';
  import DirectionToggle from '../components/DirectionToggle.svelte';
  import FilterChips from '../components/FilterChips.svelte';
  import Flashcard from './Flashcard.svelte';
  import TypeAnswer from './TypeAnswer.svelte';

  type Mode = 'cards' | 'type';

  // ежедневная сессия: фильтр из словаря
  const dailyPool = $derived(app.studyFilter ? applyFilter(app.words, app.studyFilter, app.progress, app.direction, app.practice) : app.words);
  // тренировка ∞: свой фильтр; во время сессии пул зафиксирован по id на старте
  const practicePool = $derived(applyFilter(app.words, app.practiceFilter, app.progress, app.direction, app.practice));
  const sessionPool = $derived.by(() => {
    const ids = new Set(app.practicePoolIds);
    return app.words.filter((w) => ids.has(w.id));
  });
  const counts = $derived(countDue(dailyPool, app.progress, app.direction, todayISO()));
  // app.session в зависимостях: пересчитать остаток лимита после завершения сессии (счётчик живёт в localStorage)
  const freshAvailable = $derived(app.session === null ? Math.min(counts.fresh, newLimit(app.direction)) : 0);
  const nothing = $derived(counts.due + freshAvailable === 0);

  const countMastered = (ws: typeof app.words) =>
    ws.filter((w) => app.practice[progressKey(w.id, app.direction)]?.level === MAX_LEVEL).length;
  const practiceMastered = $derived(countMastered(practicePool));
  const sessionMastered = $derived(countMastered(sessionPool));

  let showPracticeFilters = $state(false);
  const fc = $derived(facets(app.words));
  const active = $derived(isFilterActive(app.practiceFilter));
  const posOpts = POS_VALUES.map((v) => ({ value: v, label: POS_LABELS[v] }));
  const practiceOpts = (['not-started', 'in-progress', 'mastered'] as PracticeStatus[]).map((v) => ({ value: v, label: PRACTICE_LABELS[v] }));
  const authorOpts = $derived(fc.authors.map((v) => ({ value: v, label: v })));
  const tagOpts = $derived(fc.tags.map((v) => ({ value: v, label: v })));
  const setFilter = (patch: Partial<WordFilter>) => updatePracticeFilter({ ...$state.snapshot(app.practiceFilter), ...patch });
  const practiceKey = $derived(app.practiceWord ? progressKey(app.practiceWord.id, app.direction) : '');
  const practiceLevel = $derived(app.practice[practiceKey]?.level ?? 0);

  function startFree(m: Mode) {
    if (!practicePool.length) return;
    app.learnMode = m;
    app.practicePoolIds = practicePool.map((w) => w.id);
    app.practiceSession = startPractice();
    app.practiceWord = nextPracticeWord(app.practiceSession, sessionPool, app.practice, app.direction);
  }

  function finishPractice() {
    app.practiceWord = null; // сессия без слова = показываем итог
  }

  function closePractice() {
    app.practiceSession = null;
    app.practiceWord = null;
  }

  let grading = false;
  async function gradeFree(g: Grade) {
    if (grading || !app.practiceSession || !app.practiceWord) return;
    grading = true;
    try {
      const word = $state.snapshot(app.practiceWord);
      const dir = app.direction;
      const prevLevel = app.practice[progressKey(word.id, dir)]?.level ?? 0;
      // app.practice обновляется синхронно (до первого await внутри), запись в IndexedDB ждём ниже
      const saved = gradePractice(word, dir, g);
      const newLevel = app.practice[progressKey(word.id, dir)]?.level ?? 0;
      app.practiceSession = answerPractice($state.snapshot(app.practiceSession), word.id, g, prevLevel, newLevel);
      const next = nextPracticeWord(app.practiceSession, sessionPool, app.practice, dir);
      if (next) app.practiceWord = next;
      else finishPractice();
      await saved;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Не удалось сохранить прогресс');
    } finally {
      grading = false;
    }
  }

  // слово могли удалить во время тренировки: пул опустел — завершаем
  $effect(() => {
    if (app.practiceSession && app.practiceWord && !sessionPool.length) finishPractice();
  });

  function start(m: Mode) {
    app.learnMode = m;
    const items = buildQueue(dailyPool, app.progress, app.direction, todayISO(), newLimit(app.direction));
    if (items.length) app.session = startSession(items);
  }

  async function grade(g: Grade) {
    if (!app.session) return;
    const item = $state.snapshot(app.session.queue[0]);
    app.session = answerSession($state.snapshot(app.session) as SessionState, g);
    await gradeCard(item.word, app.direction, g);
  }
</script>

{#if app.practiceSession && !app.practiceWord}
  <section class="card center">
    <h2>Тренировка окончена</h2>
    <p>Ответов: {app.practiceSession.answered}</p>
    <p>Ошибок: {app.practiceSession.errors}</p>
    <p>Повышений уровня: {app.practiceSession.levelUps}</p>
    <button class="primary" onclick={closePractice}>OK</button>
  </section>
{:else if app.practiceSession && app.practiceWord}
  <div class="row">
    <button class="link" onclick={finishPractice}>✕ Закончить</button>
    <span class="muted">Освоено {sessionMastered}/{sessionPool.length} · ответов {app.practiceSession.answered}</span>
  </div>
  {#key app.practiceSession.answered}
    {@const item = { word: app.practiceWord, isNew: !app.practice[practiceKey] }}
    {#if app.learnMode === 'cards'}
      <Flashcard {item} direction={app.direction} ongrade={gradeFree} />
    {:else}
      <TypeAnswer {item} ongrade={gradeFree} />
    {/if}
  {/key}
  <p class="muted center">Уровень: {practiceLevel}/{MAX_LEVEL}</p>
{:else if app.session && app.session.queue.length}
  <div class="row">
    <button class="link" onclick={() => (app.session = null)}>✕ Завершить</button>
    <span class="muted">Осталось: {app.session.queue.length}</span>
  </div>
  {#key app.session.answered}
    {#if app.learnMode === 'cards'}
      <Flashcard item={app.session.queue[0]} direction={app.direction} ongrade={grade} />
    {:else}
      <TypeAnswer item={app.session.queue[0]} ongrade={grade} />
    {/if}
  {/key}
{:else if app.session}
  <section class="card center">
    <h2>Готово!</h2>
    <p>Слов пройдено: {app.session.seen.length}</p>
    <p>Ошибок: {app.session.errors}</p>
    <button class="primary" onclick={() => (app.session = null)}>OK</button>
  </section>
{:else}
  <h1>Учить</h1>
  <DirectionToggle />
  {#if app.studyFilter}
    <p class="filter-note">
      Учим по фильтру из словаря: {dailyPool.length} слов
      <button class="link" onclick={() => (app.studyFilter = null)}>сбросить</button>
    </p>
  {/if}
  <div class="stats">
    <div><strong>{counts.due}</strong><span class="muted">к повторению</span></div>
    <div><strong>{freshAvailable}</strong><span class="muted">новых сегодня</span></div>
  </div>
  {#if nothing}<p class="muted center">На сегодня всё 🎉</p>{/if}
  <div class="actions">
    <button class="primary" disabled={nothing} onclick={() => start('cards')}>Карточки</button>
    {#if app.direction === 'ru-el'}
      <button disabled={nothing} onclick={() => start('type')}>Ввод</button>
    {/if}
  </div>
  <h2>Тренировка ∞</h2>
  <p class="muted">Без лимитов и расписания — свои уровни запоминания, ежедневное повторение не затрагивается.</p>
  <div class="row">
    <button class="link" onclick={() => (showPracticeFilters = !showPracticeFilters)}>
      {showPracticeFilters ? 'Скрыть фильтры' : 'Фильтры'}{active ? ' •' : ''}
    </button>
    {#if active}<button class="link" onclick={() => setFilter(emptyFilter())}>Сбросить</button>{/if}
  </div>
  {#if showPracticeFilters}
    <FilterChips label="Часть речи" options={posOpts} selected={app.practiceFilter.pos} onchange={(v) => setFilter({ pos: v })} />
    <FilterChips label="Темы" options={tagOpts} selected={app.practiceFilter.tags} onchange={(v) => setFilter({ tags: v })} />
    <FilterChips label="Кто добавил" options={authorOpts} selected={app.practiceFilter.addedBy} onchange={(v) => setFilter({ addedBy: v })} />
    <FilterChips label="Уровень в тренировке (для выбранного направления)" options={practiceOpts} selected={app.practiceFilter.practice}
      onchange={(v) => setFilter({ practice: v })} />
  {/if}
  <p>Слов в тренировке: {practicePool.length} · Освоено {practiceMastered} из {practicePool.length}</p>
  {#if !practicePool.length}<p class="muted">Под фильтр не попало ни одного слова</p>{/if}
  <div class="actions">
    <button class="primary" disabled={!practicePool.length} onclick={() => startFree('cards')}>Карточки ∞</button>
    {#if app.direction === 'ru-el'}
      <button disabled={!practicePool.length} onclick={() => startFree('type')}>Ввод ∞</button>
    {/if}
  </div>
{/if}
