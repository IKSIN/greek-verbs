<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { DIRECTION_LABELS } from '../lib/labels';
  const dirs = ['el-ru', 'ru-el'] as const;
</script>

<div class="segmented" role="group" aria-label="Направление">
  {#each dirs as d (d)}
    <button type="button" class:on={app.direction === d} aria-pressed={app.direction === d}
      onclick={() => (app.direction = d)}>{DIRECTION_LABELS[d]}</button>
  {/each}
</div>
