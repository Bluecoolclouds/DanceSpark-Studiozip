import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { isOwnedDraftMediaName } from './draft-media-scope';

const PREFIX = 'danceflow-media:';
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const erasedOwners = new Set<string>();
const pendingWrites = new Map<string, Set<Promise<unknown>>>();
export function blockOwnerMediaWrites(ownerId: string) { erasedOwners.add(ownerId); }
export async function withOwnerMediaWrite<T>(ownerId: string, work: () => Promise<T>): Promise<T> {
  assertWritable(ownerId);
  const operation = work();
  const pending = pendingWrites.get(ownerId) ?? new Set();
  pendingWrites.set(ownerId, pending);
  pending.add(operation);
  try { return await operation; }
  finally { pending.delete(operation); if (!pending.size) pendingWrites.delete(ownerId); }
}
function assertWritable(ownerId: string) {
  if (erasedOwners.has(ownerId)) throw new Error('Удаление аккаунта уже запрошено. Сохранение новых материалов отключено.');
}
function openMedia(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('danceflow-draft-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('videos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Не удалось открыть хранилище видео.'));
  });
}

async function storeBlob(blob: Blob, name: string, ownerId: string): Promise<string> {
  const db = await openMedia();
  try {
    assertWritable(ownerId);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('videos', 'readwrite');
      tx.objectStore('videos').put(blob, name);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('Материалы не сохранены: проверь свободное место.'));
    });
  } finally { db.close(); }
  return `${PREFIX}${name}`;
}

/** Avoid AsyncStorage/localStorage per-value limits for multi-photo drafts. */
export async function persistDraftPhoto(dataUrl: string, ownerId: string): Promise<string> {
  assertWritable(ownerId);
  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Фото должно быть в формате JPG, PNG или WebP.');
  const name = `${encodeURIComponent(ownerId)}-${Date.now()}-${Math.random().toString(36).slice(2)}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  if (Platform.OS === 'web') return storeBlob(new Blob([bytes], { type: `image/${match[1]}` }), name, ownerId);
  const file = new File(Paths.document, name);
  file.write(bytes);
  return file.uri;
}

/** Keep picker videos beyond the browser session / native cache lifetime. */
export async function persistDraftVideo(uri: string, ownerId: string): Promise<string> {
  assertWritable(ownerId);
  if (/^https?:/.test(uri) || uri.startsWith(PREFIX)) return uri;
  const name = `${encodeURIComponent(ownerId)}-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
  if (Platform.OS !== 'web') {
    const target = new File(Paths.document, name);
    new File(uri).copy(target);
    return target.uri;
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Выбранное видео недоступно. Выбери его заново.');
  const blob = await response.blob();
  assertWritable(ownerId);
  return storeBlob(blob, name, ownerId);
}

/** Never delete gallery originals, catalogue assets, guest files, or another owner. */
export async function eraseOwnerDraftMedia(ownerId: string): Promise<void> {
  blockOwnerMediaWrites(ownerId);
  await Promise.allSettled([...(pendingWrites.get(ownerId) ?? [])]);
  if (Platform.OS !== 'web') {
    const cache = new Directory(Paths.cache, 'danceflow-account-media', encodeURIComponent(ownerId));
    if (cache.exists) cache.delete();
    for (const file of Paths.document.list()) {
      if (file instanceof File && isOwnedDraftMediaName(file.name, ownerId)) file.delete();
    }
    return;
  }
  const db = await openMedia();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('videos', 'readwrite');
      const request = tx.objectStore('videos').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string' && isOwnedDraftMediaName(cursor.key, ownerId)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('Не удалось очистить локальные материалы.'));
    });
  } finally { db.close(); }
}

export async function resolveDraftVideo(uri: string): Promise<{ uri: string; dispose: () => void }> {
  if (!uri.startsWith(PREFIX)) return { uri, dispose: () => {} };
  const db = await openMedia();
  try {
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const request = db.transaction('videos').objectStore('videos').get(uri.slice(PREFIX.length));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Не удалось прочитать сохранённое видео.'));
    });
    if (!blob) throw new Error('Сохранённое видео недоступно. Выбери файл заново.');
    const url = URL.createObjectURL(blob);
    return { uri: url, dispose: () => URL.revokeObjectURL(url) };
  } finally { db.close(); }
}

/** Read the selected source bytes for the authenticated, raw-MP4 upload API. */
export async function draftVideoUploadBlob(uri: string): Promise<Blob> {
  const media = await resolveDraftVideo(uri);
  try {
    let bytes: ArrayBuffer;
    if (/^(https?:|blob:)/i.test(media.uri)) {
      const response = await fetch(media.uri);
      if (!response.ok) throw new Error('Выбранное видео недоступно. Выбери его заново.');
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > MAX_UPLOAD_BYTES) {
        throw new Error('Видео должно быть не больше 100 МБ.');
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('Видео пустое. Выбери другой файл.');
      if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Видео должно быть не больше 100 МБ.');
      return blob;
    } else {
      const file = new File(media.uri);
      if (!file.exists || !file.size) throw new Error('Видео пустое. Выбери другой файл.');
      if (file.size > MAX_UPLOAD_BYTES) throw new Error('Видео должно быть не больше 100 МБ.');
      // Expo File implements Blob, so native uploads can read the file directly
      // instead of duplicating a potentially large video in JS memory.
      return file;
    }
  } finally { media.dispose(); }
}
