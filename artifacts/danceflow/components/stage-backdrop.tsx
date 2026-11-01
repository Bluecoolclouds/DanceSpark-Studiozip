import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/** Solid, noninteractive app backdrop. */
export function StageBackdrop() {
  const c = useColors();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.background }]} />
  );
}
