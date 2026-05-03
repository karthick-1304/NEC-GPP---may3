import * as RT from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const Tabs        = RT.Root;
export const TabsList    = ({ className, ...rest }: RT.TabsListProps) => (
  <RT.List
    className={cn('inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1', className)}
    {...rest}
  />
);
export const TabsTrigger = ({ className, ...rest }: RT.TabsTriggerProps) => (
  <RT.Trigger
    className={cn(
      'px-4 h-9 text-sm font-semibold rounded-lg transition-colors',
      'text-slate-600 hover:text-navy-800',
      'data-[state=active]:bg-white data-[state=active]:text-navy-900 data-[state=active]:shadow-sm',
      className,
    )}
    {...rest}
  />
);
export const TabsContent = ({ className, ...rest }: RT.TabsContentProps) => (
  <RT.Content className={cn('mt-5 focus:outline-none', className)} {...rest} />
);
