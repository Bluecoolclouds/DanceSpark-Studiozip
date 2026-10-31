import { Image, type ImageProps } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { resolveDraftVideo } from '@/lib/draft-media';

/** Resolve durable browser media and release its object URL on owner unmount. */
export function DraftImage({ uri, ...props }: Omit<ImageProps, 'source'> & { uri: string }) {
  return <ImageSession key={uri} uri={uri} {...props} />;
}

function ImageSession({ uri, ...props }: Omit<ImageProps, 'source'> & { uri: string }) {
  const [source, setSource] = useState<string | null>(uri.startsWith('danceflow-media:') ? null : uri);
  useEffect(() => {
    let active = true;
    let dispose = () => {};
    void resolveDraftVideo(uri).then(media => {
      if (!active) { media.dispose(); return; }
      dispose = media.dispose;
      setSource(media.uri);
    }).catch(() => { if (active) setSource(null); });
    return () => { active = false; dispose(); };
  }, [uri]);
  return <Image {...props} source={source ? { uri: source } : undefined}
    accessibilityLabel={source ? props.accessibilityLabel : 'Фото недоступно в хранилище устройства'} />;
}
