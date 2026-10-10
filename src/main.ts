import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import './app.css';
import App from './App.svelte';
import { toast } from './lib/app.svelte';

const VERSION_KEY = 'greek.version';
try {
  const prev = localStorage.getItem(VERSION_KEY);
  if (prev && prev !== __APP_VERSION__) setTimeout(() => toast('Приложение обновлено'), 500);
  localStorage.setItem(VERSION_KEY, __APP_VERSION__);
} catch {
  /* localStorage недоступен — пропускаем уведомление */
}

registerSW({ immediate: true, onOfflineReady: () => toast('Готово к работе офлайн') });

export default mount(App, { target: document.getElementById('app')! });
