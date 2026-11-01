import type { VideoPlayer } from 'expo-video';
import { useMemo, useRef, useState } from 'react';
import { useColors } from '@/hooks/useColors';
import { templatePreviewCandidates } from '@/lib/template-preview';

/** Own the browser source declaratively: do not mix Expo's replace() with React's src. */
export function CardVideoPreview({ uri }: { uri: string; player: VideoPlayer; ready: boolean }) {
  const c = useColors();
  const candidates = useMemo(() => templatePreviewCandidates(uri), [uri]);
  const video = useRef<HTMLVideoElement>(null);
  const [candidate, setCandidate] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);

  const play = (element: HTMLVideoElement) => {
    if (!element.paused) return;
    void element.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof DOMException && error.name === 'NotAllowedError') setBlocked(true);
    });
  };

  return (
    <>
      <video
        key={`${candidate}-${attempt}`}
        ref={video}
        data-testid="catalogue-preview"
        aria-label="Видео танца"
        src={candidates[candidate]}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', opacity: playing ? 1 : 0, pointerEvents: 'none',
        }}
        onCanPlay={(event) => play(event.currentTarget)}
        onPlaying={() => { setPlaying(true); setBlocked(false); }}
        onError={() => {
          setPlaying(false);
          if (candidate + 1 < candidates.length) setCandidate(candidate + 1);
          else setFailed(true);
        }}
      />
      {(blocked || failed) && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (failed) {
              setFailed(false);
              setPlaying(false);
              setCandidate(0);
              setAttempt((value) => value + 1);
            } else if (video.current) play(video.current);
          }}
          style={{
            position: 'absolute', left: 12, bottom: 80, zIndex: 1,
            padding: '10px 14px', borderRadius: 18, cursor: 'pointer',
            color: c.stageForeground, backgroundColor: c.glass,
            border: `1px solid ${c.glassEdge}`, font: 'inherit',
          }}
        >
          {failed ? 'Повторить видео' : 'Включить видео'}
        </button>
      )}
    </>
  );
}
