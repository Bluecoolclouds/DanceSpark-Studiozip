// React Native Web runtime exposes these objects; its older community types
// re-export them as types only. Keep that mismatch inside this preview adapter.
import * as NativeWeb from 'react-native-web';
const native = NativeWeb as unknown as Record<string, any>;
export const { Alert, AppState, Platform, ScrollView, StyleSheet, Text, View, Pressable, useWindowDimensions } = native;
