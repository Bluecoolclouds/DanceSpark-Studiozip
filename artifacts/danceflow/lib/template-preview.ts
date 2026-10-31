import { Platform } from 'react-native';

/** Playback variants only: never replace the original URI saved in a draft. */
export function templatePreviewCandidates(uri: string): string[] {
  if (!/\/api\/dance-templates\/trend-0[1-5]\/video\.mp4$/.test(uri)) return [uri];
  const mp4 = uri.replace(/video\.mp4$/, 'preview.mp4');
  const webm = uri.replace(/video\.mp4$/, 'preview.webm');
  if (Platform.OS !== 'web') return [mp4, uri];
  if (typeof document === 'undefined') return [mp4, webm];
  const video = document.createElement('video');
  const supportsMp4 = !!video.canPlayType('video/mp4; codecs="avc1.42E01F, mp4a.40.2"');
  return supportsMp4 ? [mp4, webm] : [webm, mp4];
}
