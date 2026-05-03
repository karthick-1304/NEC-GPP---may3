import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
  className?: string;
}

const buildRange = (cur: number, last: number): Array<number | '…'> => {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const out: Array<number | '…'> = [1];
  if (cur > 3) out.push('…');
  const start = Math.max(2, cur - 1);
  const end = Math.min(last - 1, cur + 1);
  for (let i = start; i <= end; i++) out.push(i);
  if (cur < last - 2) out.push('…');
  out.push(last);
  return out;
};

export const Pagination = ({ page, total, limit, onChange, className }: Props) => {
  const last = Math.max(1, Math.ceil(total / limit));
  if (last <= 1) return null;
  const pages = buildRange(page, last);

  const btn = 'h-9 w-9 grid place-items-center rounded-lg text-sm font-semibold transition-colors';
  return (
    <nav className={cn('flex items-center justify-center gap-1', className)} aria-label="Pagination">
      <button
        type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}
        className={cn(btn, 'text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent')}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e-${i}`} className="px-2 text-slate-400">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(btn, p === page
              ? 'bg-navy-800 text-white shadow-sm'
              : 'text-slate-700 hover:bg-slate-100')}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button" onClick={() => onChange(page + 1)} disabled={page >= last}
        className={cn(btn, 'text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent')}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
};
