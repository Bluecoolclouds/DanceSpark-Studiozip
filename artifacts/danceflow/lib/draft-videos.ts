import { Directory, File, Paths } from 'expo-file-system';
import { withOwnerMediaWrite } from './draft-media';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export class VideoLibraryPermissionError extends Error {
  constructor(public readonly canAskAgain: boolean) {
    super('Доступ к медиатеке не разрешён.');
    this.name = 'VideoLibraryPermissionError';
  }
}

async function requestVideoLibraryPermission(writeOnly: boolean) {
  const current = await MediaLibrary.getPermissionsAsync(writeOnly, ['video']);
  const permission = current.granted
    ? current
    : await MediaLibrary.requestPermissionsAsync(writeOnly, ['video']);
  if (!permission.granted) {
    throw new VideoLibraryPermissionError(permission.canAskAgain);
  }
}

async function getLocalVideoUri(uri: string, draftId: string, ownerId: string): Promise<{ uri: string; temporary: boolean }> {
  if (uri.startsWith('file://') || uri.startsWith('content://')) {
    return { uri, temporary: false };
  }
  if (!uri.startsWith('https://') && !uri.startsWith('http://')) {
    throw new Error('Не удалось открыть видео. Попробуй ещё раз.');
  }

  if (!ownerId || !/^[A-Za-z0-9_-]{1,200}$/.test(draftId)) throw new Error('Некорректный черновик.');
  return withOwnerMediaWrite(ownerId, async () => {
    const directory = new Directory(Paths.cache, 'danceflow-account-media', encodeURIComponent(ownerId));
    directory.create({ intermediates: true, idempotent: true });
    const target = new File(directory, `${draftId}.mp4`);
    try {
      const file = await File.downloadFileAsync(uri, target, { idempotent: true });
      return { uri: file.uri, temporary: true };
    } catch {
      try { if (target.exists) target.delete(); } catch {}
      throw new Error('Не удалось скачать видео. Проверь подключение и попробуй ещё раз.');
    }
  });
}

export async function saveVideoToLibrary(uri: string, draftId: string, ownerId: string): Promise<string> {
  if (Platform.OS === 'web') throw new Error('Сохранение в медиатеку доступно в мобильном приложении.');
  if (!(await MediaLibrary.isAvailableAsync())) {
    throw new Error('Медиатека недоступна на этом устройстве.');
  }
  await requestVideoLibraryPermission(true);

  const localVideo = await getLocalVideoUri(uri, draftId, ownerId);
  try {
    const asset = await MediaLibrary.createAssetAsync(localVideo.uri);
    return asset.id;
  } finally {
    if (localVideo.temporary) new File(localVideo.uri).delete();
  }
}

export async function shareVideo(uri: string, draftId: string, ownerId: string): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Отправка видео доступна в мобильном приложении.');
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Системное меню отправки недоступно на этом устройстве.');
  }

  const localVideo = await getLocalVideoUri(uri, draftId, ownerId);
  await Sharing.shareAsync(localVideo.uri, {
    mimeType: 'video/mp4',
    dialogTitle: 'Отправить танец',
    UTI: 'public.movie',
  });
}

export async function deleteVideoFromLibrary(assetId: string): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Удаление из медиатеки доступно в мобильном приложении.');
  await requestVideoLibraryPermission(false);
  const deleted = await MediaLibrary.deleteAssetsAsync(assetId);
  if (!deleted) throw new Error('Медиатека не удалила видео. Попробуй ещё раз.');
}
