import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const STORAGE_KEY = 'danceflow.catalogue-visitor.v1';
const ANALYTICS_CONSENT_KEY = 'danceflow.catalogue-analytics-enabled.v1';
const TOKEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type VisitorRecord = { token: string; createdAt: number };
let pending: Promise<string | null> | undefined;
let memoryRecord: VisitorRecord | undefined;
let analyticsEnabled: boolean | undefined;
let consentLoad: Promise<boolean> | undefined;
let consentRevision = 0;

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

async function readAnalyticsConsent(): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') throw new Error('Local storage is unavailable');
    return window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
  }
  return AsyncStorage.getItem(ANALYTICS_CONSENT_KEY);
}

async function writeAnalyticsConsent(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') throw new Error('Local storage is unavailable');
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, String(enabled));
    return;
  }
  await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, String(enabled));
}

async function removeVisitorRecord(): Promise<void> {
  memoryRecord = undefined;
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/** Defaults to enabled for existing installs; storage failures fail closed. */
export function getCatalogueAnalyticsEnabled(): Promise<boolean> {
  if (analyticsEnabled !== undefined) return Promise.resolve(analyticsEnabled);
  if (!consentLoad) {
    const revision = consentRevision;
    consentLoad = (async () => {
      let enabled = false;
      try {
        const stored = await readAnalyticsConsent();
        enabled = stored === null ? true : stored === 'true';
      } catch {
        // If consent cannot be read, do not send analytics.
      }
      if (consentRevision === revision && analyticsEnabled === undefined) {
        analyticsEnabled = enabled;
      }
      return analyticsEnabled ?? enabled;
    })().finally(() => { consentLoad = undefined; });
  }
  return consentLoad;
}

/** Updates consent immediately in memory so in-flight opens are also blocked. */
export async function setCatalogueAnalyticsEnabled(enabled: boolean): Promise<void> {
  consentRevision += 1;
  const previous = analyticsEnabled;
  analyticsEnabled = enabled;

  let persistError: unknown;
  try {
    await writeAnalyticsConsent(enabled);
  } catch (error) {
    persistError = error;
  }

  let removeError: unknown;
  if (!enabled) {
    try {
      await removeVisitorRecord();
    } catch (error) {
      removeError = error;
    }
  }

  if (persistError || removeError) {
    if (enabled) analyticsEnabled = previous ?? false;
    throw persistError ?? removeError;
  }
}

/** Rotating random token only; no account ID, email, or IP is used for deduplication. */
export function getCatalogueVisitorToken(): Promise<string | null> {
  if (pending) return pending;
  pending = (async () => {
    if (!(await getCatalogueAnalyticsEnabled())) return null;
    const now = Date.now();
    try {
      const existing = await readRecord();
      if (!(await getCatalogueAnalyticsEnabled())) return null;
      if (validRecord(existing, now)) {
        memoryRecord = existing;
        return existing.token;
      }
    } catch {
      // Local storage can be unavailable in private/restricted browser contexts.
    }

    const next = { token: Crypto.randomUUID(), createdAt: now };
    if (!(await getCatalogueAnalyticsEnabled())) return null;
    memoryRecord = next;
    try { await writeRecord(next); } catch { /* Keep the random token in memory for this app session. */ }
    return await getCatalogueAnalyticsEnabled() ? next.token : null;
  })().finally(() => { pending = undefined; });
  return pending;
}

/** Records a catalogue open only if analytics consent is still enabled. */
export async function recordCatalogueOpenIfEnabled(
  id: string,
  recordOpen: (id: string, visitorToken: string) => void,
): Promise<void> {
  const visitorToken = await getCatalogueVisitorToken();
  if (!visitorToken || !(await getCatalogueAnalyticsEnabled())) return;
  recordOpen(id, visitorToken);
}
