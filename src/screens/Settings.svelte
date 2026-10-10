<script lang="ts">
  import { app, refreshDictionary, repoConfig, store, syncPending, toast, updateSettings } from '../lib/app.svelte';
  import { todayISO } from '../lib/date';

  let name = $state(app.settings.name);
  let token = $state(app.settings.githubToken);
  let newPerDay = $state(app.settings.newPerDay);
  let fileInput = $state<HTMLInputElement>();
  const ORIGIN = { remote: 'GitHub', cache: 'сохранённая копия', bundled: 'встроенная копия' } as const;

  function save(e: SubmitEvent) {
    e.preventDefault();
    updateSettings({
      name: name.trim(),
      githubToken: token.trim(),
      newPerDay: Math.max(0, Math.min(100, Math.floor(Number(newPerDay) || 0))),
    });
    toast('Настройки сохранены');
    void syncPending();
  }

  async function exportProgress() {
    const json = await (await store()).exportJSON();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `greek-progress-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importProgress(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      if (!confirm('Заменить прогресс на этом устройстве данными из файла?')) return;
      const s = await store();
      const n = await s.importJSON(await file.text());
      app.progress = await s.getAll();
      app.practice = await s.getAllPractice();
      toast(`Импортировано карточек: ${n}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка импорта');
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }
</script>

<h1>Настройки</h1>

<form class="form" onsubmit={save}>
  <label>Ваше имя<input bind:value={name} placeholder="например, Маша" /></label>
  <label>GitHub-токен<input type="password" bind:value={token} autocomplete="off" /></label>
  <details>
    <summary>Как получить токен</summary>
    <ol>
      <li>github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.</li>
      <li>Expiration: выберите максимальный срок (токен перестанет работать после истечения).</li>
      <li>Repository access: Only select repositories → {repoConfig ? `${repoConfig.owner}/${repoConfig.repo}` : 'репозиторий приложения'}.</li>
      <li>Permissions → Repository permissions → Contents: Read and write.</li>
      <li>Скопируйте токен и вставьте сюда. Он хранится только на этом устройстве.</li>
    </ol>
  </details>
  <label>Новых слов в день (на каждое направление)<input type="number" min="0" max="100" bind:value={newPerDay} /></label>
  <button class="primary" type="submit">Сохранить</button>
</form>

<section class="card">
  <h2>Словарь</h2>
  <p>Слов: {app.words.length} · источник: {ORIGIN[app.origin]}</p>
  {#if app.pending}
    <p class="warn">Не отправлено изменений: {app.pending}
      <button class="link" onclick={() => syncPending()}>отправить</button></p>
  {/if}
  {#if !repoConfig}
    <p class="muted">Репозиторий не определён: локальный запуск без VITE_GH_OWNER / VITE_GH_REPO.</p>
  {/if}
  <button onclick={() => refreshDictionary()}>Обновить словарь</button>
</section>

<section class="card">
  <h2>Прогресс</h2>
  <p class="muted">Прогресс хранится только на этом устройстве. Сделайте экспорт перед сменой телефона.</p>
  <div class="actions">
    <button onclick={exportProgress}>Экспорт</button>
    <button onclick={() => fileInput?.click()}>Импорт</button>
  </div>
  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importProgress} />
</section>
