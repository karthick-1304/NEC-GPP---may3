import { useState } from 'react';
import * as RDialog from '@radix-ui/react-dialog';
import { X, ZoomIn } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useFullscreenPortalContainer } from '@/hooks/useFullscreenPortalContainer';

interface Props {
  src: string;             // full image URL
  thumbSrc?: string | null; // optional smaller version
  alt?: string;
  className?: string;
}

/**
 * Click-to-zoom image. Renders the thumb inline; opening shows the full image
 * inside a Radix Dialog at ~90vw / 88vh with a close button. Used by:
 *  - QuestionRenderer (practice + test attempt)
 *  - PracticeResultPage per-question review
 *  - Set-editor preview (via ImageUploader)
 */
export const ZoomableImage = ({ src, thumbSrc, alt = 'Image', className }: Props) => {
  const [open, setOpen] = useState(false);
  const portalContainer = useFullscreenPortalContainer();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group relative inline-block rounded-xl overflow-hidden border border-slate-200 bg-slate-50 hover:ring-2 hover:ring-amber-300 transition-all',
          className,
        )}
        aria-label="Click to enlarge"
      >
        <img
          src={thumbSrc ?? src}
          alt={alt}
          loading="lazy"
          className="max-h-64 object-contain"
        />
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/20 transition-colors">
          <span className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[0.7rem] font-semibold text-slate-700 shadow">
            <ZoomIn className="h-3 w-3" /> Click to enlarge
          </span>
        </span>
      </button>

      <RDialog.Root open={open} onOpenChange={setOpen}>
        <RDialog.Portal container={portalContainer}>
          <RDialog.Overlay className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm animate-fade-in" />
          <RDialog.Content
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 max-w-[90vw] max-h-[88vh] animate-modal-scale-in"
          >
            <img
              src={src}
              alt={alt}
              className="max-w-[90vw] max-h-[88vh] rounded-xl bg-white shadow-card-hover object-contain"
            />
            <RDialog.Close
              className="absolute -top-3 -right-3 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-700 shadow-card hover:bg-slate-100"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </RDialog.Close>
          </RDialog.Content>
        </RDialog.Portal>
      </RDialog.Root>
    </>
  );
};
