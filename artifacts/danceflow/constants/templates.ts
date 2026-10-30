

export type Category = 'kpop' | 'street' | 'disco' | 'trend';
export type ColorKey = 'primary' | 'secondary' | 'accent' | 'violet' | 'sun';

export interface DanceTemplate {
  id: string;
  title: string;
  dancer: string;
  category: Category;
  tagline: string;
  description: string;
  bpm: number;
  energy: 1 | 2 | 3 | 4 | 5;
  durations: number[];
  moves: string[];
  image: number;
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

export const TEMPLATES: DanceTemplate[] = [
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

export const getTemplate = (id?: string) => TEMPLATES.find((t) => t.id === id);
export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.key === c)?.label ?? c;
