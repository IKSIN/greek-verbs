<script lang="ts">
  import type { Word } from '../lib/types';
  let { edit, ondone }: { edit?: Word; ondone?: () => void } = $props();
</script>
<h1>{edit ? 'Редактировать' : 'Добавить слово'}</h1>
