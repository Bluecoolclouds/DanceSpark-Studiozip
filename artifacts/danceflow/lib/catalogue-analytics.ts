import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const STORAGE_KEY = 'danceflow.catalogue-visitor.v1';
const TOKEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type VisitorRecord = { token: string; createdAt: number };
let pending: Promise<string> | undefined;
let memoryRecord: VisitorRecord | undefined;

function validRecord(value: unknown, now: number): value is VisitorRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<VisitorRecord>;
  return typeof record.token === 'string' &&
    typeof record.createdAt === 'number' &&
    now >= record.createdAt &&
    now - record.createdAt < TOKEN_WINDOW_MS;
}

async function readRecord(): Promise<unknown> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return memoryRecord;
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  }
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  return value ? JSON.parse(value) : null;
}

async function writeRecord(record: VisitorRecord): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

/** Rotating random token only; no account ID, email, or IP is used for deduplication. */
export function getCatalogueVisitorToken(): Promise<string> {
  if (pending) return pending;
  pending = (async () => {
    const now = Date.now();
    try {
      const existing = await readRecord();
      if (validRecord(existing, now)) {
        memoryRecord = existing;
        return existing.token;
      }
    } catch {
      // Local storage can be unavailable in private/restricted browser contexts.
    }

    const next = { token: Crypto.randomUUID(), createdAt: now };
    memoryRecord = next;
    try { await writeRecord(next); } catch { /* Keep the random token in memory for this app session. */ }
    return next.token;
  })().finally(() => { pending = undefined; });
  return pending;
}
