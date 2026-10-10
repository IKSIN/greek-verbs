<script lang="ts">
  import { app, saveWordChange } from '../lib/app.svelte';
  import { facets } from '../lib/filters';
  import { makeId } from '../lib/wordId';
  import { stripAccents } from '../lib/answer';
  import { CONJ_VALUES, validateWord } from '../lib/validate';
  import { CONJ_LABELS } from '../lib/labels';
  import { todayISO } from '../lib/date';
  import type { Conj, Word } from '../lib/types';

  let { edit, ondone }: { edit?: Word; ondone?: () => void } = $props();

  let el = $state(edit?.el ?? '');
  let ru = $state(edit?.ru ?? '');
  let aorist = $state(edit?.forms?.aorist ?? '');
  let future = $state(edit?.forms?.future ?? '');
  let conj = $state<Conj | ''>(edit?.conj ?? '');
  let tags = $state<string[]>(edit ? [...edit.tags] : []);
  let newTag = $state('');
  let exEl = $state(edit?.example?.el ?? '');
  let exRu = $state(edit?.example?.ru ?? '');
  let errors = $state<string[]>([]);
  let saving = $state(false);

  const key = (s: string) => stripAccents(s.trim().toLocaleLowerCase('el'));
  const duplicate = $derived(el.trim() ? app.words.find((w) => w.id !== edit?.id && key(w.el) === key(el)) : undefined);
  const allTags = $derived([...new Set([...facets(app.words).tags, ...tags])].sort((a, b) => a.localeCompare(b, 'ru')));
  const configured = $derived(!!app.settings.name && !!app.settings.githubToken);

  function toggleTag(t: string) {
    tags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
  }
  function addTag() {
    const t = newTag.trim().toLocaleLowerCase('ru');
    if (t && !tags.includes(t)) tags = [...tags, t];
    newTag = '';
  }

  function build(): Word {
    const w: Word = {
      id: edit?.id ?? makeId(el, new Set(app.words.map((x) => x.id))),
      el: el.trim(),
      ru: ru.trim(),
      tags: [...tags],
      source: edit?.source ?? 'user',
      addedBy: edit ? edit.addedBy : app.settings.name,
      addedAt: edit?.addedAt ?? todayISO(),
    };
    const forms: NonNullable<Word['forms']> = {};
    if (aorist.trim()) forms.aorist = aorist.trim();
    if (future.trim()) forms.future = future.trim();
    if (forms.aorist || forms.future) w.forms = forms;
    if (conj) w.conj = conj;
    if (exEl.trim() && exRu.trim()) w.example = { el: exEl.trim(), ru: exRu.trim() };
    return w;
  }

  function reset() {
    el = ru = aorist = future = exEl = exRu = newTag = '';
    conj = '';
    tags = [];
    errors = [];
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const w = build();
    errors = validateWord(w);
    if (errors.length) return;
    saving = true;
    const ok = await saveWordChange(edit ? { type: 'update', word: w } : { type: 'add', word: w });
    saving = false;
    if (!ok) return;
    if (!edit) reset();
    ondone?.();
  }
</script>

<h1>{edit ? 'Редактировать' : 'Добавить слово'}</h1>

{#if !configured}
  <p class="warn">
    Чтобы сохранять слова, укажите имя и GitHub-токен в
    <button class="link" onclick={() => (app.tab = 'settings')}>настройках</button>.
  </p>
{/if}

<form class="form" onsubmit={submit}>
  <label>По-гречески, с ударением *<input bind:value={el} lang="el" autocomplete="off" required /></label>
  {#if duplicate}<p class="warn">Уже есть: {duplicate.el} — {duplicate.ru}</p>{/if}
  <label>Перевод *<input bind:value={ru} required /></label>
  <div class="two">
    <label>Прошедшее (аорист)<input bind:value={aorist} lang="el" autocomplete="off" /></label>
    <label>Будущее<input bind:value={future} lang="el" autocomplete="off" placeholder="θα …" /></label>
  </div>
  <label>Спряжение
    <select bind:value={conj}>
      <option value="">—</option>
      {#each CONJ_VALUES as c (c)}<option value={c}>{CONJ_LABELS[c]}</option>{/each}
    </select>
  </label>
  <fieldset class="chips">
    <legend>Темы</legend>
    {#each allTags as t (t)}
      <button type="button" class="chip" class:on={tags.includes(t)} onclick={() => toggleTag(t)}>{t}</button>
    {/each}
    <div class="row">
      <input bind:value={newTag} placeholder="новая тема"
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} />
      <button type="button" onclick={addTag}>+</button>
    </div>
  </fieldset>
  <label>Пример по-гречески<input bind:value={exEl} lang="el" /></label>
  <label>Перевод примера<input bind:value={exRu} /></label>
  {#if errors.length}
    <ul class="bad">{#each errors as err (err)}<li>{err}</li>{/each}</ul>
  {/if}
  <div class="actions">
    {#if edit}<button type="button" onclick={() => ondone?.()}>Отмена</button>{/if}
    <button class="primary" type="submit" disabled={!configured || saving}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
  </div>
</form>
