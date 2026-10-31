import { File } from 'expo-file-system';
import { resolveDraftVideo } from './draft-media';

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export async function photoToDataUrl(uri: string): Promise<string> {
  if (uri.startsWith('danceflow-media:')) {
    const media = await resolveDraftVideo(uri);
    try { return await photoToDataUrl(media.uri); }
    finally { media.dispose(); }
  }
  if (uri.startsWith('data:image/')) return uri;
  // Browser picker blobs and catalogue images have no useful file extension.
  const remote = /^(https?:|blob:)/.test(uri);
  const response = remote ? await fetch(uri) : null;
  if (response && !response.ok) throw new Error('Фото недоступно. Выбери его заново.');
  const blob = response ? await response.blob() : null;
  const file = blob ? null : new File(uri);
  if ((blob?.size ?? file?.size ?? 0) > MAX_PHOTO_BYTES) {
    throw new Error('Фото слишком большое. Выбери снимок до 12 МБ.');
  }

  const extension = file?.extension.toLowerCase() ?? '';
  const mimeType = blob?.type || (extension === '.png'
    ? 'image/png'
    : extension === '.webp'
      ? 'image/webp'
      : ['.jpg', '.jpeg'].includes(extension)
        ? 'image/jpeg'
        : null);
  if (!mimeType || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    throw new Error('Выбери фото в формате JPG, PNG или WebP.');
  }
  const bytes = new Uint8Array(blob ? await blob.arrayBuffer() : await file!.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return `data:${mimeType};base64,${btoa(binary)}`;
}

export function readableVideoError(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const body = (error as { data?: unknown }).data;
    if (body && typeof body === 'object' && 'error' in body) {
      const message = (body as { error?: unknown }).error;
      if (typeof message === 'string') return message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Не удалось создать видео. Попробуй ещё раз.';
}
