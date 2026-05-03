import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

const links = [
  { to: '/',             label: 'Home' },
  { to: '/about',        label: 'About Us' },
  { to: '/about-portal', label: 'About Portal' },
];

export const PublicLayout = () => {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  // Close drawer on nav
  const close = () => setOpen(false);

  return (
    <div className="min-h-screen flex flex-col bg-brand-gradient-soft bg-mesh">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/80 border-b border-slate-200/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center" onClick={close}>
            <Logo size={36} />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {links.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                className={({ isActive }) => cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'text-navy-800 bg-navy-50'
                    : 'text-slate-600 hover:text-navy-800 hover:bg-slate-100',
                )}
              >
                {l.label}
              </NavLink>
            ))}
            <Link to="/login" className="ml-2">
              <Button size="md" variant="primary">Sign In</Button>
            </Link>
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setOpen(o => !o)}
            className="md:hidden grid h-10 w-10 place-items-center rounded-lg text-navy-800 hover:bg-slate-100"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile drawer */}
        {open && (
          <div className="md:hidden border-t border-slate-200/70 bg-white/95 backdrop-blur-md animate-slide-down">
            <nav className="flex flex-col p-3">
              {links.map(l => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === '/'}
                  onClick={close}
                  className={({ isActive }) => cn(
                    'px-4 py-3 rounded-lg text-sm font-medium',
                    isActive ? 'text-navy-800 bg-navy-50' : 'text-slate-700 hover:bg-slate-100',
                  )}
                >
                  {l.label}
                </NavLink>
              ))}
              <Link to="/login" onClick={close} className="mt-2">
                <Button size="md" variant="primary" className="w-full">Sign In</Button>
              </Link>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1" key={pathname}>
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-slate-200/60 bg-white/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size={28} />
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} National Engineering College — GATE Preparation Portal.
          </p>
        </div>
      </footer>
    </div>
  );
};
