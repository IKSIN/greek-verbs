<script lang="ts">
  import { app, saveWordChange } from '../lib/app.svelte';
  import { progressKey, type Direction, type Word } from '../lib/types';
  import { isHard, statusOf } from '../lib/status';
  import { DIRECTION_LABELS, SOURCE_LABELS, STATUS_LABELS } from '../lib/labels';
  import WordInfo from '../components/WordInfo.svelte';
  import AddWord from './AddWord.svelte';

  let { word, onclose }: { word: Word; onclose: () => void } = $props();
  let editing = $state(false);
  const dirs: Direction[] = ['el-ru', 'ru-el'];

  async function remove() {
    if (!confirm(`Удалить «${word.el}» из общего словаря? Слово исчезнет и у второго пользователя.`)) return;
    if (await saveWordChange({ type: 'delete', id: word.id, el: word.el })) onclose();
  }
</script>

<button class="link" onclick={onclose}>← Назад</button>

{#if editing}
  <AddWord edit={word} ondone={() => (editing = false)} />
{:else}
  <section class="card">
    <WordInfo {word} />
    <p class="muted">{SOURCE_LABELS[word.source]}{word.addedBy ? ` · ${word.addedBy}` : ''} · {word.addedAt}</p>
  </section>
  <table class="progress">
    <thead><tr><th></th><th>Статус</th><th>Следующий показ</th><th>Ошибок</th></tr></thead>
    <tbody>
      {#each dirs as d (d)}
        {@const s = app.progress[progressKey(word.id, d)]}
        <tr>
          <td>{DIRECTION_LABELS[d]}</td>
          <td>{STATUS_LABELS[statusOf(s)]}{isHard(s) ? ', трудное' : ''}</td>
          <td>{s?.due ?? '—'}</td>
          <td>{s?.lapses ?? 0}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if word.source === 'user'}
    <div class="actions">
      <button onclick={() => (editing = true)}>Редактировать</button>
      <button class="danger" onclick={remove}>Удалить</button>
    </div>
  {/if}
{/if}
