<script lang="ts">
  import { onMount } from 'svelte';
  import { greekVoiceAvailable, speak } from '../lib/speech';
  let { text }: { text: string } = $props();
  let available = $state(false);
  onMount(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const check = () => (available = greekVoiceAvailable());
    check();
    speechSynthesis.addEventListener('voiceschanged', check);
    return () => speechSynthesis.removeEventListener('voiceschanged', check);
  });
</script>

{#if available}
  <button type="button" class="icon" aria-label="Произнести"
    onclick={(e) => { e.stopPropagation(); speak(text); }}>🔊</button>
{/if}
