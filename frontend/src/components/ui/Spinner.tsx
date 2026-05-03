import { cn } from '@/lib/cn';

export const Spinner = ({ className }: { className?: string }) => (
  <svg className={cn('h-5 w-5 animate-spin text-navy-700', className)} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
);

export const FullPageSpinner = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-brand-gradient-soft bg-mesh">
    <div className="flex flex-col items-center gap-3">
      <Spinner className="h-8 w-8" />
      <p className="text-sm font-medium text-slate-600">Loading…</p>
    </div>
  </div>
);
