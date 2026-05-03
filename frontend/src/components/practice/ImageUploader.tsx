import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { mediaApi } from '@/lib/api/media';
import { parseApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { ZoomableImage } from './ZoomableImage';

interface Props {
  imageUrl: string | null;
  thumbUrl: string | null;
  onUploaded: (urls: { url: string; thumb_url: string; delete_url: string }) => void;
  onRemove: () => void;
  className?: string;
}

const MAX_BYTES = 5 * 1024 * 1024; // backend allows 5MB
const ALLOWED  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const ImageUploader = ({ imageUrl, thumbUrl, onUploaded, onRemove, className }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error('Only JPG / PNG / WEBP / GIF images are allowed.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image is too large (max 5 MB).');
      return;
    }
    setBusy(true);
    mediaApi.uploadImage(file)
      .then(r => {
        onUploaded({ url: r.url, thumb_url: r.thumb_url, delete_url: r.delete_url });
        toast.success('Image uploaded');
      })
      .catch(err => toast.error(parseApiError(err).message || 'Image upload failed'))
      .finally(() => {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      });
  };

  if (imageUrl) {
    return (
      <div className={cn('relative inline-block group', className)}>
        <ZoomableImage src={imageUrl} thumbSrc={thumbUrl} alt="Question reference" />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove image"
          className="absolute -top-2 -right-2 grid h-7 w-7 place-items-center rounded-full bg-red-500 text-white shadow-card hover:bg-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={busy}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5',
        'text-sm font-medium text-slate-600 hover:bg-slate-100 hover:border-slate-400 transition-colors',
        'disabled:opacity-60 disabled:cursor-wait',
        className,
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      {busy ? 'Uploading…' : 'Add image (optional)'}
      <input
        ref={fileRef}
        type="file"
        accept={ALLOWED.join(',')}
        className="hidden"
        onChange={(e) => pick(e.target.files)}
      />
    </button>
  );
};
