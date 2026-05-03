import { cn } from '@/lib/cn';

interface Props {
  size?: number;
  className?: string;
  withWordmark?: boolean;
}

export const Logo = ({ size = 36, className, withWordmark = true }: Props) => (
  <div className={cn('flex items-center gap-2.5', className)}>
    <span
      className="grid place-items-center rounded-xl bg-navy-800 text-white font-display font-bold shadow-card"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      aria-hidden
    >
      <span className="relative">
        N
        <span
          className="absolute -right-1 -bottom-0.5 h-1.5 w-1.5 rounded-full bg-amber-400"
          aria-hidden
        />
      </span>
    </span>
    {withWordmark && (
      <div className="leading-tight">
        <div className="font-display font-bold text-navy-900 text-[0.95rem] tracking-tight">
          NEC GATE
        </div>
        <div className="text-[0.65rem] uppercase tracking-[0.16em] text-slate-500 font-semibold">
          Preparation Portal
        </div>
      </div>
    )}
  </div>
);
