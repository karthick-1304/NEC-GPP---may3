import { cn } from '@/lib/cn';

export const PageContainer = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8', className)}>
    {children}
  </div>
);
