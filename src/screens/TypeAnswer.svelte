<script lang="ts">
  import { onMount } from 'svelte';
  import type { Grade } from '../lib/types';
  import type { SessionItem } from '../lib/session';
  import { checkAnswer, type AnswerResult } from '../lib/answer';
  import { toggleTonos } from '../lib/accent';
  import WordInfo from '../components/WordInfo.svelte';

  let { item, ongrade }: { item: SessionItem; ongrade: (g: Grade) => void } = $props();
  let value = $state('');
  let result = $state<AnswerResult | null>(null);
  let input = $state<HTMLInputElement>();
  const GRADE: Record<AnswerResult, Grade> = { correct: 'good', accent: 'hard', article: 'hard', wrong: 'again' };

  onMount(() => input?.focus());

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (result) ongrade(GRADE[result]);
    else result = checkAnswer(value, item.word.el);
  }

  function accent() {
    if (!input) return;
    const caret = input.selectionStart ?? value.length;
    value = toggleTonos(value, caret);
    queueMicrotask(() => input?.setSelectionRange(caret, caret));
  }
</script>

<form class="card" onsubmit={submit}>
  {#if item.isNew}<p class="muted">новое слово</p>{/if}
  <p class="big">{item.word.ru}</p>
  <div class="answer-row">
    <input bind:this={input} bind:value lang="el" autocomplete="off" autocapitalize="off" spellcheck="false"
      placeholder="по-гречески" readonly={!!result} />
    <button type="button" class="icon" aria-label="Поставить ударение" disabled={!!result}
      onpointerdown={(e) => e.preventDefault()} onclick={accent}>ά</button>
  </div>
  {#if result === 'correct'}
    <p class="ok">✅ Верно</p>
  {:else if result === 'accent'}
    <p class="warn">⚠️ Почти: проверьте ударение</p>
  {:else if result === 'article'}
    <p class="warn">⚠️ Почти: не забудьте артикль — {item.word.el}</p>
  {:else if result === 'wrong'}
    <p class="bad">❌ Неверно{value.trim() ? `: «${value.trim()}»` : ''}</p>
  {/if}
  {#if result}<WordInfo word={item.word} />{/if}
  <button class="primary" type="submit" style="width:100%">{result ? 'Дальше' : 'Проверить'}</button>
</form>
