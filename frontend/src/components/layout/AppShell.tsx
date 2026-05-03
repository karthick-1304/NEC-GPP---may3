import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { useAuth } from '@/lib/auth/AuthContext';

export const AppShell = () => {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />
      <main className="flex-1"><Outlet /></main>
    </div>
  );
};
