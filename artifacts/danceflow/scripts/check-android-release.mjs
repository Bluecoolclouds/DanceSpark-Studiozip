import { readFile } from 'node:fs/promises';
import { nativeApiOrigin } from '../lib/api-origin.ts';

const { expo } = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
const problems = [];
try { nativeApiOrigin({ development: false, productionOrigin: process.env.EXPO_PUBLIC_API_ORIGIN }); }
catch (error) { problems.push(error.message); }
if (expo.android?.package !== 'ru.danceflow.app') problems.push('Изменён утверждённый Android package.');
if (!Number.isInteger(expo.android?.versionCode) || expo.android.versionCode < 1) problems.push('Нужен положительный versionCode.');
if (expo.android?.allowBackup !== false) problems.push('Автовосстановление пользовательских данных должно быть отключено.');
if (expo.scheme !== 'danceflow') problems.push('Для Better Auth нужен зарегистрированный scheme danceflow.');
for (const permission of [
  'RECORD_AUDIO', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION',
  'SYSTEM_ALERT_WINDOW', 'USE_BIOMETRIC', 'USE_FINGERPRINT',
]) {
  if (!expo.android?.blockedPermissions?.includes(`android.permission.${permission}`)) {
    problems.push(`Неиспользуемое разрешение ${permission} должно быть заблокировано.`);
  }
}
if (problems.length) {
  console.error('Android release preflight: NOT READY');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Android release configuration: OK. Подпись, сеть, API, документы и устройство этим скриптом не проверены.');
}
