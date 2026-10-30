import type { Draft } from '@/context/DanceContext';

export interface DraftStorageAdapter {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export class CorruptDraftStorageError extends Error {
  readonly key: string;

  constructor(key: string, options?: ErrorOptions) {
    super('Stored draft data is invalid.', options);
    this.name = 'CorruptDraftStorageError';
    this.key = key;
  }
}

export function parseDrafts(raw: string, key = 'danceflow:drafts'): Draft[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (cause) {
    throw new CorruptDraftStorageError(key, { cause });
  }
  if (!Array.isArray(value) || value.some((item: unknown) => {
    if (!item || typeof item !== 'object') return true;
    const draft = item as Record<string, unknown>;
    return typeof draft.id !== 'string' ||
      typeof draft.templateId !== 'string' ||
      typeof draft.photoUri !== 'string' ||
      typeof draft.duration !== 'number' ||
      typeof draft.createdAt !== 'number';
  })) {
    throw new CorruptDraftStorageError(key);
  }
  return value as Draft[];
}

export async function readDrafts(storage: Pick<DraftStorageAdapter, 'getItem'>, key: string): Promise<Draft[] | null> {
  const raw = await storage.getItem(key);
  return raw === null ? null : parseDrafts(raw, key);
}

export async function writeDrafts(storage: Pick<DraftStorageAdapter, 'setItem'>, key: string, drafts: Draft[]): Promise<void> {
  await storage.setItem(key, JSON.stringify(drafts));
}
