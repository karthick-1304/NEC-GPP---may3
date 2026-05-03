import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Crumb {
  label: string;
  to?: string;     // missing => current
}

interface Props {
  items: Crumb[];
  className?: string;
}

export const Breadcrumbs = ({ items, className }: Props) => (
  <nav className={cn('flex items-center text-sm flex-wrap gap-1 text-slate-500', className)} aria-label="Breadcrumb">
    {items.map((c, i) => {
      const last = i === items.length - 1;
      return (
        <span key={i} className="inline-flex items-center gap-1 min-w-0">
          {c.to && !last ? (
            <Link to={c.to} className="hover:text-navy-800 font-medium truncate max-w-[14rem]">{c.label}</Link>
          ) : (
            <span className={cn('truncate max-w-[18rem]', last ? 'text-navy-900 font-semibold' : 'font-medium')}>
              {c.label}
            </span>
          )}
          {!last && <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
        </span>
      );
    })}
  </nav>
);
