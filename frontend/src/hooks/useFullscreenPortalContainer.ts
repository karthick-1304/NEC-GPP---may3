import { useEffect, useState } from 'react';

/**
 * Returns the element that Radix portals (Dialog, Popover, Lightbox) should
 * mount into. When the document is in element-fullscreen mode, portals must
 * be re-parented to the fullscreen element — otherwise they render in
 * `document.body` which is BEHIND the fullscreen surface and invisible.
 *
 * Returns:
 *   - the fullscreen element while fullscreen is active
 *   - `undefined` otherwise (Radix uses its default portal target = document.body)
 */
export const useFullscreenPortalContainer = (): HTMLElement | undefined => {
  const [el, setEl] = useState<HTMLElement | undefined>(
    typeof document !== 'undefined' ? (document.fullscreenElement as HTMLElement | null) ?? undefined : undefined,
  );
  useEffect(() => {
    const onChange = () => setEl((document.fullscreenElement as HTMLElement | null) ?? undefined);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange as EventListener);
    };
  }, []);
  return el;
};
