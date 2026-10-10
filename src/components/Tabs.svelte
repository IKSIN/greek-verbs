<script lang="ts">
  import { app, type Tab } from '../lib/app.svelte';
  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'learn', icon: '🎓', label: 'Учить' },
    { id: 'dictionary', icon: '📖', label: 'Словарь' },
    { id: 'add', icon: '➕', label: 'Добавить' },
    { id: 'settings', icon: '⚙️', label: 'Настройки' },
  ];
</script>

<nav class="tabs">
  {#each tabs as t (t.id)}
    <button type="button" class:on={app.tab === t.id} aria-current={app.tab === t.id ? 'page' : undefined}
      onclick={() => (app.tab = t.id)}>
      <span aria-hidden="true">{t.icon}</span>{t.label}
    </button>
  {/each}
</nav>
