import { Platform } from 'react-native';

/** Playback variants only: never replace the original URI saved in a draft. */
export function templatePreviewCandidates(uri: string): string[] {
  const match = uri.match(/\/api\/dance-templates\/(trend-\d+)\/(video|result)\.mp4$/);
  if (!match) return [uri];
  const [, , mediaKind] = match;
  const mp4 = uri.replace(/(?:video|result)\.mp4$/, mediaKind === 'video' ? 'preview.mp4' : 'result-preview.mp4');
  const webm = uri.replace(/(?:video|result)\.mp4$/, mediaKind === 'video' ? 'preview.webm' : 'result.webm');
  if (Platform.OS !== 'web') return [mp4, uri];
  if (typeof document === 'undefined') return [mp4, webm, uri];
  const video = document.createElement('video');
  const supportsMp4 = !!video.canPlayType('video/mp4; codecs="avc1.42E01F, mp4a.40.2"');
  return supportsMp4 ? [mp4, webm, uri] : [webm, mp4, uri];
}
