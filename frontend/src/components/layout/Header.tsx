import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenCheck, ClipboardList, Trophy, ShieldCheck, Users,
  ChevronDown, LogOut, User, Lock, Menu, X,
  Crown, Target, Layers, BookMarked, MailX,
} from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { useAuth } from '@/lib/auth/AuthContext';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Logo } from '@/components/ui/Logo';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/Dropdown';
import type { Role } from '@/types/api';

interface NavLinkDef {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[]; // when omitted, visible to all
}

const NAV: NavLinkDef[] = [
  { to: '/practice',  label: 'Practice',         icon: BookOpenCheck },
  { to: '/tests',     label: 'Tests',            icon: ClipboardList },
  { to: '/progress',  label: 'Progress',         icon: Trophy },
  { to: '/tutorward', label: 'Tutorward',        icon: Users,        roles: ['Staff'] },
  { to: '/admin',     label: 'Admin',            icon: ShieldCheck,  roles: ['Admin'] },
];

export const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Admins see a "Email OFF" pill while the kill switch is engaged.
  const { data: emailStatus } = useQuery({
    queryKey: ['email-status'],
    queryFn: adminApi.getEmailStatus,
    enabled: user?.role === 'Admin',
    refetchInterval: 60_000,
  });

  if (!user) return null;

  const visible = NAV.filter(l => !l.roles || l.roles.includes(user.role));
  const closeMobile = () => setMobileOpen(false);

  // ─── Student stats chips ─────────────────────────────────────────────────
  const isStudent = user.role === 'Student';
  const statChips = isStudent ? ([
    { icon: Target,     label: 'Practice', value: user.practice_score ?? 0,   tone: 'amber' as const },
    { icon: ClipboardList, label: 'Tests',  value: user.test_score     ?? 0,   tone: 'navy'  as const },
    { icon: Layers,     label: 'Lev 1',     value: user.lev_1_completed ?? 0,  tone: 'sky'   as const },
    { icon: Layers,     label: 'Lev 2',     value: user.lev_2_completed ?? 0,  tone: 'violet'as const },
    { icon: BookMarked, label: 'Topics',    value: user.topics_completed ?? 0, tone: 'green' as const },
  ]) : [];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ─── Row 1: brand + identity + nav (desktop) + avatar ──────── */}
        <div className="h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/practice" replace className="shrink-0">
              <Logo size={36} />
            </Link>

            {/* Identity block — collapses on small screens */}
            <div className="hidden md:block pl-3 ml-3 border-l border-slate-200 min-w-0">
              <div className="text-sm font-semibold text-navy-900 truncate max-w-[14rem]">{user.full_name}</div>
              <div className="text-[0.7rem] text-slate-500 leading-tight flex items-center gap-1.5">
                <span className="font-semibold uppercase tracking-wider">{user.role}</span>
                {user.dept_code && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span>{user.dept_code}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Desktop nav.
              `replace` is intentional on every top-nav click. Within a
              section (subject → topic → level → set), navigations push as
              normal so the back button walks back through the hierarchy.
              When the user crosses between sections (e.g. Practice → Tests),
              the deep history of the previous section gets replaced —
              hitting back from /tests no longer returns to a stray
              /practice/subjects/12/topics/4 page from the prior journey. */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {visible.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                replace
                className={({ isActive }) => cn(
                  'inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'text-navy-800 bg-navy-50'
                    : 'text-slate-600 hover:text-navy-800 hover:bg-slate-100',
                )}
              >
                <l.icon className="h-4 w-4" />
                <span>{l.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-2">
            {/* Admin email-off pill */}
            {user.role === 'Admin' && emailStatus?.active && (
              <button
                type="button"
                onClick={() => navigate('/admin?tab=system')}
                className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-200 px-3 h-9 text-xs font-bold text-amber-800 hover:bg-amber-200 transition-colors"
                title={emailStatus.indefinite ? 'Email system OFF — indefinite' : 'Email system OFF — click to manage'}
              >
                <MailX className="h-3.5 w-3.5" />
                Email OFF
              </button>
            )}
            {/* Mobile menu */}
            <button
              type="button"
              className="lg:hidden grid h-10 w-10 place-items-center rounded-lg text-navy-800 hover:bg-slate-100"
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Avatar dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-slate-100 transition-colors group" aria-label="Account menu">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-navy-800 text-white text-sm font-semibold">
                    {initials(user.full_name)}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-500 group-hover:text-navy-700 hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>
                  <span className="block normal-case tracking-normal text-slate-700 text-sm font-semibold">{user.full_name}</span>
                  <span className="block normal-case tracking-normal text-slate-400 text-xs font-normal mt-0.5">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<User className="h-4 w-4" />} onClick={() => navigate('/profile')}>
                  View Profile
                </DropdownMenuItem>
                <DropdownMenuItem icon={<Lock className="h-4 w-4" />} onClick={() => navigate('/profile?tab=password')}>
                  Change Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<LogOut className="h-4 w-4" />} danger onClick={() => logout()}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ─── Row 2: student stat chips (lg+) ─────────────────────────── */}
        {isStudent && (
          <div className="hidden lg:flex items-center justify-end gap-2 pb-3 -mt-1">
            {statChips.map((c) => (
              <StatChip key={c.label} {...c} />
            ))}
          </div>
        )}
      </div>

      {/* ─── Mobile drawer ─────────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-200 bg-white animate-slide-down">
          {/* Identity card on mobile */}
          <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-navy-800 text-white font-semibold">
                {initials(user.full_name)}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-navy-900 truncate">{user.full_name}</div>
                <div className="text-xs text-slate-500">
                  {user.role}{user.dept_code ? ` · ${user.dept_code}` : ''}
                </div>
              </div>
              {user.role === 'Admin' && (
                <Crown className="h-4 w-4 text-amber-500 ml-auto" aria-label="Admin" />
              )}
            </div>
            {isStudent && (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {statChips.map((c) => (
                  <StatChip key={c.label} {...c} compact />
                ))}
              </div>
            )}
          </div>

          <nav className="flex flex-col p-2">
            {visible.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                replace
                onClick={closeMobile}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium',
                  isActive ? 'text-navy-800 bg-navy-50' : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                <l.icon className="h-4 w-4" />
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* highlight active path on mobile via key (re-renders) */}
      <span className="sr-only">{pathname}</span>
    </header>
  );
};

// ─── Tiny stat chip ──────────────────────────────────────────────────────
type Tone = 'amber' | 'navy' | 'sky' | 'violet' | 'green';
const toneCls: Record<Tone, string> = {
  amber:  'bg-amber-50 text-amber-700 border-amber-100',
  navy:   'bg-navy-50 text-navy-800 border-navy-100',
  sky:    'bg-sky-50 text-sky-700 border-sky-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
  green:  'bg-emerald-50 text-emerald-700 border-emerald-100',
};

const StatChip = ({
  icon: Icon, label, value, tone, compact,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: Tone; compact?: boolean }) => (
  <div className={cn(
    'inline-flex items-center gap-2 rounded-lg border font-medium',
    toneCls[tone],
    compact ? 'flex-col gap-0 px-2 py-2 text-center' : 'px-2.5 py-1 text-xs',
  )}>
    {!compact && <Icon className="h-3.5 w-3.5 opacity-70" />}
    <span className={cn('font-semibold', compact ? 'text-base' : 'text-xs')}>{value}</span>
    <span className={cn(compact ? 'text-[0.65rem] uppercase tracking-wider opacity-80' : 'opacity-70')}>{label}</span>
  </div>
);
