import { useQuery } from '@tanstack/react-query';
import {
  GraduationCap, Mail, Building2, Calendar,
  Target, ClipboardList, BookMarked, Layers,
  CheckCircle2, XCircle, Hash, User as UserIcon,
} from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { progressApi } from '@/lib/api/progress';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

interface Props {
  studentId: number | null;
  onOpenChange: (o: boolean) => void;
}

export const StudentDetailDialog = ({ studentId, onOpenChange }: Props) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-detail', studentId],
    queryFn: () => progressApi.detail(studentId!),
    enabled: studentId != null,
  });

  return (
    <Dialog open={studentId != null} onOpenChange={onOpenChange}
            title="Student progress" size="xl">
      {isLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>}
      {error && <div className="text-sm text-red-600">Could not load. You may not have access to this student.</div>}
      {data && (
        <div className="space-y-5">
          {/* General */}
          <section className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-navy-800 text-white text-xl font-bold shrink-0">
              {(data.general.full_name?.[0] ?? '?').toUpperCase()}
            </div>
            <div>
              <h2 className="font-display font-bold text-navy-900 text-lg">{data.general.full_name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="navy" icon={<Hash className="h-3 w-3" />}>{data.general.reg_num}</Badge>
                <Badge tone="slate" icon={<Mail className="h-3 w-3" />}>{data.general.email}</Badge>
                {data.general.dept_code && <Badge tone="amber" icon={<Building2 className="h-3 w-3" />}>{data.general.dept_code}</Badge>}
                {data.general.batch_year && <Badge tone="green" icon={<Calendar className="h-3 w-3" />}>{data.general.batch_year}</Badge>}
              </div>
              <div className="mt-2 text-xs text-slate-500 inline-flex items-center gap-1.5">
                <UserIcon className="h-3 w-3" />
                Tutor: <span className="font-semibold text-navy-700">
                  {data.general.tutor_name ?? 'Not assigned'}
                  {data.general.tutor_dept ? ` · ${data.general.tutor_dept}` : ''}
                </span>
              </div>
            </div>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Stat tone="amber"  icon={<Target className="h-3 w-3" />}        label="Practice"      value={data.general.practice_score} />
            <Stat tone="navy"   icon={<ClipboardList className="h-3 w-3" />} label="Tests"         value={data.general.test_score} />
            <Stat tone="sky"    icon={<Layers className="h-3 w-3" />}        label="Lev 1 sets"    value={data.general.lev_1_completed} />
            <Stat tone="violet" icon={<Layers className="h-3 w-3" />}        label="Lev 2 sets"    value={data.general.lev_2_completed} />
            <Stat tone="green"  icon={<BookMarked className="h-3 w-3" />}    label="Topics done"   value={data.general.topics_completed} />
          </section>

          {/* Top subjects */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
              Top practice subjects (last 2 months)
            </h3>
            {data.top_subjects.length === 0 ? (
              <p className="text-sm text-slate-500">No recent practice in the last 2 months.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.top_subjects.map(s => (
                  <Badge key={s.subject_id} tone="navy" size="md">
                    <GraduationCap className="h-3 w-3" />
                    {s.subject_name}
                  </Badge>
                ))}
              </div>
            )}
          </section>

          {/* History */}
          <section>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Recent attempts (latest 10)</h3>
            {data.history.length === 0 ? (
              <p className="text-sm text-slate-500">No attempts yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.history.map((h, i) => (
                  <li key={i} className={cn(
                    'rounded-xl border px-3 py-2 text-sm',
                    h.status === 'Passed' ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40',
                  )}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-navy-900 truncate">
                          {h.subject_name} <span className="text-slate-400">·</span> {h.topic_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          Set {h.set_name} · Level {h.level} · {formatDateTime(h.date)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-bold text-navy-900">{Number(h.score).toFixed(2)}</span>
                        {h.status === 'Passed'
                          ? <Badge tone="green" size="sm" icon={<CheckCircle2 className="h-3 w-3" />}>Passed</Badge>
                          : <Badge tone="red"   size="sm" icon={<XCircle      className="h-3 w-3" />}>Failed</Badge>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
};

const toneStat: Record<string, string> = {
  amber:  'bg-amber-50 text-amber-800 border-amber-100',
  navy:   'bg-navy-50 text-navy-800 border-navy-100',
  sky:    'bg-sky-50 text-sky-700 border-sky-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
  green:  'bg-emerald-50 text-emerald-700 border-emerald-100',
};
function Stat({ tone, label, value, icon }: { tone: keyof typeof toneStat; label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl border px-3 py-2', toneStat[tone])}>
      <div className="text-[0.65rem] uppercase tracking-wider opacity-70 font-semibold flex items-center gap-1">{icon}{label}</div>
      <div className="text-lg font-bold leading-tight mt-0.5">{value}</div>
    </div>
  );
}
