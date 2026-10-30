import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface Draft {
  id: string;
  templateId: string;
  photoUri: string;
  duration: number;
  createdAt: number;
}

interface Ctx {
  ready: boolean;
  favorites: string[];
  drafts: Draft[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  addDraft: (d: Omit<Draft, 'id' | 'createdAt'>) => Draft;
  removeDraft: (id: string) => void;
}

const DanceContext = createContext<Ctx | null>(null);
const FAV_KEY = 'danceflow:favorites';
const DRAFT_KEY = 'danceflow:drafts';

export function DanceProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const [f, d] = await Promise.all([AsyncStorage.getItem(FAV_KEY), AsyncStorage.getItem(DRAFT_KEY)]);
        if (f) setFavorites(JSON.parse(f));
        if (d) setDrafts(JSON.parse(d));
      } catch {}
      setReady(true);
    })();
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      AsyncStorage.setItem(FAV_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const addDraft = useCallback((d: Omit<Draft, 'id' | 'createdAt'>) => {
    const draft: Draft = { ...d, id: Date.now().toString() + Math.random().toString(36).slice(2, 9), createdAt: Date.now() };
    setDrafts((prev) => {
      const next = [draft, ...prev];
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return draft;
  }, []);

  const removeDraft = useCallback((id: string) => {
    setDrafts((prev) => {
      const next = prev.filter((x) => x.id !== id);
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<Ctx>(() => ({
    ready, favorites, drafts,
    isFavorite: (id) => favorites.includes(id),
    toggleFavorite, addDraft, removeDraft,
  }), [ready, favorites, drafts, toggleFavorite, addDraft, removeDraft]);

  return <DanceContext.Provider value={value}>{children}</DanceContext.Provider>;
}

export function useDance() {
  const ctx = useContext(DanceContext);
  if (!ctx) throw new Error('useDance must be used within DanceProvider');
  return ctx;
}
