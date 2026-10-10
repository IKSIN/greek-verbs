<script lang="ts" generics="T extends string">
  let { label, options, selected, onchange }: {
    label: string;
    options: { value: T; label: string }[];
    selected: T[];
    onchange: (next: T[]) => void;
  } = $props();
  const toggle = (v: T) => onchange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
</script>

{#if options.length}
  <fieldset class="chips">
    <legend>{label}</legend>
    {#each options as o (o.value)}
      <button type="button" class="chip" class:on={selected.includes(o.value)}
        aria-pressed={selected.includes(o.value)} onclick={() => toggle(o.value)}>{o.label}</button>
    {/each}
  </fieldset>
{/if}
