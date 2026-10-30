import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { SymbolView } from 'expo-symbols';
import { F } from '@/constants/fonts';
import colors from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function NativeTabLayout() {
  return (
    <NativeTabs tintColor={colors.light.primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'sparkles', selected: 'sparkles' }} />
        <NativeTabs.Trigger.Label>Танцы</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="create">
        <NativeTabs.Trigger.Icon sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }} />
        <NativeTabs.Trigger.Label>Создать</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="studio">
        <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
        <NativeTabs.Trigger.Label>Моё</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colorsT = useColors();
  const insets = useSafeAreaInsets();
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const canBlur = isIOS || isWeb;
  const bottom = isWeb ? 18 : Math.max(insets.bottom, 12);
  const tabs: { name: string; title: string; sf: string; fe: keyof typeof Feather.glyphMap }[] = [
    { name: 'index', title: 'Танцы', sf: 'sparkles', fe: 'star' },
    { name: 'create', title: 'Создать', sf: 'plus.circle.fill', fe: 'plus-circle' },
    { name: 'studio', title: 'Моё', sf: 'heart.fill', fe: 'heart' },
  ];

  return (
    <Tabs
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        tabBarActiveTintColor: colorsT.primary,
        tabBarInactiveTintColor: colorsT.mutedForeground,
        headerShown: false,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontFamily: F.bodyHeavy, fontSize: 11, lineHeight: 16, marginBottom: 0 },
        tabBarIconStyle: { height: 24 },
        tabBarItemStyle: { borderRadius: 999, marginVertical: 6, marginHorizontal: 4, overflow: 'hidden' },
        tabBarActiveBackgroundColor: colors.light.primary + '1F',
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          marginHorizontal: 28,
          bottom,
          height: 76,
          paddingTop: 2,
          paddingBottom: 8,
          borderRadius: 999,
          borderTopWidth: 1,
          borderWidth: 1,
          borderColor: colorsT.glassEdge,
          borderTopColor: colorsT.glassEdge,
          backgroundColor: 'transparent',
          overflow: 'hidden',
          shadowColor: colorsT.glow,
          shadowOpacity: 0.28,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 10,
        },
        tabBarBackground: () =>
          canBlur ? (
            <View style={StyleSheet.absoluteFill}>
              <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colorsT.glass }]} />
            </View>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colorsT.glassFallback }]} />
          ),
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color }) =>
              isIOS ? <SymbolView name={t.sf as never} tintColor={color as string} size={24} /> : <Feather name={t.fe} size={22} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
