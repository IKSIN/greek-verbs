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
  let session = $state<SessionState | null>(null);
  let mode = $state<Mode>('cards');

  const pool = $derived(app.studyFilter ? applyFilter(app.words, app.studyFilter, app.progress, app.direction) : app.words);
  const counts = $derived(countDue(pool, app.progress, app.direction, todayISO()));
  // session в зависимостях: пересчитать остаток лимита после завершения сессии (счётчик живёт в localStorage)
  const freshAvailable = $derived(session === null ? Math.min(counts.fresh, newLimit(app.direction)) : 0);
  const nothing = $derived(counts.due + freshAvailable === 0);

  function start(m: Mode) {
    mode = m;
    const items = buildQueue(pool, app.progress, app.direction, todayISO(), newLimit(app.direction));
    if (items.length) session = startSession(items);
  }

  async function grade(g: Grade) {
    if (!session) return;
    const item = session.queue[0];
    session = answerSession(session, g);
    await gradeCard(item.word, app.direction, g);
  }
</script>

{#if session && session.queue.length}
  <div class="row">
    <button class="link" onclick={() => (session = null)}>✕ Завершить</button>
    <span class="muted">Осталось: {session.queue.length}</span>
  </div>
  {#key session.answered}
    {#if mode === 'cards'}
      <Flashcard item={session.queue[0]} direction={app.direction} ongrade={grade} />
    {:else}
      <TypeAnswer item={session.queue[0]} ongrade={grade} />
    {/if}
  {/key}
{:else if session}
  <section class="card center">
    <h2>Готово!</h2>
    <p>Слов пройдено: {session.seen.length}</p>
    <p>Ошибок: {session.errors}</p>
    <button class="primary" onclick={() => (session = null)}>OK</button>
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
