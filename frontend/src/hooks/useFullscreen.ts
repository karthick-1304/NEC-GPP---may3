import { useCallback, useEffect, useState } from 'react';

/**
 * Lightweight hook around the Fullscreen API.
 *
 *   request()   — call from a user gesture
 *   exit()      — leave fullscreen
 *   isFullscreen — true while document.fullscreenElement is set
 *
 * Pass a React ref so we always read `.current` at request-time. Earlier this
 * accepted a raw element (which was `null` at first render and never updated
 * inside the hook's closure).
 */
type RefLike = React.RefObject<HTMLElement> | React.MutableRefObject<HTMLElement | null>;

export const useFullscreen = (targetRef?: RefLike) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== 'undefined' && !!document.fullscreenElement,
  );

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener);
    };
  }, []);

  const request = useCallback(async () => {
    const el = (targetRef?.current ?? document.documentElement) as any;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    } catch {
      // user gesture required or denied — caller keeps its UI state
    }
  }, [targetRef]);

  const exit = useCallback(async () => {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if ((document as any).webkitExitFullscreen) await (document as any).webkitExitFullscreen();
    } catch { /* ignore */ }
  }, []);

  return { isFullscreen, request, exit };
};
