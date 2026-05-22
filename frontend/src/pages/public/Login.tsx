import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Logo } from '@/components/ui/Logo';
import { useAuth } from '@/lib/auth/AuthContext';
import { parseApiError } from '@/lib/api/client';

const schema = z.object({
  email:    z.string().min(1, 'Email is required').email('Please enter a valid email').max(50),
  password: z.string().min(1, 'Password is required').max(64),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const [showPw, setShowPw] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: FormData) => {
    try {
      const user = await login(data.email.trim().toLowerCase(), data.password);
      toast.success(`Welcome back, ${user.full_name.split(' ')[0]}!`);
      // Always land on Practice — don't restore the previous (possibly other-user) route.
      // Full `location.replace` wipes the home/login pages out of the browser's
      // back stack so back from /practice doesn't bounce the user to the public
      // home page they passed through on the way in.
      window.location.replace('/practice');
    } catch (err) {
      const e = parseApiError(err);
      toast.error(e.message || 'Sign in failed');
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md animate-slide-up">
        <div className="card p-7 sm:p-9">
          <div className="flex justify-center mb-6">
            <Logo size={44} withWordmark={false} />
          </div>
          <div className="text-center mb-7">
            <h1 className="text-2xl font-display font-bold text-navy-900">Welcome back</h1>
            <p className="text-sm text-slate-500 mt-1.5">Sign in to continue your GATE journey</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <Field label="Email" htmlFor="email" required error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                // `username` — not `email` — is the autocomplete value that
                // tells Chrome / iCloud Keychain / 1Password "this is the
                // login identifier, pair it with the current-password field
                // below for credential storage". Using plain `email` here
                // causes browsers to mis-pair: a previously typed email from
                // the forgot-password page can end up suggested as the
                // username to save alongside the password just typed here.
                autoComplete="username"
                placeholder="you@nec.edu.in"
                leftIcon={<Mail className="h-4 w-4" />}
                invalid={!!errors.email}
                {...register('email')}
              />
            </Field>

            <Field label="Password" htmlFor="password" required error={errors.password?.message}>
              <Input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <button type="button" onClick={() => setShowPw(s => !s)} className="text-slate-400 hover:text-slate-600 pointer-events-auto" aria-label={showPw ? 'Hide password' : 'Show password'}>
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                invalid={!!errors.password}
                {...register('password')}
              />
            </Field>

            <div className="flex justify-end">
              <Link to="/forgot-password" className="text-xs font-semibold text-navy-700 hover:text-amber-600 transition-colors">
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              loading={isSubmitting}
              rightIcon={!isSubmitting ? <ArrowRight className="h-4 w-4" /> : undefined}
            >
              Sign in
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs text-slate-500">
            New to NEC GATE Portal? Contact your department admin to get an account.
          </div>
        </div>
        <p className="text-center text-xs text-slate-400 mt-5">
          By signing in, you agree to follow NEC's academic integrity guidelines.
        </p>
      </div>
    </div>
  );
}
