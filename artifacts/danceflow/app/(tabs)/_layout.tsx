import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
        // Own the icon/label layout: the default tab button has additional
        // internal padding that can clip a custom-font label in a short pill.
        tabBarItemStyle: { flex: 1, marginHorizontal: 3 },
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          marginHorizontal: 28,
          bottom,
          height: 80,
          paddingTop: 8,
          paddingBottom: 8,
          paddingHorizontal: 4,
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
            tabBarAccessibilityLabel: t.title,
            tabBarButtonTestID: `bottom-tab-${t.name}`,
            tabBarButton: ({ onPress, onLongPress, accessibilityLabel, testID, 'aria-selected': selected }) => {
              const focused = selected === true;
              const color = focused ? colorsT.primary : colorsT.mutedForeground;
              return (
                <Pressable
                  onPress={onPress}
                  onLongPress={onLongPress}
                  accessibilityRole="tab"
                  accessibilityLabel={accessibilityLabel}
                  accessibilityState={{ selected: focused }}
                  testID={testID}
                  style={[styles.tabButton, {
                    backgroundColor: focused ? colorsT.primary + '1F' : 'transparent',
                  }]}
                >
                  <View style={styles.icon}>
                    {isIOS
                      ? <SymbolView name={t.sf as never} tintColor={color} size={24} />
                      : <Feather name={t.fe} size={22} color={color} />}
                  </View>
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, { color }]}>
                    {t.title}
                  </Text>
                </Pressable>
              );
            },
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    minHeight: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 2,
  },
  icon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: F.bodyHeavy,
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    textAlign: 'center',
    flexShrink: 0,
  },
});

export default function TabLayout() {
  if (isLiquidGlassAvailable()) return <NativeTabLayout />;
  return <ClassicTabLayout />;
}
