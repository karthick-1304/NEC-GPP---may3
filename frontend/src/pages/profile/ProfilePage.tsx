import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User, Mail, Phone, Building2, GraduationCap, Award,
  Lock, Eye, EyeOff, Layers, BookMarked, Target, Trophy,
  Shield, Smartphone, LogOut as LogOutIcon, ClipboardList,
  Crown, Hash, Users,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer } from '@/components/ui/PageContainer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { InfoNote } from '@/components/ui/InfoNote';
import { useAuth } from '@/lib/auth/AuthContext';
import { authApi } from '@/lib/api/auth';
import { usersApi } from '@/lib/api/users';
import { parseApiError } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

export default function ProfilePage() {
  const [params, setParams] = useSearchParams();
  const initialTab = params.get('tab') === 'password' ? 'password'
                  : params.get('tab') === 'sessions' ? 'sessions'
                  : 'overview';
  const [tab, setTab] = useState<string>(initialTab);

  const handleTabChange = (v: string) => {
    setTab(v);
    if (v === 'overview') params.delete('tab');
    else params.set('tab', v);
    setParams(params, { replace: true });
  };

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Your Profile</h1>
        <p className="text-sm text-slate-500 mt-1">Personal info, security, and active sessions.</p>
      </div>
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="password">Change Password</TabsTrigger>
          <TabsTrigger value="sessions">Active Sessions</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="password"><PasswordTab /></TabsContent>
        <TabsContent value="sessions"><SessionsTab /></TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────
function OverviewTab() {
  const { user, refreshMe } = useAuth();
  // Fetch full /users/me on mount for fresh role-specific data
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    staleTime: 60_000,
  });
  // Keep header chips fresh too
  useEffect(() => { refreshMe().catch(() => {}); /* eslint-disable-line */ }, []);

  if (!user) return null;
  const profile = (data ?? user) as Record<string, any>;

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-1">
        <div className="card p-6">
          <div className="flex flex-col items-center text-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-navy-800 text-white text-2xl font-bold shadow-card">
              {(profile.full_name as string || '?').split(' ').map((p: string) => p[0]).slice(0,2).join('').toUpperCase()}
            </div>
            <h2 className="mt-4 font-display font-bold text-navy-900 text-lg">{profile.full_name}</h2>
            <Badge tone={profile.role === 'Admin' ? 'amber' : 'navy'} className="mt-2">
              {profile.role === 'Admin' && <Crown className="h-3 w-3" />}
              {profile.role}
            </Badge>
          </div>
          <div className="mt-5 pt-5 border-t border-slate-100 space-y-3 text-sm">
            <Row icon={<Mail className="h-4 w-4" />} label="Email" value={profile.email} />
            {/* Reg number sits with the identity, right under email — it's an
                identifier (like the email) not a "progress" stat. */}
            {profile.role === 'Student' && profile.reg_num && (
              <Row icon={<Hash className="h-4 w-4" />} label="Reg No." value={profile.reg_num} />
            )}
            {profile.phone_number && (
              <Row icon={<Phone className="h-4 w-4" />} label="Phone" value={profile.phone_number} />
            )}
            {profile.dept_code && (
              <Row icon={<Building2 className="h-4 w-4" />} label="Department"
                   value={`${profile.dept_name ?? ''} ${profile.dept_code ? `(${profile.dept_code})` : ''}`} />
            )}
            <Row icon={<Hash className="h-4 w-4" />} label="User ID" value={`#${profile.user_id}`} />
            <Row icon={<Smartphone className="h-4 w-4" />} label="Previous login"
                 // The login response captured the timestamp BEFORE it overwrote
                 // last_login to "now". Show that — it's the meaningful value
                 // ("when this account last signed in"). Falls back to whatever
                 // /me has if sessionStorage isn't available (e.g. after a
                 // bootstrap-via-refresh cold load).
                 value={formatDateTime(
                   (typeof window !== 'undefined' && sessionStorage.getItem('previousLoginAt'))
                     || (profile.last_login as string | null | undefined),
                 )} />
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-5">
        {profile.role === 'Student' && (
          <>
            <SectionCard title="Practice progress" icon={<Target className="h-4 w-4" />}>
              {/* Reg No used to live here — moved up next to Email since it's
                  an identifier, not a progress stat. */}
              <div className="grid sm:grid-cols-3 gap-3">
                <Stat label="Practice Score"  value={profile.practice_score ?? 0}  icon={<Target className="h-4 w-4" />} tone="amber" />
                <Stat label="Test Score"      value={profile.test_score ?? 0}      icon={<ClipboardList className="h-4 w-4" />} tone="navy" />
                <Stat label="Topics Cleared"  value={profile.topics_completed ?? 0} icon={<BookMarked className="h-4 w-4" />} tone="green" />
                <Stat label="Level 1 Sets"    value={profile.lev_1_completed ?? 0} icon={<Layers className="h-4 w-4" />} tone="sky" />
                <Stat label="Level 2 Sets"    value={profile.lev_2_completed ?? 0} icon={<Layers className="h-4 w-4" />} tone="violet" />
              </div>
            </SectionCard>
            <SectionCard title="Academics" icon={<GraduationCap className="h-4 w-4" />}>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <Row icon={<Award className="h-4 w-4" />} label="Batch year" value={profile.batch_year ?? '—'} />
                <Row icon={<User className="h-4 w-4" />} label="Tutor"
                     value={profile.tutor_name
                       ? `${profile.tutor_name}${profile.tutor_dept_code ? ` · ${profile.tutor_dept_code}` : ''}`
                       : 'Not assigned'} />
              </div>
            </SectionCard>
          </>
        )}

        {profile.role === 'Staff' && (
          <SectionCard title="Tutor info" icon={<Users />}>
            <div className="grid sm:grid-cols-3 gap-3">
              <Stat label="Active Tutor" value={profile.is_active_tutor ? 'Yes' : 'No'} icon={<Shield className="h-4 w-4" />} tone={profile.is_active_tutor ? 'green' : 'slate'} />
              <Stat label="Tutoring Batch"  value={profile.tutor_batch_year ?? '—'}        icon={<Award className="h-4 w-4" />} tone="amber" />
              <Stat label="Ward Strength"        value={profile.tutorward_count ?? 0}            icon={<Users className="h-4 w-4" />} tone="navy" />
            </div>
          </SectionCard>
        )}

        {profile.role === 'Dept Head' && (
          <SectionCard title="Department snapshot" icon={<Building2 />}>
            <div className="grid sm:grid-cols-3 gap-3">
              <Stat label="Students"      value={profile.student_count ?? 0}      icon={<GraduationCap className="h-4 w-4" />} tone="navy" />
              <Stat label="Staff"          value={profile.staff_count ?? 0}        icon={<Users className="h-4 w-4" />} tone="sky" />
              <Stat label="Active Tutors"  value={profile.active_tutor_count ?? 0} icon={<Trophy className="h-4 w-4" />} tone="amber" />
            </div>
          </SectionCard>
        )}

        {isLoading && (
          <div className="card p-6">
            <div className="skeleton h-4 w-1/3 mb-3" />
            <div className="skeleton h-4 w-2/3 mb-2" />
            <div className="skeleton h-4 w-1/2" />
          </div>
        )}
      </div>
    </div>
  );
}

