import { VideoView, type VideoPlayer } from 'expo-video';
import { Platform, StyleSheet } from 'react-native';

export function CardVideoPreview({ player, ready }: { uri: string; player: VideoPlayer; ready: boolean }) {
  return (
    <VideoView
      player={player}
      style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: ready ? 1 : 0 }]}
      contentFit="cover"
      nativeControls={false}
      playsInline
      surfaceType={Platform.OS === 'android' ? 'textureView' : 'surfaceView'}
    />
  );
}
