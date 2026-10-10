<script lang="ts">
  import { app, gradeCard, newLimit } from '../lib/app.svelte';
  import { applyFilter } from '../lib/filters';
  import { answerSession, buildQueue, countDue, startSession, type SessionState } from '../lib/session';
  import { todayISO } from '../lib/date';
  import type { Grade } from '../lib/types';
  import DirectionToggle from '../components/DirectionToggle.svelte';
  import Flashcard from './Flashcard.svelte';
  import TypeAnswer from './TypeAnswer.svelte';

  type Mode = 'cards' | 'type';

  const pool = $derived(app.studyFilter ? applyFilter(app.words, app.studyFilter, app.progress, app.direction) : app.words);
  const counts = $derived(countDue(pool, app.progress, app.direction, todayISO()));
  // app.session в зависимостях: пересчитать остаток лимита после завершения сессии (счётчик живёт в localStorage)
  const freshAvailable = $derived(app.session === null ? Math.min(counts.fresh, newLimit(app.direction)) : 0);
  const nothing = $derived(counts.due + freshAvailable === 0);

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

{#if app.session && app.session.queue.length}
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
{/if}
