import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { GenerationDraftSettings } from '@/constants/generation';
import { getTemplate, type DanceTemplate } from '@/constants/templates';
import { CorruptDraftStorageError, parseDrafts, readDrafts as readStoredDrafts, writeDrafts } from '@/lib/draft-storage';

export interface Draft extends GenerationDraftSettings {
  id: string;
  templateId: string;
  templateSnapshot?: DanceTemplate;
  photoUri: string;
  duration: number;
  createdAt: number;
  generationStatus?: 'submitting' | 'queued' | 'processing' | 'completed' | 'failed';
  generationRequestId?: string;
  generationError?: string;
  videoUri?: string;
  savedVideoAssetId?: string;
}

export type DraftStorageIssue = 'read' | 'write' | 'corrupt' | null;

interface Ctx {
  ready: boolean;
  favorites: string[];
  drafts: Draft[];
  draftStorageIssue: DraftStorageIssue;
  retryDraftRead: () => Promise<void>;
  retryDraftSave: () => Promise<void>;
  replaceCorruptDrafts: () => Promise<void>;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  addDraft: (d: Omit<Draft, 'id' | 'createdAt'>) => Draft;
  updateDraft: (id: string, updates: Partial<Pick<Draft, 'generationStatus' | 'generationRequestId' | 'generationError' | 'videoUri' | 'savedVideoAssetId'>>) => void;
  removeDraft: (id: string) => void;
}

const DanceContext = createContext<Ctx | null>(null);
const FAV_KEY = 'danceflow:favorites';
const DRAFT_KEY = 'danceflow:drafts';

function mergeDrafts(storedDrafts: Draft[], localDrafts: Draft[]): Draft[] {
  const localIds = new Set(localDrafts.map((draft) => draft.id));
  return [...localDrafts, ...storedDrafts.filter((draft) => !localIds.has(draft.id))];
}

