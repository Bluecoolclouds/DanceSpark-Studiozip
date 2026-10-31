import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';

type Palette = typeof colors.light;
/** Optional scoped palette override. Undefined everywhere except screens that opt in. */
export const ColorScope = createContext<Palette | undefined>(undefined);

export function useColors() {
  const scheme = useColorScheme();
  const scoped = useContext(ColorScope);
  const palette = scoped ?? (scheme === 'dark' && 'dark' in colors
    ? (colors as Record<string, Palette>).dark
    : colors.light);
  return { ...palette, radius: colors.radius };
}
