import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';
import type { Role } from '@/types/api';

interface Props {
  roles?: Role[]; // when set, user must match one of these
}

export const RequireAuth = ({ roles }: Props) => {
  const { user, loading } = useAuth();

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/practice" replace />;

  return <Outlet />;
};
