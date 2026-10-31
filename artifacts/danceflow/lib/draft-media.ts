import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const PREFIX = 'danceflow-media:';
function openMedia(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('danceflow-draft-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('videos');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Не удалось открыть хранилище видео.'));
  });
}

async function storeBlob(blob: Blob, name: string): Promise<string> {
  const db = await openMedia();
  try {
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
  const match = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Фото должно быть в формате JPG, PNG или WebP.');
  const name = `${encodeURIComponent(ownerId)}-${Date.now()}-${Math.random().toString(36).slice(2)}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
  const binary = atob(match[2]);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  if (Platform.OS === 'web') return storeBlob(new Blob([bytes], { type: `image/${match[1]}` }), name);
  const file = new File(Paths.document, name);
  file.write(bytes);
  return file.uri;
}

/** Keep picker videos beyond the browser session / native cache lifetime. */
export async function persistDraftVideo(uri: string, ownerId: string): Promise<string> {
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
  return storeBlob(blob, name);
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
