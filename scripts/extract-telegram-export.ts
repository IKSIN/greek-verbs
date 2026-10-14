// Разовый импорт, шаг 1: result.json экспорта Telegram Desktop → import/candidates.json + import/batch-NN.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { messagesFromExport } from '../src/lib/telegram/export';

const src = process.argv[2];
if (!src) throw new Error('Использование: npx tsx scripts/extract-telegram-export.ts <result.json>');
const BATCH = 60;
const messages = messagesFromExport(JSON.parse(readFileSync(src, 'utf8')));
mkdirSync('import', { recursive: true });
writeFileSync('import/candidates.json', JSON.stringify(messages, null, 2) + '\n');
for (let i = 0; i < messages.length; i += BATCH) {
  const n = String(i / BATCH + 1).padStart(2, '0');
  writeFileSync(`import/batch-${n}.json`, JSON.stringify(messages.slice(i, i + BATCH), null, 2) + '\n');
}
console.log(`Сообщений с греческим: ${messages.length}, партий: ${Math.ceil(messages.length / BATCH)}`);
