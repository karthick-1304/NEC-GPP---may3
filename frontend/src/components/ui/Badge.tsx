import { cn } from '@/lib/cn';

type Tone = 'navy' | 'amber' | 'green' | 'red' | 'slate' | 'sky' | 'violet';

const toneCls: Record<Tone, string> = {
  navy:   'bg-navy-50 text-navy-800 border-navy-100',
  amber:  'bg-amber-50 text-amber-700 border-amber-100',
  green:  'bg-emerald-50 text-emerald-700 border-emerald-100',
  red:    'bg-red-50 text-red-700 border-red-100',
  slate:  'bg-slate-100 text-slate-700 border-slate-200',
  sky:    'bg-sky-50 text-sky-700 border-sky-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
};

interface Props {
  tone?: Tone;
  size?: 'sm' | 'md';
  className?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const Badge = ({ tone = 'slate', size = 'sm', className, children, icon }: Props) => (
  <span className={cn(
    'inline-flex items-center gap-1 font-medium rounded-full border',
    size === 'sm' ? 'px-2 py-0.5 text-[0.7rem]' : 'px-2.5 py-1 text-xs',
    toneCls[tone],
    className,
  )}>
    {icon}
    {children}
  </span>
);
