<script lang="ts">
  import type { Direction, Grade } from '../lib/types';
  import type { SessionItem } from '../lib/session';
  import WordInfo from '../components/WordInfo.svelte';
  import SpeakButton from '../components/SpeakButton.svelte';

  let { item, direction, ongrade }: { item: SessionItem; direction: Direction; ongrade: (g: Grade) => void } = $props();
  let flipped = $state(false);
  const grades: { g: Grade; label: string }[] = [
    { g: 'again', label: 'Снова' }, { g: 'hard', label: 'Трудно' }, { g: 'good', label: 'Хорошо' }, { g: 'easy', label: 'Легко' },
  ];
</script>

<section class="card flash" role="button" tabindex="0"
  onclick={() => (flipped = true)}
  onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') flipped = true; }}>
  {#if item.isNew}<span class="badge">новое</span>{/if}
  {#if !flipped}
    <p class="big">{direction === 'el-ru' ? item.word.el : item.word.ru}</p>
    {#if direction === 'el-ru'}<SpeakButton text={item.word.el} />{/if}
    <p class="muted">нажмите, чтобы перевернуть</p>
  {:else}
    <WordInfo word={item.word} />
  {/if}
</section>

{#if flipped}
  <div class="grades">
    {#each grades as b (b.g)}
      <button class="grade {b.g}" onclick={() => ongrade(b.g)}>{b.label}</button>
    {/each}
  </div>
{/if}
