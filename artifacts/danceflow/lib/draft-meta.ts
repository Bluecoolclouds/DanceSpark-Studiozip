import { HERO_IMAGE, getTemplate, type DanceTemplate } from '@/constants/templates';

/** Template id stored on Light Swapper drafts made from the user's own video (no trend). */
export const CUSTOM_VIDEO_ID = 'custom-video';

const CUSTOM_VIDEO: DanceTemplate = {
  id: CUSTOM_VIDEO_ID, title: 'Своё видео', dancer: 'Ты', category: 'trend',
  tagline: 'Собственный ролик', description: 'Черновик на основе твоего видео.',
  bpm: null, energy: null, durations: [], moves: [], image: HERO_IMAGE, color: 'accent',
};

export const isCustomVideoId = (id?: string) => id === CUSTOM_VIDEO_ID;

/** Resolves draft metadata; old drafts keep their catalogue or legacy template. */
export const resolveDraftTemplate = (id?: string): DanceTemplate | undefined =>
  isCustomVideoId(id) ? CUSTOM_VIDEO : getTemplate(id);
