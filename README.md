# Ελληνικά — глаголы

PWA для изучения греческих глаголов (A2) в обоих направлениях: карточки с интервальным повторением и режим ввода. Общий словарь — `data/words.json` в этом репозитории; прогресс хранится на каждом устройстве.

## Установка на телефон

Откройте `https://<owner>.github.io/<repo>/` → «Поделиться» → «На экран Домой» (iOS) или «Установить приложение» (Android).

## Добавление слов

В приложении: Настройки → имя и GitHub-токен (fine-grained, только этот репозиторий, Contents: Read and write). Каждое добавленное слово — коммит в `data/words.json`.

## Разработка

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit-тесты + валидация словаря
npm run check      # svelte-check
npm run build
```

Чтобы локально работала запись в словарь, создайте `.env.local`:

```
VITE_GH_OWNER=<owner>
VITE_GH_REPO=<repo>
```

## Деплой

Push в `main` → GitHub Actions (`.github/workflows/deploy.yml`) прогоняет тесты, собирает и публикует на Pages. В настройках репозитория: Settings → Pages → Source: **GitHub Actions**.
