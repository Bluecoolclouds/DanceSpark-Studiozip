import { readFile } from 'node:fs/promises';
import { nativeApiOrigin } from '../lib/api-origin.ts';

const { expo } = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
const problems = [];
try { nativeApiOrigin({ development: false, productionOrigin: process.env.EXPO_PUBLIC_API_ORIGIN }); }
catch (error) { problems.push(error.message); }
if (expo.android?.package !== 'ru.danceflow.app') problems.push('Изменён утверждённый Android package.');
if (!Number.isInteger(expo.android?.versionCode) || expo.android.versionCode < 1) problems.push('Нужен положительный versionCode.');
if (expo.android?.allowBackup !== false) problems.push('Автовосстановление пользовательских данных должно быть отключено.');
if (!(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '').startsWith('pk_live_')) {
  problems.push('Нужен production publishable key Clerk в EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.');
}
if (problems.length) {
  console.error('Android release preflight: NOT READY');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Android release configuration: OK. Подпись, сеть, API, документы и устройство этим скриптом не проверены.');
}
