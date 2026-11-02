import AsyncStorage from '@react-native-async-storage/async-storage';
import { eraseOwnerDraftMedia } from './draft-media';

const PENDING = 'danceflow:local-deletion:';

/** Marker survives a failed IndexedDB/filesystem operation or an app restart. */
export async function eraseLocalAccountData(ownerId: string) {
  if (!ownerId || ownerId === 'guest') throw new Error('Нужен владелец локальных данных.');
  const marker = `${PENDING}${ownerId}`;
  await AsyncStorage.setItem(marker, 'pending');
  await eraseOwnerDraftMedia(ownerId);
  await AsyncStorage.multiRemove([`danceflow:drafts:${ownerId}`, `danceflow:favorites:${ownerId}`]);
  await AsyncStorage.removeItem(marker);
}

export async function retryPendingLocalDeletions() {
  const keys = await AsyncStorage.getAllKeys();
  for (const key of keys) {
    if (key.startsWith(PENDING)) await eraseLocalAccountData(key.slice(PENDING.length));
  }
}