const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <span className="text-slate-400 mt-0.5">{icon}</span>
    <div className="min-w-0 flex-1">
      <div className="text-[0.7rem] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className="text-sm text-slate-800 break-words">{value}</div>
    </div>
  </div>
);

const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <section className="card p-6">
    <header className="flex items-center gap-2 text-navy-900 mb-4">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-navy-50 text-navy-700">{icon}</span>
      <h3 className="font-display font-bold">{title}</h3>
    </header>
    {children}
  </section>
);

const toneStat: Record<string, string> = {
  amber:  'bg-amber-50 text-amber-700 border-amber-100',
  navy:   'bg-navy-50 text-navy-800 border-navy-100',
  sky:    'bg-sky-50 text-sky-700 border-sky-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
  green:  'bg-emerald-50 text-emerald-700 border-emerald-100',
  slate:  'bg-slate-50 text-slate-700 border-slate-200',
};
const Stat = ({ label, value, icon, tone = 'navy' }: {
  label: string; value: React.ReactNode; icon: React.ReactNode; tone?: keyof typeof toneStat;
}) => (
  <div className={cn('rounded-xl border px-4 py-3 flex items-center gap-3', toneStat[tone])}>
    <span className="opacity-80">{icon}</span>
    <div>
      <div className="text-[0.7rem] uppercase tracking-wider opacity-70 font-semibold">{label}</div>
      <div className="text-lg font-bold leading-tight">{value}</div>
    </div>
  </div>
);

// ─── Change password ─────────────────────────────────────────────────────
const pwSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword:     z.string().min(8, 'At least 8 characters').max(64),
  confirmPassword: z.string().min(1, 'Confirm your new password'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match', path: ['confirmPassword'],
}).refine(d => d.newPassword !== d.currentPassword, {
  message: 'New password must differ from your current password', path: ['newPassword'],
});
type PwForm = z.infer<typeof pwSchema>;