export function DanceProvider({ children, ownerId }: { children: React.ReactNode; ownerId: string }) {
  const favoriteKey = ownerId === 'guest' ? FAV_KEY : `${FAV_KEY}:${ownerId}`;
  const draftKey = ownerId === 'guest' ? DRAFT_KEY : `${DRAFT_KEY}:${ownerId}`;
  const [favorites, setFavorites] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  const [draftStorageIssue, setDraftStorageIssue] = useState<DraftStorageIssue>(null);
  const draftsRef = useRef<Draft[]>([]);
  const issueRef = useRef<DraftStorageIssue>(null);
  const corruptKeyRef = useRef<string | null>(null);
  const canPersistDraftsRef = useRef(false);
  const changedWhileUnavailableRef = useRef(false);
  const mountedRef = useRef(false);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const setStorageIssue = useCallback((issue: DraftStorageIssue) => {
    issueRef.current = issue;
    if (mountedRef.current) setDraftStorageIssue(issue);
  }, []);

  const persistDrafts = useCallback((snapshot: Draft[], targetKey = draftKey) => {
    if (!canPersistDraftsRef.current) return Promise.resolve(false);
    const operation = writeQueueRef.current.then(() => writeDrafts(AsyncStorage, targetKey, snapshot));
    const handled = operation.then<boolean, boolean>(
      () => {
        if (mountedRef.current) {
          corruptKeyRef.current = null;
          changedWhileUnavailableRef.current = false;
          setStorageIssue(null);
        }
        return true;
      },
      () => {
        if (mountedRef.current) setStorageIssue('write');
        return false;
      },
    );
    writeQueueRef.current = handled.then(() => undefined);
    return handled;
  }, [draftKey, setStorageIssue]);

  const readDrafts = useCallback(async () => {
    canPersistDraftsRef.current = false;
    try {
      let loadedDrafts = await readStoredDrafts(AsyncStorage, draftKey);

      // Preserve the original one-time guest-to-account claim, but only migrate valid data.
      if (ownerId !== 'guest' && loadedDrafts === null) {
        const legacy = await AsyncStorage.getItem(DRAFT_KEY);
        if (legacy !== null) {
          loadedDrafts = parseDrafts(legacy, DRAFT_KEY);
          await writeDrafts(AsyncStorage, draftKey, loadedDrafts);
          await AsyncStorage.removeItem(DRAFT_KEY);
        }
      }

      const next = loadedDrafts ?? [];
      const hasLocalChanges = changedWhileUnavailableRef.current;
      const combined = hasLocalChanges ? mergeDrafts(next, draftsRef.current) : next;
      draftsRef.current = combined;
      if (mountedRef.current) setDrafts(combined);
      corruptKeyRef.current = null;
      canPersistDraftsRef.current = true;
      if (hasLocalChanges) {
        if (!await persistDrafts(combined)) return;
      } else {
        changedWhileUnavailableRef.current = false;
        setStorageIssue(null);
      }
    } catch (error) {
      if (error instanceof CorruptDraftStorageError) {
        // If an account has no scoped value, this may be the legacy guest value.
        corruptKeyRef.current = error.key === DRAFT_KEY && ownerId !== 'guest' ? DRAFT_KEY : draftKey;
        setStorageIssue('corrupt');
      } else {
        setStorageIssue('read');
      }
    } finally {
      if (mountedRef.current) setReady(true);
    }
  }, [draftKey, ownerId, persistDrafts, setStorageIssue]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    void AsyncStorage.getItem(favoriteKey)
      .then((value) => {
        if (active && value) setFavorites(JSON.parse(value));
      })
      .catch(() => {});
    void readDrafts();
    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, [favoriteKey, readDrafts]);

  const retryDraftRead = useCallback(async () => {
    setStorageIssue(null);
    await readDrafts();
  }, [readDrafts, setStorageIssue]);

  const retryDraftSave = useCallback(async () => {
    if (issueRef.current === 'corrupt' || issueRef.current === 'read') return;
    await persistDrafts(draftsRef.current);
  }, [persistDrafts]);

  const replaceCorruptDrafts = useCallback(async () => {
    if (issueRef.current !== 'corrupt' || !corruptKeyRef.current) return;
    const damagedKey = corruptKeyRef.current;
    canPersistDraftsRef.current = true;
    const saved = await persistDrafts(draftsRef.current);
    if (!saved) return;
    try {
      // Only remove legacy data after the signed-in owner's copy exists.
      if (damagedKey === DRAFT_KEY && draftKey !== DRAFT_KEY) {
        await AsyncStorage.removeItem(DRAFT_KEY);
      }
      corruptKeyRef.current = null;
      changedWhileUnavailableRef.current = false;
      setStorageIssue(null);
    } catch {
      setStorageIssue('write');
    }
  }, [draftKey, persistDrafts, setStorageIssue]);

  const changeDrafts = useCallback((next: Draft[]) => {
    draftsRef.current = next;
    setDrafts(next);
    if (canPersistDraftsRef.current) {
      void persistDrafts(next);
    } else {
      changedWhileUnavailableRef.current = true;
    }
  }, [persistDrafts]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      AsyncStorage.setItem(favoriteKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [favoriteKey]);

  const addDraft = useCallback((d: Omit<Draft, 'id' | 'createdAt'>) => {
    const draft: Draft = { ...d, templateSnapshot: d.templateSnapshot ?? getTemplate(d.templateId), id: Date.now().toString() + Math.random().toString(36).slice(2, 9), createdAt: Date.now() };
    changeDrafts([draft, ...draftsRef.current]);
    return draft;
  }, [changeDrafts]);

  const updateDraft = useCallback((id: string, updates: Partial<Pick<Draft, 'generationStatus' | 'generationRequestId' | 'generationError' | 'videoUri' | 'savedVideoAssetId'>>) => {
    changeDrafts(draftsRef.current.map((draft) => draft.id === id ? { ...draft, ...updates } : draft));
  }, [changeDrafts]);

  const removeDraft = useCallback((id: string) => {
    changeDrafts(draftsRef.current.filter((draft) => draft.id !== id));
  }, [changeDrafts]);

  const value = useMemo<Ctx>(() => ({
    ready, favorites, drafts, draftStorageIssue, retryDraftRead, retryDraftSave, replaceCorruptDrafts,
    isFavorite: (id) => favorites.includes(id),
    toggleFavorite, addDraft, updateDraft, removeDraft,
  }), [ready, favorites, drafts, draftStorageIssue, retryDraftRead, retryDraftSave, replaceCorruptDrafts, toggleFavorite, addDraft, updateDraft, removeDraft]);

  return <DanceContext.Provider value={value}>{children}</DanceContext.Provider>;
}

export function useDance() {
  const ctx = useContext(DanceContext);
  if (!ctx) throw new Error('useDance must be used within DanceProvider');
  return ctx;
}
