import * as RDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useFullscreenPortalContainer } from '@/hooks/useFullscreenPortalContainer';

interface ConfirmProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export const ConfirmDialog = ({
  open, onOpenChange, title, description,
  confirmText = 'Confirm', cancelText = 'Cancel',
  destructive, loading, onConfirm,
}: ConfirmProps) => {
  const container = useFullscreenPortalContainer();
  return (
  <RDialog.Root open={open} onOpenChange={onOpenChange}>
    <RDialog.Portal container={container}>
      <RDialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm animate-fade-in" />
      <RDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-2xl bg-white p-6 shadow-card-hover animate-modal-scale-in',
        )}
      >
        <RDialog.Title className="text-lg font-display font-bold text-navy-900">{title}</RDialog.Title>
        {description && (
          <RDialog.Description className="mt-2 text-sm text-slate-600 leading-relaxed">
            {description}
          </RDialog.Description>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 px-4 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100"
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={loading}
            className={cn(
              'h-10 px-4 rounded-xl text-sm font-semibold text-white shadow-sm',
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-navy-800 hover:bg-navy-900',
              loading && 'opacity-70 cursor-wait',
            )}
          >
            {loading ? 'Working…' : confirmText}
          </button>
        </div>
        <RDialog.Close
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </RDialog.Close>
      </RDialog.Content>
    </RDialog.Portal>
  </RDialog.Root>
  );
};

interface DialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export const Dialog = ({ open, onOpenChange, title, description, children, size = 'md' }: DialogProps) => {
  const container = useFullscreenPortalContainer();
  return (
  <RDialog.Root open={open} onOpenChange={onOpenChange}>
    <RDialog.Portal container={container}>
      <RDialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm animate-fade-in" />
      <RDialog.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[92vw] -translate-x-1/2 -translate-y-1/2',
          'rounded-2xl bg-white shadow-card-hover animate-modal-scale-in',
          'max-h-[90vh] overflow-hidden flex flex-col',
          sizeMap[size],
        )}
      >
        {(title || description) && (
          <div className="px-6 pt-6 pb-4 border-b border-slate-100">
            {title && (
              <RDialog.Title className="text-lg font-display font-bold text-navy-900">{title}</RDialog.Title>
            )}
            {description && (
              <RDialog.Description className="mt-1 text-sm text-slate-600">{description}</RDialog.Description>
            )}
          </div>
        )}
        <div className="overflow-y-auto px-6 py-5 flex-1">{children}</div>
        <RDialog.Close
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </RDialog.Close>
      </RDialog.Content>
    </RDialog.Portal>
  </RDialog.Root>
  );
};
