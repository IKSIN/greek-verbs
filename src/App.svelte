<script lang="ts">
  import { onMount } from 'svelte';
  import { app, initApp, syncPending } from './lib/app.svelte';
  import Tabs from './components/Tabs.svelte';
  import Toast from './components/Toast.svelte';
  import Learn from './screens/Learn.svelte';
  import Dictionary from './screens/Dictionary.svelte';
  import AddWord from './screens/AddWord.svelte';
  import Settings from './screens/Settings.svelte';

  onMount(() => {
    void initApp();
    const online = () => void syncPending();
    addEventListener('online', online);
    return () => removeEventListener('online', online);
  });
</script>

<main>
  {#if !app.ready}
    <p class="muted center">Загрузка…</p>
  {:else if app.tab === 'learn'}
    <Learn />
  {:else if app.tab === 'dictionary'}
    <Dictionary />
  {:else if app.tab === 'add'}
    <AddWord />
  {:else}
    <Settings />
  {/if}
</main>
<Toast />
<Tabs />