function PasswordTab() {
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showCfm, setShowCfm] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PwForm>({
    resolver: zodResolver(pwSchema),
  });

  const submit = async (d: PwForm) => {
    try {
      await authApi.changePassword(d.currentPassword, d.newPassword);
      toast.success('Password changed. Other sessions have been signed out.');
      reset();
    } catch (err) {
      const e = parseApiError(err);
      toast.error(e.message || 'Could not change password');
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2">
        <div className="card p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy-700">
              <Lock className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-display font-bold text-navy-900">Change password</h3>
              <p className="text-sm text-slate-500">Other devices will be signed out automatically.</p>
            </div>
          </div>
          <form onSubmit={handleSubmit(submit)} className="space-y-4 max-w-md" noValidate>
            <Field label="Current password" required error={errors.currentPassword?.message}>
              <Input type={showCur ? 'text' : 'password'} autoComplete="current-password"
                     leftIcon={<Lock className="h-4 w-4" />}
                     rightIcon={<button type="button" className="text-slate-400 hover:text-slate-600 pointer-events-auto" onClick={() => setShowCur(s => !s)}>{showCur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
                     invalid={!!errors.currentPassword} {...register('currentPassword')} />
            </Field>
            <Field label="New password" required error={errors.newPassword?.message} hint="At least 8 characters.">
              <Input type={showNew ? 'text' : 'password'} autoComplete="new-password"
                     leftIcon={<Lock className="h-4 w-4" />}
                     rightIcon={<button type="button" className="text-slate-400 hover:text-slate-600 pointer-events-auto" onClick={() => setShowNew(s => !s)}>{showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
                     invalid={!!errors.newPassword} {...register('newPassword')} />
            </Field>
            <Field label="Confirm new password" required error={errors.confirmPassword?.message}>
              <Input type={showCfm ? 'text' : 'password'} autoComplete="new-password"
                     leftIcon={<Lock className="h-4 w-4" />}
                     rightIcon={<button type="button" className="text-slate-400 hover:text-slate-600 pointer-events-auto" onClick={() => setShowCfm(s => !s)}>{showCfm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
                     invalid={!!errors.confirmPassword} {...register('confirmPassword')} />
            </Field>
            <div className="pt-2">
              <Button type="submit" loading={isSubmitting} size="lg">Update password</Button>
            </div>
          </form>
        </div>
      </div>
      <aside className="lg:col-span-1">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-amber-800 font-semibold">
            <Shield className="h-4 w-4" /> Security tips
          </div>
          <ul className="mt-3 space-y-2 text-sm text-amber-900/90 leading-relaxed">
            <li>• Use a unique password not reused on other sites.</li>
            <li>• Mix letters, numbers, and symbols.</li>
            <li>• Don't share OTPs or passwords with anyone.</li>
            <li>• If you spot suspicious activity, sign out other sessions.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────
function SessionsTab() {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: usersApi.sessions,
  });
  const m = useMutation({
    mutationFn: usersApi.logoutOtherSessions,
    onSuccess: () => {
      toast.success('All other sessions have been signed out');
      qc.invalidateQueries({ queryKey: ['sessions'] });
      refetch();
    },
    onError: (err) => toast.error(parseApiError(err).message || 'Could not sign out sessions'),
  });

  return (
    <div className="card p-6 sm:p-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy-700">
          <Smartphone className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-display font-bold text-navy-900">Active Sessions</h3>
          <p className="text-sm text-slate-500">Number of browsers currently signed in to your account.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-5 flex items-center justify-between gap-4">
        <div>
          <div className="text-3xl font-display font-bold text-navy-900">
            {isLoading ? <span className="skeleton inline-block h-8 w-12" /> : data?.active_sessions ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">including this one</div>
        </div>
        <Button
          variant="outline"
          leftIcon={<LogOutIcon className="h-4 w-4" />}
          disabled={(data?.active_sessions ?? 0) <= 1}
          onClick={() => setConfirmOpen(true)}
        >
          Sign out other sessions
        </Button>
      </div>

      {/* Session revocation works by invalidating refresh tokens — other
          devices stop working only when their short-lived access token
          expires and they try to refresh. Worst-case lag = access-token TTL
          (~15 min). Tell the user this so they don't expect a hard cut. */}
      <InfoNote tone="info" className="mt-4">
        Other devices will be signed out within <strong>15 minutes</strong> maximum — the moment their current
        session expires and tries to renew.
      </InfoNote>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sign out other sessions?"
        description="Other browsers and devices currently signed in will be signed out. This session will remain active."
        info={
          <InfoNote tone="info">
            Other devices stop working within 15 minutes — when their current session expires.
          </InfoNote>
        }
        confirmText="Sign out others"
        loading={m.isPending}
        onConfirm={async () => {
          await m.mutateAsync();
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}
