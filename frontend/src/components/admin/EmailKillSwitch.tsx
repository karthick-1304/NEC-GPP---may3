import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  MailX, MailCheck, AlertTriangle, Hourglass, Power, RefreshCw, ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { adminApi, type EmailStatus } from '@/lib/api/admin';
import { parseApiError } from '@/lib/api/client';
import { formatDateTime, formatSecondsHHMMSS } from '@/lib/format';
import { cn } from '@/lib/cn';

const PRESETS: Array<{ label: string; hours: number | null }> = [
  { label: '1 hour',   hours: 1 },
  { label: '2 hours',  hours: 2 },
  { label: '6 hours',  hours: 6 },
  { label: '24 hours', hours: 24 },
  { label: '2 days',   hours: 48 },
  { label: 'Custom',   hours: -1 },        // sentinel — show input
  { label: 'Indefinite', hours: null },    // null → indefinite
];

export const EmailKillSwitch = () => {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['email-status'],
    queryFn: adminApi.getEmailStatus,
    refetchInterval: 60_000,
  });

  const [picked, setPicked] = useState<typeof PRESETS[number] | null>(null);
  const [customHours, setCustomHours] = useState<string>('4');
  const [reason, setReason] = useState('');
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmEnable,  setConfirmEnable]  = useState(false);

  // Live countdown for the banner — tick every second when active + timed
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!data?.active || data.indefinite) return;
    const t = setInterval(() => setTick(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [data?.active, data?.indefinite]);

  const remainingSec = (() => {
    if (!data?.active || data.indefinite || !data.disabledUntil) return null;
    const ms = new Date(data.disabledUntil).getTime() - Date.now();
    return Math.max(0, Math.floor(ms / 1000));
  })();

  const setMut = useMutation({
    mutationFn: adminApi.setEmailStatus,
    onSuccess: () => {
      toast.success('Email status updated');
      qc.invalidateQueries({ queryKey: ['email-status'] });
      refetch();
      setConfirmDisable(false);
      setConfirmEnable(false);
      setPicked(null);
      setReason('');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const trigger = () => {
    if (!picked) {
      toast.error('Pick a duration first.');
      return;
    }
    if (picked.hours === -1) {
      const h = Number(customHours);
      if (!Number.isFinite(h) || h <= 0) {
        toast.error('Enter a positive hour count.');
        return;
      }
      setMut.mutate({ action: 'disable', durationHours: h, reason: reason.trim() || undefined });
    } else if (picked.hours === null) {
      setMut.mutate({ action: 'disable', indefinite: true, reason: reason.trim() || undefined });
    } else {
      setMut.mutate({ action: 'disable', durationHours: picked.hours, reason: reason.trim() || undefined });
    }
  };

  return (
    <div className="space-y-5">
      {/* Banner */}
      {data?.active ? <ActiveBanner data={data} secondsLeft={remainingSec} onResume={() => setConfirmEnable(true)} loading={setMut.isPending} /> : <IdleBanner />}

      <div className="card p-5 sm:p-7">
        <div className="flex items-start gap-3 mb-5">
          <span className={cn(
            'grid h-11 w-11 place-items-center rounded-xl',
            data?.active ? 'bg-amber-100 text-amber-700' : 'bg-navy-50 text-navy-700',
          )}>
            <MailX className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-display font-bold text-navy-900">Email kill switch</h3>
            <p className="text-sm text-slate-500 leading-relaxed mt-0.5 max-w-2xl">
              Use during system bring-up or yearly maintenance to silence routine
              management emails (subjects, topics, sets, tests, user actions).
              Authentication-critical emails (OTPs, password changes, welcome credentials,
              subject join requests) are <strong>always</strong> sent regardless of this switch.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="skeleton h-32" />
        ) : (
          <>
            {/* Duration presets */}
            <Field label="Suppress duration" hint="How long management emails should stay silenced.">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setPicked(p)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl border px-3 h-10 text-sm font-semibold transition-colors',
                      picked?.label === p.label
                        ? 'border-amber-400 bg-amber-50 text-amber-800 ring-2 ring-amber-200'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    {p.hours === null && <ShieldCheck className="h-3.5 w-3.5" />}
                    {p.hours === -1   && <Hourglass    className="h-3.5 w-3.5" />}
                    {p.hours !== null && p.hours !== -1 && <Hourglass className="h-3.5 w-3.5" />}
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>

            {picked?.hours === -1 && (
              <Field label="Custom hours" required hint="Up to 720 (30 days).">
                <Input
                  type="number" min={1} max={720} value={customHours}
                  onChange={(e) => setCustomHours(e.target.value)}
                  className="!max-w-xs"
                />
              </Field>
            )}

            <Field label="Reason (optional)" hint="Stored in audit logs.">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Yearly student-list reset" />
            </Field>

            <div className="mt-5 flex flex-wrap gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                onClick={() => refetch()}
              >
                Refresh status
              </Button>
              <Button
                type="button"
                variant="danger"
                leftIcon={<Power className="h-4 w-4" />}
                disabled={!picked || data?.active}
                onClick={() => setConfirmDisable(true)}
              >
                Turn email system OFF
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Confirms */}
      <ConfirmDialog
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        title="Silence non-mandatory emails?"
        description={
          <>
            <p>Management emails (subjects/topics/sets/tests/user actions) will be skipped server-side.</p>
            <p className="mt-2 text-xs text-slate-500">
              These will still be sent: forgot-password OTPs, password-changed alerts, welcome emails with credentials, subject join requests.
            </p>
          </>
        }
        confirmText={picked?.hours === null ? 'Disable indefinitely' : `Disable for ${picked?.label ?? '—'}`}
        destructive
        loading={setMut.isPending}
        onConfirm={trigger}
      />
      <ConfirmDialog
        open={confirmEnable}
        onOpenChange={setConfirmEnable}
        title="Resume email system now?"
        description="Routine management emails will start flowing again immediately."
        confirmText="Resume"
        loading={setMut.isPending}
        onConfirm={() => setMut.mutate({ action: 'enable' })}
      />
    </div>
  );
};

// ─── Banners ────────────────────────────────────────────────────────────
function IdleBanner() {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 sm:px-5 py-3 flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500 text-white shrink-0">
        <MailCheck className="h-4 w-4" />
      </span>
      <div>
        <div className="text-sm font-semibold text-emerald-800">Email system is ON</div>
        <div className="text-xs text-emerald-700/80">All management notifications are flowing normally.</div>
      </div>
    </div>
  );
}

function ActiveBanner({
  data, secondsLeft, onResume, loading,
}: { data: EmailStatus; secondsLeft: number | null; onResume: () => void; loading: boolean }) {
  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-white shrink-0">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-amber-800">
          Email system is OFF — management emails are being suppressed.
        </div>
        <div className="text-xs text-amber-800/80 flex items-center gap-2 flex-wrap mt-0.5">
          {data.indefinite ? (
            <span><strong>Indefinite</strong> — until manually re-enabled.</span>
          ) : secondsLeft != null ? (
            <span>Resumes in <strong className="font-mono">{formatSecondsHHMMSS(secondsLeft)}</strong>
              {data.disabledUntil ? ` · at ${formatDateTime(data.disabledUntil)}` : ''}
            </span>
          ) : null}
          {data.meta?.reason && <span className="text-amber-700/80">· {data.meta.reason}</span>}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        leftIcon={<MailCheck className="h-3.5 w-3.5" />}
        loading={loading}
        onClick={onResume}
      >
        Resume now
      </Button>
    </div>
  );
}
