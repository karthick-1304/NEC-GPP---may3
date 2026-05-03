import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ className, invalid, leftIcon, rightIcon, ...rest }, ref) => (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          {leftIcon}
        </span>
      )}
      <input
        ref={ref}
        className={cn(
          'h-11 w-full rounded-xl border bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400',
          'transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-navy-500',
          'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
          leftIcon && 'pl-10',
          rightIcon && 'pr-10',
          invalid ? 'border-red-400 focus:ring-red-400/40 focus:border-red-500' : 'border-slate-300',
          className,
        )}
        {...rest}
      />
      {rightIcon && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          {rightIcon}
        </span>
      )}
    </div>
  ),
);
Input.displayName = 'Input';
