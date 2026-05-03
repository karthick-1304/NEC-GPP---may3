import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';

/**
 * Used on /login + /forgot-password etc. — if a session exists, redirect to /practice.
 */
export const RedirectIfAuthed = () => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/practice" replace />;
  return <Outlet />;
};
