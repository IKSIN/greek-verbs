<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { applyFilter, emptyFilter, facets, isFilterActive, type StatusFilter } from '../lib/filters';
  import { isHard, statusOf } from '../lib/status';
  import { progressKey } from '../lib/types';
  import { CONJ_LABELS, POS_LABELS, PRACTICE_LABELS, SOURCE_LABELS, STATUS_LABELS } from '../lib/labels';
  import type { PracticeStatus } from '../lib/practice';
  import { CONJ_VALUES, POS_VALUES } from '../lib/validate';
  import FilterChips from '../components/FilterChips.svelte';
  import DirectionToggle from '../components/DirectionToggle.svelte';
  import WordDetail from './WordDetail.svelte';

  let selectedId = $state<string | null>(null);
  let showFilters = $state(false);

  const selected = $derived(selectedId ? app.words.find((w) => w.id === selectedId) : undefined);
  const found = $derived(applyFilter(app.words, app.filter, app.progress, app.direction, app.practice));
  const fc = $derived(facets(app.words));
  const active = $derived(isFilterActive(app.filter));

  const statusOpts = (['new', 'learning', 'learned', 'hard'] as StatusFilter[]).map((v) => ({ value: v, label: STATUS_LABELS[v] }));
  const practiceOpts = (['not-started', 'in-progress', 'mastered'] as PracticeStatus[]).map((v) => ({ value: v, label: PRACTICE_LABELS[v] }));
  const conjOpts = CONJ_VALUES.map((v) => ({ value: v, label: CONJ_LABELS[v] }));
  const posOpts = POS_VALUES.map((v) => ({ value: v, label: POS_LABELS[v] }));
  const sourceOpts = (['base', 'user'] as const).map((v) => ({ value: v, label: SOURCE_LABELS[v] }));
  const authorOpts = $derived(fc.authors.map((v) => ({ value: v, label: v })));
  const tagOpts = $derived(fc.tags.map((v) => ({ value: v, label: v })));

  function study() {
    app.studyFilter = $state.snapshot(app.filter);
    app.tab = 'learn';
  }
</script>

{#if selected}
  <WordDetail word={selected} onclose={() => (selectedId = null)} />
{:else}
  <h1>Словарь</h1>
  <input type="search" placeholder="Поиск: γράφω или писать" bind:value={app.filter.query} />
  <div class="row">
    <button class="link" onclick={() => (showFilters = !showFilters)}>
      {showFilters ? 'Скрыть фильтры' : 'Фильтры'}{active ? ' •' : ''}
    </button>
    {#if active}<button class="link" onclick={() => (app.filter = emptyFilter())}>Сбросить</button>{/if}
  </div>

  {#if showFilters}
    <DirectionToggle />
    <FilterChips label="Статус (для выбранного направления)" options={statusOpts} selected={app.filter.status}
      onchange={(v) => (app.filter.status = v)} />
    <FilterChips label="Тренировка (для выбранного направления)" options={practiceOpts} selected={app.filter.practice}
      onchange={(v) => (app.filter.practice = v)} />
    <FilterChips label="Часть речи" options={posOpts} selected={app.filter.pos} onchange={(v) => (app.filter.pos = v)} />
    <FilterChips label="Спряжение" options={conjOpts} selected={app.filter.conj} onchange={(v) => (app.filter.conj = v)} />
    <FilterChips label="Источник" options={sourceOpts} selected={app.filter.source} onchange={(v) => (app.filter.source = v)} />
    <FilterChips label="Кто добавил" options={authorOpts} selected={app.filter.addedBy} onchange={(v) => (app.filter.addedBy = v)} />
    <FilterChips label="Темы" options={tagOpts} selected={app.filter.tags} onchange={(v) => (app.filter.tags = v)} />
  {/if}

  <div class="row">
    <span class="muted">Найдено: {found.length}</span>
  </div>
  <button class="primary" style="width:100%" disabled={!found.length} onclick={study}>
    Учить эти слова ({found.length})
  </button>

  <ul class="word-list">
    {#each found as w (w.id)}
      {@const s = app.progress[progressKey(w.id, app.direction)]}
      <li>
        <button onclick={() => (selectedId = w.id)}>
          <span class="el">{w.el}</span>
          <span class="ru">{w.ru}</span>
          <span class="dot {statusOf(s)}" class:hard={isHard(s)} title={STATUS_LABELS[statusOf(s)]}></span>
        </button>
      </li>
    {/each}
  </ul>
{/if}
