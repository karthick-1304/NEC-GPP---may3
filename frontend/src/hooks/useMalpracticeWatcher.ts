import { useEffect, useRef } from 'react';

/**
 * Reports two distinct events while a practice attempt is in progress:
 *
 *   onWipe()       — fired on tab-switch / new-tab / window blur (with hidden tab) / pagehide.
 *                    The caller treats this as a hard exit (no API submit, no recovery).
 *
 *   onLeftFullscreen()
 *                  — fired when the document leaves fullscreen mode while the tab is
 *                    still visible (typically: user pressed Esc).
 *                    The caller shows a soft "return to fullscreen" overlay.
 *
 * `enabled` lets the caller stop both watchers (e.g. after submission completes).
 *
 * Implementation note: callbacks are stashed in refs so the listener effect runs ONCE
 * per `enabled` toggle. Otherwise, recreating callbacks on every render would tear down
 * and re-add listeners — and a fullscreenchange that fires during that gap could be
 * missed. Refs keep callbacks always-current without re-binding listeners.
 */
interface Options {
  enabled: boolean;
  onWipe: () => void;
  onLeftFullscreen: () => void;
}

export const useMalpracticeWatcher = ({ enabled, onWipe, onLeftFullscreen }: Options) => {
  const wipeRef = useRef(onWipe);
  const fsRef   = useRef(onLeftFullscreen);
  // Keep refs current
  useEffect(() => { wipeRef.current = onWipe; }, [onWipe]);
  useEffect(() => { fsRef.current   = onLeftFullscreen; }, [onLeftFullscreen]);

  useEffect(() => {
    if (!enabled) return;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') wipeRef.current();
    };
    const onBlur = () => {
      // Wait one tick — fullscreen exits sometimes blur briefly without hiding the tab.
      // We only treat blur as malpractice if the tab is genuinely hidden.
      setTimeout(() => { if (document.hidden) wipeRef.current(); }, 0);
    };
    const onPageHide = () => wipeRef.current();
    const onFsChange = () => {
      if (!document.fullscreenElement && document.visibilityState === 'visible') {
        fsRef.current();
      }
    };
    // Belt-and-suspenders: some browsers consume the Esc key and exit fullscreen
    // without firing fullscreenchange synchronously. The keydown fires first, so
    // we react to it directly. The parent's onLeftFullscreen handler already
    // gates on `phase === 'attempt'`, so spurious calls are no-ops.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fsRef.current();
    };

    // Capture phase ensures we react to fullscreen exits before any blur handlers run.
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('fullscreenchange',       onFsChange, true);
    document.addEventListener('webkitfullscreenchange', onFsChange as EventListener, true);
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('fullscreenchange',       onFsChange, true);
      document.removeEventListener('webkitfullscreenchange', onFsChange as EventListener, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [enabled]);
};
