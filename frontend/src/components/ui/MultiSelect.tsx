import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

export interface MultiOption {
  value: number | string;
  label: string;
  description?: string;
  disabled?: boolean;
  pinned?: boolean;       // shown but cannot be removed (e.g. self-dept)
}

interface Props {
  options: MultiOption[];
  value: Array<number | string>;
  onChange: (next: Array<number | string>) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  searchable?: boolean;
}

export const MultiSelect = ({
  options, value, onChange,
  placeholder = 'Select…', emptyText = 'No options',
  className, searchable = true,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;

  const selectedSet = new Set(value);
  const toggle = (opt: MultiOption) => {
    if (opt.disabled || opt.pinned) return;
    const next = new Set(selectedSet);
    if (next.has(opt.value)) next.delete(opt.value);
    else next.add(opt.value);
    onChange(Array.from(next));
  };

  const selectedOpts = options.filter(o => selectedSet.has(o.value));

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full min-h-[2.75rem] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-left text-sm',
            'transition-colors hover:border-slate-400',
            'data-[state=open]:border-navy-500 data-[state=open]:ring-2 data-[state=open]:ring-amber-400/60',
            className,
          )}
        >
          <div className="flex flex-wrap gap-1.5 flex-1 py-1">
            {selectedOpts.length === 0 && (
              <span className="text-slate-400">{placeholder}</span>
            )}
            {selectedOpts.map(o => (
              <span
                key={o.value}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                  o.pinned ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-navy-50 text-navy-800 border border-navy-100',
                )}
              >
                {o.label}
                {!o.pinned && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${o.label}`}
                    className="hover:text-red-600 cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); toggle(o); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggle(o); } }}
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </span>
            ))}
          </div>
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-xl border border-slate-200 bg-white shadow-card-hover animate-scale-in"
        >
          {searchable && (
            <div className="p-2 border-b border-slate-100">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
              />
            </div>
          )}
          <div
            className="max-h-64 overflow-y-auto p-1"
            style={{ overscrollBehavior: 'contain' }}
            onWheel={(e) => {
              // Keep wheel scroll inside the dropdown — don't bubble to the page.
              e.stopPropagation();
            }}
          >
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-sm text-slate-400 text-center">{emptyText}</div>
            )}
            {filtered.map(o => {
              const selected = selectedSet.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o)}
                  disabled={o.disabled}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors border',
                    selected
                      ? o.pinned
                        ? 'bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-amber-200'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-1 ring-emerald-200'
                      : 'text-slate-700 border-transparent hover:bg-slate-100',
                    o.pinned && 'cursor-not-allowed',
                    o.disabled && 'opacity-40 cursor-not-allowed',
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate">
                      {o.label}
                      {o.pinned && <span className="ml-2 text-[0.65rem] uppercase tracking-wider text-amber-700">your dept</span>}
                    </div>
                    {o.description && <div className="text-xs text-slate-400 truncate">{o.description}</div>}
                  </div>
                  {selected && <Check className={cn('h-4 w-4 shrink-0', o.pinned ? 'text-amber-500' : 'text-emerald-600')} />}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
