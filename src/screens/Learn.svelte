<script lang="ts">
  import { app, gradeCard, gradePractice, newLimit, toast } from '../lib/app.svelte';
  import { applyFilter } from '../lib/filters';
  import { answerSession, buildQueue, countDue, startSession, type SessionState } from '../lib/session';
  import { todayISO } from '../lib/date';
  import { answerPractice, MAX_LEVEL, nextPracticeWord, startPractice } from '../lib/practice';
  import { progressKey, type Grade } from '../lib/types';
  import DirectionToggle from '../components/DirectionToggle.svelte';
  import Flashcard from './Flashcard.svelte';
  import TypeAnswer from './TypeAnswer.svelte';

  type Mode = 'cards' | 'type';

  const pool = $derived(app.studyFilter ? applyFilter(app.words, app.studyFilter, app.progress, app.direction, app.practice) : app.words);
  const counts = $derived(countDue(pool, app.progress, app.direction, todayISO()));
  // app.session в зависимостях: пересчитать остаток лимита после завершения сессии (счётчик живёт в localStorage)
  const freshAvailable = $derived(app.session === null ? Math.min(counts.fresh, newLimit(app.direction)) : 0);
  const nothing = $derived(counts.due + freshAvailable === 0);

  const mastered = $derived(
    pool.filter((w) => app.practice[progressKey(w.id, app.direction)]?.level === MAX_LEVEL).length,
  );
  const practiceKey = $derived(app.practiceWord ? progressKey(app.practiceWord.id, app.direction) : '');
  const practiceLevel = $derived(app.practice[practiceKey]?.level ?? 0);

  function startFree(m: Mode) {
    if (!pool.length) return;
    app.learnMode = m;
    app.practiceSession = startPractice();
    app.practiceWord = nextPracticeWord(app.practiceSession, pool, app.practice, app.direction);
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
      const next = nextPracticeWord(app.practiceSession, pool, app.practice, dir);
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
    if (app.practiceSession && app.practiceWord && !pool.length) finishPractice();
  });

  function start(m: Mode) {
    app.learnMode = m;
    const items = buildQueue(pool, app.progress, app.direction, todayISO(), newLimit(app.direction));
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
    <span class="muted">Освоено {mastered}/{pool.length} · ответов {app.practiceSession.answered}</span>
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
      Учим по фильтру из словаря: {pool.length} слов
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
  <p>Освоено: {mastered} из {pool.length}</p>
  <div class="actions">
    <button class="primary" disabled={!pool.length} onclick={() => startFree('cards')}>Карточки ∞</button>
    {#if app.direction === 'ru-el'}
      <button disabled={!pool.length} onclick={() => startFree('type')}>Ввод ∞</button>
    {/if}
  </div>
{/if}
