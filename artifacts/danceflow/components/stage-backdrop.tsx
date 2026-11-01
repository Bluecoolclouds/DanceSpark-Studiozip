import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/** Noninteractive light backdrop: soft lilac wash with restrained pink/violet/yellow ribbons. */
export function StageBackdrop() {
  const c = useColors();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <LinearGradient colors={[c.card, c.background, c.background]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[st.ribbon, { backgroundColor: c.violet, top: 40, right: -120, opacity: 0.1 }]} />
      <View style={[st.ribbon, { backgroundColor: c.tint, top: 110, right: -150, height: 34, opacity: 0.1 }]} />
      <View style={[st.ribbon, { backgroundColor: c.sun, bottom: 160, left: -170, height: 46, opacity: 0.14 }]} />
      <View style={[st.ribbon, { backgroundColor: c.tint, bottom: 110, left: -150, height: 18, opacity: 0.08 }]} />
      <View style={[st.orb, { backgroundColor: c.violet, top: -80, left: -90 }]} />
    </View>
  );
}

const st = StyleSheet.create({
  ribbon: { position: 'absolute', width: 340, height: 64, borderRadius: 32, transform: [{ rotate: '-28deg' }] },
  orb: { position: 'absolute', width: 260, height: 260, borderRadius: 130, opacity: 0.07 },
});
