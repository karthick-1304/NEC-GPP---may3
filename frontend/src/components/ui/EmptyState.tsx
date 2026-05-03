import { cn } from '@/lib/cn';

interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState = ({ icon, title, description, action, className }: Props) => (
  <div className={cn('card flex flex-col items-center justify-center text-center px-6 py-14 sm:py-20', className)}>
    {icon && (
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-navy-50 text-navy-700 mb-4">
        {icon}
      </div>
    )}
    <h3 className="font-display font-bold text-navy-900 text-lg">{title}</h3>
    {description && <p className="mt-2 text-sm text-slate-600 max-w-md">{description}</p>}
    {action && <div className="mt-6">{action}</div>}
  </div>
);
