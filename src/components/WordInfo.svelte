<script lang="ts">
  import type { Word } from '../lib/types';
  import { CONJ_LABELS, POS_LABELS } from '../lib/labels';
  import SpeakButton from './SpeakButton.svelte';
  let { word }: { word: Word } = $props();
</script>

<div class="word-info">
  <p class="el">{word.el} <SpeakButton text={word.el} /></p>
  <p class="ru">{word.ru}</p>
  {#if word.forms?.aorist || word.forms?.future}
    <p class="forms">{word.el} — {word.forms?.aorist ?? '—'} — {word.forms?.future ?? '—'}</p>
  {/if}
  {#if word.pos || word.conj}
    <p class="muted">{[word.pos && POS_LABELS[word.pos], word.conj && `спряжение ${CONJ_LABELS[word.conj]}`].filter(Boolean).join(' · ')}</p>
  {/if}
  {#if word.example}
    <blockquote>
      <p>{word.example.el} <SpeakButton text={word.example.el} /></p>
      <p class="muted">{word.example.ru}</p>
    </blockquote>
  {/if}
  {#if word.tags.length}
    <p>{#each word.tags as t (t)}<span class="chip small">{t}</span>{/each}</p>
  {/if}
</div>
