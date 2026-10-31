

export type Category = 'kpop' | 'street' | 'disco' | 'trend';
export type ColorKey = 'primary' | 'secondary' | 'accent' | 'violet' | 'sun';

export interface DanceTemplate {
  id: string;
  title: string;
  dancer: string;
  category: Category;
  tagline: string;
  description: string;
  bpm: number | null;
  energy: 1 | 2 | 3 | 4 | 5 | null;
  durations: number[];
  moves: string[];
  image: number | { uri: string };
  videoPoster?: number | { uri: string };
  videoUri?: string;
  sourceDurationSeconds?: number;
  referenceImageUris?: string[];
  exampleResultUri?: string;
  color: ColorKey;
  isNew?: boolean;
}

const pop = require('@/assets/images/dance-pop.png');
const street = require('@/assets/images/dance-street.png');
const hero = require('@/assets/images/dance-hero.png');

export const HERO_IMAGE = hero;

export const CATEGORIES: { key: Category | 'all'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'kpop', label: 'K-pop' },
  { key: 'street', label: 'Стрит' },
  { key: 'disco', label: 'Диско' },
  { key: 'trend', label: 'Тренды' },
];

// Existing drafts keep resolving their original metadata; legacy dances are not
// offered in the new catalogue.
const LEGACY_TEMPLATES: DanceTemplate[] = [
  {
    id: 'bubblegum-rush', title: 'Bubblegum Rush', dancer: 'Мика', category: 'kpop',
    tagline: 'Хвостики летят, сцена взрывается',
    description: 'Яркий K-pop припев с резкими акцентами рук и прыжком на финале. Подходит для фото в полный рост.',
    bpm: 128, energy: 5, durations: [5, 10, 15],
    moves: ['Кулак вверх на счёт раз', 'Волна плечами', 'Шаг-крест с разворотом', 'Финальная поза-звезда'],
    image: pop, color: 'primary', isNew: true,
  },
  {
    id: 'lime-voltage', title: 'Lime Voltage', dancer: 'Рэй', category: 'street',
    tagline: 'Брейк-заход на неоновом бетоне',
    description: 'Пружинистый грув, колено вверх и резкие стопы. Лучше всего работает с фото, где видны руки.',
    bpm: 98, energy: 4, durations: [5, 10],
    moves: ['Бит-кач корпусом', 'Колено в прыжке', 'Указатель вдаль', 'Фриз на одной ноге'],
    image: street, color: 'accent',
  },
  {
    id: 'hexa-star', title: 'Hexa Star', dancer: 'Нова', category: 'disco',
    tagline: 'Диско-шаг в серебряной куртке',
    description: 'Плавные руки, хай-кик и сияющий пол-шестиугольник. Танец для селфи и портретов.',
    bpm: 118, energy: 3, durations: [10, 15],
    moves: ['Руки-крылья', 'Хай-кик вправо', 'Диско-палец', 'Поворот на носке'],
    image: hero, color: 'violet', isNew: true,
  },
  {
    id: 'confetti-cannon', title: 'Confetti Cannon', dancer: 'Мика', category: 'trend',
    tagline: 'Тот самый тренд, только твой',
    description: 'Короткая петля под вирусный припев: хлопок, пружина, взгляд в камеру.',
    bpm: 132, energy: 4, durations: [5],
    moves: ['Двойной хлопок', 'Пружина коленями', 'Подмигивание в камеру'],
    image: pop, color: 'sun',
  },
  {
    id: 'grid-runner', title: 'Grid Runner', dancer: 'Рэй', category: 'trend',
    tagline: 'Шаффл по лазерной сетке',
    description: 'Быстрый шаффл с перекатами стоп. Энергичный, но простой для любого фото.',
    bpm: 124, energy: 5, durations: [5, 10, 15],
    moves: ['Шаффл вперёд', 'Перекат стоп', 'Боковой слайд', 'Стоп-кадр'],
    image: street, color: 'secondary',
  },
  {
    id: 'velvet-orbit', title: 'Velvet Orbit', dancer: 'Нова', category: 'disco',
    tagline: 'Медленное вращение под дискошаром',
    description: 'Мягкий грув на 100 BPM. Для тех, кто хочет красиво, а не громко.',
    bpm: 100, energy: 2, durations: [10, 15],
    moves: ['Покачивание бёдрами', 'Рука по дуге', 'Медленный оборот'],
    image: hero, color: 'sun',
  },
  {
    id: 'seoul-sparkle', title: 'Seoul Sparkle', dancer: 'Мика', category: 'kpop',
    tagline: 'Пальцы-сердечки и точные стопы',
    description: 'Милый, но чёткий K-pop куплет с синхронными движениями рук.',
    bpm: 112, energy: 3, durations: [5, 10],
    moves: ['Сердечко пальцами', 'Шаг-тап', 'Наклон с улыбкой'],
    image: pop, color: 'violet',
  },
];

const mediaUrl = (id: string, asset: string) =>
  `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/dance-templates/${id}/${asset}`;

const uploaded = [
  { id: 'trend-01', seconds: 13.000522, color: 'primary' as const },
  { id: 'trend-02', seconds: 15.092971, color: 'secondary' as const },
  { id: 'trend-03', seconds: 41.988005, color: 'violet' as const },
  { id: 'trend-04', seconds: 20.064, color: 'accent' as const },
  { id: 'trend-05', seconds: 21.566667, color: 'primary' as const },
  {
    id: 'trend-06', seconds: 11.055011, color: 'secondary' as const,
    videoPoster: { uri: mediaUrl('trend-06', 'reference-poster.jpg') },
    referenceImageUris: [
      mediaUrl('trend-06', 'character-01.jpg'),
      mediaUrl('trend-06', 'character-02.jpg'),
    ],
    exampleResultUri: mediaUrl('trend-06', 'result.mp4'),
  },
];

export const TEMPLATES: DanceTemplate[] = uploaded.map((item, index) => ({
  id: item.id,
  title: `Тренд ${String(index + 1).padStart(2, '0')}`,
  dancer: '',
  category: 'trend',
  tagline: 'Реальное видео с движениями',
  description: `Исходный ролик: ${Math.round(item.seconds)} сек, со звуком. Посмотри видео и выбери его для переноса движений на персонажа с твоего фото.`,
  bpm: null,
  energy: null,
  durations: [Math.min(Math.floor(item.seconds), 15)],
  moves: [],
  image: { uri: mediaUrl(item.id, 'poster.jpg') },
  videoPoster: 'videoPoster' in item ? item.videoPoster : undefined,
  videoUri: mediaUrl(item.id, 'video.mp4'),
  sourceDurationSeconds: item.seconds,
  referenceImageUris: 'referenceImageUris' in item ? item.referenceImageUris : undefined,
  exampleResultUri: 'exampleResultUri' in item ? item.exampleResultUri : undefined,
  color: item.color,
  isNew: true,
}));

// Editorial recommendations are intentionally fixed and independent of user data.
export const RECOMMENDED_TEMPLATE_IDS = ['trend-06', 'trend-03', 'trend-01'] as const;
export const RECOMMENDED_TEMPLATES = RECOMMENDED_TEMPLATE_IDS
  .map((id) => TEMPLATES.find((template) => template.id === id))
  .filter((template): template is DanceTemplate => template != null);

export const getTemplate = (id?: string) =>
  TEMPLATES.find((t) => t.id === id) ?? LEGACY_TEMPLATES.find((t) => t.id === id);
export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.key === c)?.label ?? c;
