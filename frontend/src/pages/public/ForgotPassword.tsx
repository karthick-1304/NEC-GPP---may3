import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, KeyRound, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Logo } from '@/components/ui/Logo';
import { authApi } from '@/lib/api/auth';
import { parseApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';

type Step = 'email' | 'otp' | 'reset' | 'done';

// ─── Per-step schemas ────────────────────────────────────────────────────
const emailSchema = z.object({ email: z.string().min(1, 'Email is required').email().max(50) });
const otpSchema   = z.object({ otp: z.string().min(1).regex(/^\d+$/, 'OTP must be digits only').length(6, 'OTP must be 6 digits') });
const resetSchema = z.object({
  newPassword:     z.string().min(8, 'At least 8 characters').max(64),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match', path: ['confirmPassword'],
});

type EmailForm = z.infer<typeof emailSchema>;
type OtpForm   = z.infer<typeof otpSchema>;
type ResetForm = z.infer<typeof resetSchema>;

const steps: Array<{ id: Step; label: string; icon: any }> = [
  { id: 'email', label: 'Email',    icon: Mail },
  { id: 'otp',   label: 'Verify',   icon: ShieldCheck },
  { id: 'reset', label: 'Reset',    icon: KeyRound },
];

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);

  const idx = step === 'done' ? 3 : steps.findIndex(s => s.id === step);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-slide-up">
        <div className="card p-7 sm:p-9">
          <div className="flex justify-center mb-5"><Logo size={40} withWordmark={false} /></div>

          {/* ─── Progress steps ─────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-7 px-1">
            {steps.map((s, i) => {
              const active = i === idx;
              const done = i < idx;
              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-initial">
                  <div className={cn(
                    'h-8 w-8 rounded-full grid place-items-center text-xs font-bold transition-colors shrink-0',
                    done   && 'bg-emerald-500 text-white',
                    active && 'bg-amber-400 text-navy-900 ring-4 ring-amber-100',
                    !done && !active && 'bg-slate-100 text-slate-400',
                  )}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : <s.icon className="h-3.5 w-3.5" />}
                  </div>
                  {i < steps.length - 1 && (
                    <div className={cn('h-0.5 flex-1 mx-2 transition-colors', i < idx ? 'bg-emerald-400' : 'bg-slate-200')} />
                  )}
                </div>
              );
            })}
          </div>

          {step === 'email' && (
            <EmailStep
              onDone={(value) => { setEmail(value); setStep('otp'); }}
            />
          )}
          {step === 'otp' && (
            <OtpStep
              email={email}
              onBack={() => setStep('email')}
              onDone={(o) => { setOtp(o); setStep('reset'); }}
            />
          )}
          {step === 'reset' && (
            <ResetStep
              email={email} otp={otp}
              showPw={showPw} setShowPw={setShowPw}
              showCpw={showCpw} setShowCpw={setShowCpw}
              onDone={() => setStep('done')}
            />
          )}
          {step === 'done' && (
            <div className="text-center py-4 animate-fade-in">
              <div className="grid h-14 w-14 mx-auto place-items-center rounded-full bg-emerald-100 text-emerald-600 mb-4">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-display font-bold text-navy-900">Password reset</h2>
              <p className="text-sm text-slate-600 mt-2">You can sign in with your new password now.</p>
              <Button
                size="lg"
                className="w-full mt-6"
                onClick={() => navigate('/login', { replace: true })}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Go to sign in
              </Button>
            </div>
          )}

          {step !== 'done' && (
            <div className="mt-6 pt-5 border-t border-slate-100 text-center">
              <Link to="/login" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-navy-700 transition-colors">
                <ArrowLeft className="h-3 w-3" />
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1 ──────────────────────────────────────────────────────────────
function EmailStep({ onDone }: { onDone: (email: string) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
  });

  const submit = async (d: EmailForm) => {
    try {
      const email = d.email.trim().toLowerCase();
      await authApi.forgotPassword(email);
      toast.success('If that email is registered, an OTP has been sent.');
      onDone(email);
    } catch (err) {
      const e = parseApiError(err);
      toast.error(e.message || 'Could not send OTP');
    }
  };

  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-xl font-display font-bold text-navy-900">Reset your password</h1>
        <p className="text-sm text-slate-500 mt-1.5">We'll send a 6-digit OTP to your registered email.</p>
      </div>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="fp-email" required error={errors.email?.message}>
          <Input id="fp-email" type="email" autoComplete="email" placeholder="you@nec.edu.in"
                 leftIcon={<Mail className="h-4 w-4" />} invalid={!!errors.email} {...register('email')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}
                rightIcon={!isSubmitting ? <ArrowRight className="h-4 w-4" /> : undefined}>
          Send OTP
        </Button>
      </form>
    </>
  );
}

// ─── Step 2 ──────────────────────────────────────────────────────────────
function OtpStep({ email, onBack, onDone }: { email: string; onBack: () => void; onDone: (otp: string) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
  });

  const submit = async (d: OtpForm) => {
    try {
      await authApi.verifyOtp(email, d.otp);
      toast.success('OTP verified');
      onDone(d.otp);
    } catch (err) {
      const e = parseApiError(err);
      toast.error(e.message || 'Invalid OTP');
    }
  };

  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-xl font-display font-bold text-navy-900">Enter verification code</h1>
        <p className="text-sm text-slate-500 mt-1.5">Sent to <span className="font-semibold text-navy-800">{email}</span></p>
      </div>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field label="6-digit OTP" htmlFor="fp-otp" required error={errors.otp?.message}>
          <Input id="fp-otp" inputMode="numeric" maxLength={6} placeholder="••••••"
                 leftIcon={<ShieldCheck className="h-4 w-4" />}
                 className="tracking-[0.5em] text-center font-mono text-lg"
                 invalid={!!errors.otp} {...register('otp')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}
                rightIcon={!isSubmitting ? <ArrowRight className="h-4 w-4" /> : undefined}>
          Verify OTP
        </Button>
        <button type="button" onClick={onBack}
                className="block w-full text-center text-xs font-semibold text-slate-500 hover:text-navy-700 mt-1">
          Use a different email
        </button>
      </form>
    </>
  );
}

// ─── Step 3 ──────────────────────────────────────────────────────────────
function ResetStep({ email, otp, showPw, setShowPw, showCpw, setShowCpw, onDone }: {
  email: string; otp: string;
  showPw: boolean; setShowPw: (b: boolean) => void;
  showCpw: boolean; setShowCpw: (b: boolean) => void;
  onDone: () => void;
}) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  });

  const submit = async (d: ResetForm) => {
    try {
      await authApi.resetPassword(email, otp, d.newPassword);
      toast.success('Password reset successfully');
      onDone();
    } catch (err) {
      const e = parseApiError(err);
      toast.error(e.message || 'Could not reset password');
    }
  };

  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-xl font-display font-bold text-navy-900">Set a new password</h1>
        <p className="text-sm text-slate-500 mt-1.5">Make it strong — at least 8 characters.</p>
      </div>
      <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <Field label="New password" htmlFor="fp-pw" required error={errors.newPassword?.message}>
          <Input id="fp-pw" type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters"
                 leftIcon={<Lock className="h-4 w-4" />}
                 rightIcon={
                   <button type="button" onClick={() => setShowPw(!showPw)} className="text-slate-400 hover:text-slate-600 pointer-events-auto" aria-label="Toggle password visibility">
                     {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                   </button>
                 }
                 invalid={!!errors.newPassword} {...register('newPassword')} />
        </Field>
        <Field label="Confirm password" htmlFor="fp-cpw" required error={errors.confirmPassword?.message}>
          <Input id="fp-cpw" type={showCpw ? 'text' : 'password'} autoComplete="new-password" placeholder="Re-enter new password"
                 leftIcon={<Lock className="h-4 w-4" />}
                 rightIcon={
                   <button type="button" onClick={() => setShowCpw(!showCpw)} className="text-slate-400 hover:text-slate-600 pointer-events-auto" aria-label="Toggle confirm password visibility">
                     {showCpw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                   </button>
                 }
                 invalid={!!errors.confirmPassword} {...register('confirmPassword')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}
                rightIcon={!isSubmitting ? <ArrowRight className="h-4 w-4" /> : undefined}>
          Reset password
        </Button>
      </form>
    </>
  );
}
