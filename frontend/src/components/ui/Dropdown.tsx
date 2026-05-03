import * as RDM from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/cn';

export const DropdownMenu = RDM.Root;
export const DropdownMenuTrigger = RDM.Trigger;

export const DropdownMenuContent = ({
  className, children, align = 'end', sideOffset = 6, ...rest
}: RDM.DropdownMenuContentProps) => (
  <RDM.Portal>
    <RDM.Content
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[200px] rounded-xl bg-white border border-slate-200 shadow-card-hover',
        'p-1.5 animate-scale-in',
        className,
      )}
      {...rest}
    >
      {children}
    </RDM.Content>
  </RDM.Portal>
);

interface ItemProps extends RDM.DropdownMenuItemProps {
  danger?: boolean;
  icon?: React.ReactNode;
}

export const DropdownMenuItem = ({ className, danger, icon, children, ...rest }: ItemProps) => (
  <RDM.Item
    className={cn(
      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium cursor-pointer outline-none',
      'transition-colors',
      danger
        ? 'text-red-600 hover:bg-red-50 focus:bg-red-50 data-[disabled]:opacity-40'
        : 'text-slate-700 hover:bg-slate-100 focus:bg-slate-100 data-[disabled]:opacity-40',
      'data-[disabled]:cursor-not-allowed',
      className,
    )}
    {...rest}
  >
    {icon && <span className="shrink-0">{icon}</span>}
    {children}
  </RDM.Item>
);

export const DropdownMenuSeparator = () => (
  <RDM.Separator className="my-1 h-px bg-slate-100" />
);

export const DropdownMenuLabel = ({ children }: { children: React.ReactNode }) => (
  <RDM.Label className="px-3 py-1.5 text-[0.7rem] uppercase tracking-wider text-slate-400 font-semibold">
    {children}
  </RDM.Label>
);
