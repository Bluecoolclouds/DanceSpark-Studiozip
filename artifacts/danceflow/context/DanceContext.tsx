import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { GenerationDraftSettings } from '@/constants/generation';

export interface Draft extends GenerationDraftSettings {
  id: string;
  templateId: string;
  photoUri: string;
  duration: number;
  createdAt: number;
  generationStatus?: 'submitting' | 'queued' | 'processing' | 'completed' | 'failed';
  generationRequestId?: string;
  generationError?: string;
  videoUri?: string;
  savedVideoAssetId?: string;
}

interface Ctx {
  ready: boolean;
  favorites: string[];
  drafts: Draft[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  addDraft: (d: Omit<Draft, 'id' | 'createdAt'>) => Draft;
  updateDraft: (id: string, updates: Partial<Pick<Draft, 'generationStatus' | 'generationRequestId' | 'generationError' | 'videoUri' | 'savedVideoAssetId'>>) => void;
  removeDraft: (id: string) => void;
}

const DanceContext = createContext<Ctx | null>(null);
const FAV_KEY = 'danceflow:favorites';
const DRAFT_KEY = 'danceflow:drafts';

export function DanceProvider({ children, ownerId }: { children: React.ReactNode; ownerId: string }) {
  const favoriteKey = ownerId === 'guest' ? FAV_KEY : `${FAV_KEY}:${ownerId}`;
  const draftKey = ownerId === 'guest' ? DRAFT_KEY : `${DRAFT_KEY}:${ownerId}`;
  const [favorites, setFavorites] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        let [f, d] = await Promise.all([AsyncStorage.getItem(favoriteKey), AsyncStorage.getItem(draftKey)]);
        // Claim pre-account local drafts once for the first account signed in on this device.
        if (ownerId !== 'guest' && !d) {
          const legacy = await AsyncStorage.getItem(DRAFT_KEY);
          if (legacy) {
            await AsyncStorage.setItem(draftKey, legacy);
            await AsyncStorage.removeItem(DRAFT_KEY);
            d = legacy;
          }
        }
        if (ownerId !== 'guest' && !f) {
          const legacy = await AsyncStorage.getItem(FAV_KEY);
          if (legacy) {
            await AsyncStorage.setItem(favoriteKey, legacy);
            await AsyncStorage.removeItem(FAV_KEY);
            f = legacy;
          }
        }
        if (f) setFavorites(JSON.parse(f));
        if (d) setDrafts(JSON.parse(d));
      } catch {}
      setReady(true);
    })();
  }, [ownerId, favoriteKey, draftKey]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      AsyncStorage.setItem(favoriteKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [favoriteKey]);

  const addDraft = useCallback((d: Omit<Draft, 'id' | 'createdAt'>) => {
    const draft: Draft = { ...d, id: Date.now().toString() + Math.random().toString(36).slice(2, 9), createdAt: Date.now() };
    setDrafts((prev) => {
      const next = [draft, ...prev];
      AsyncStorage.setItem(draftKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return draft;
  }, [draftKey]);

  const updateDraft = useCallback((id: string, updates: Partial<Pick<Draft, 'generationStatus' | 'generationRequestId' | 'generationError' | 'videoUri' | 'savedVideoAssetId'>>) => {
    setDrafts((prev) => {
      const next = prev.map((draft) => draft.id === id ? { ...draft, ...updates } : draft);
      AsyncStorage.setItem(draftKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [draftKey]);

  const removeDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      const next = prev.filter((x) => x.id !== id);
      AsyncStorage.setItem(draftKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [draftKey]);

  const value = useMemo<Ctx>(() => ({
    ready, favorites, drafts,
    isFavorite: (id) => favorites.includes(id),
    toggleFavorite, addDraft, updateDraft, removeDraft,
  }), [ready, favorites, drafts, toggleFavorite, addDraft, updateDraft, removeDraft]);

  return <DanceContext.Provider value={value}>{children}</DanceContext.Provider>;
}

export function useDance() {
  const ctx = useContext(DanceContext);
  if (!ctx) throw new Error('useDance must be used within DanceProvider');
  return ctx;
}
