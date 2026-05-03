import { Search, X } from 'lucide-react';
import { Input } from './Input';
import { cn } from '@/lib/cn';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchInput = ({ value, onChange, placeholder = 'Search…', className }: Props) => (
  <div className={cn('relative flex-1', className)}>
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      leftIcon={<Search className="h-4 w-4" />}
      rightIcon={value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="text-slate-400 hover:text-slate-600 pointer-events-auto"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      ) : undefined}
    />
  </div>
);
