import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'amber';
type Size = 'sm' | 'md' | 'lg' | 'icon';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantCls: Record<Variant, string> = {
  primary:   'bg-navy-800 text-white hover:bg-navy-900 active:bg-navy-950 disabled:bg-navy-300 shadow-sm',
  secondary: 'bg-navy-50 text-navy-800 hover:bg-navy-100 active:bg-navy-200 disabled:opacity-60',
  ghost:     'bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200',
  danger:    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 shadow-sm',
  outline:   'border border-slate-300 text-slate-800 bg-white hover:bg-slate-50 active:bg-slate-100',
  amber:     'bg-amber-400 text-navy-900 hover:bg-amber-500 active:bg-amber-500/90 shadow-sm font-semibold',
};

const sizeCls: Record<Size, string> = {
  sm:   'h-8 px-3 text-sm rounded-lg gap-1.5',
  md:   'h-10 px-4 text-sm rounded-xl gap-2',
  lg:   'h-12 px-6 text-base rounded-xl gap-2',
  icon: 'h-9 w-9 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = 'primary', size = 'md', loading, leftIcon, rightIcon, disabled, children, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed',
        variantCls[variant],
        sizeCls[size],
        className,
      )}
      {...rest}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  ),
);
Button.displayName = 'Button';
