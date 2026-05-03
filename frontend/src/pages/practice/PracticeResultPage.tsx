import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Trophy, Frown, ArrowLeft, RefreshCw,
  CheckCircle2, XCircle, MinusCircle, Award, Eye,
} from 'lucide-react';

import { PageContainer } from '@/components/ui/PageContainer';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';

import { useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/cn';

import type { PracticeSubmitResponse } from '@/lib/api/practice';

export default function PracticeResultPage() {
  const { subjectId, topicId, level, setId } = useParams<{
    subjectId: string; topicId: string; level: string; setId: string;
  }>();
  const subjId = Number(subjectId);
  const topId  = Number(topicId);
  const lvl    = (level === '2' ? '2' : '1') as '1' | '2';
  const sid    = Number(setId);

  const { state } = useLocation();
  const navigate = useNavigate();
  const payload = state as (PracticeSubmitResponse | null);
  const { user } = useAuth();

  // Refresh student stats in the header so the new practice_score reflects
  const { refreshMe } = useAuth();
  useEffect(() => { refreshMe().catch(() => {}); /* eslint-disable-line */ }, []);

  if (!payload?.result) {
    return <Navigate to={`/practice/subjects/${subjId}/topics/${topId}/levels/${lvl}/sets`} replace />;
  }

  const r = payload.result;
  const passed = r.passed;
  const isStudent = user?.role === 'Student';

  const setsHref = `/practice/subjects/${subjId}/topics/${topId}/levels/${lvl}/sets`;
  const tryAgainHref = `/practice/subjects/${subjId}/topics/${topId}/levels/${lvl}/sets/${sid}/attempt`;

  return (
    <PageContainer>
      <Breadcrumbs items={[
        { label: 'Practice', to: '/practice' },
        { label: 'Sets', to: setsHref },
        { label: 'Result' },
      ]} className="mb-5" />

      {/* ─── Hero result card ──────────────────────────────────────── */}
      <div className={cn(
        'card p-6 sm:p-10 mb-5 relative overflow-hidden',
        passed ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40',
      )}>
        <div
          className={cn('absolute -top-16 -right-16 h-56 w-56 rounded-full opacity-30', passed ? 'bg-emerald-300' : 'bg-amber-300')}
          aria-hidden
        />
        <div className="relative grid sm:grid-cols-[auto_1fr] gap-5 items-center">
          <div className={cn(
            'grid h-20 w-20 place-items-center rounded-2xl shrink-0',
            passed ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-navy-900',
          )}>
            {passed ? <Trophy className="h-9 w-9" /> : <Frown className="h-9 w-9" />}
          </div>
          <div>
            <h1 className={cn(
              'text-3xl sm:text-4xl font-display font-extrabold tracking-tight',
              passed ? 'text-emerald-700' : 'text-amber-700',
            )}>
              {passed ? 'Passed!' : 'Not yet passed'}
            </h1>
            <p className="text-slate-600 mt-1.5">
              You scored <span className="font-bold text-navy-900">{Number(r.total_score).toFixed(2)} / {r.total_marks}</span>
              <span className="text-slate-400"> · </span>
              <span className="font-semibold">{Number(r.attained_percentage).toFixed(2)}%</span>
            </p>
            <p className="text-sm mt-1 text-slate-500">
              Threshold: <span className="font-semibold">{r.threshold_percentage}%</span>
              {/* Only students get the gamified "next set unlocked" line — for
                  non-students this is a review run, no unlock semantics. */}
              {isStudent && (passed
                ? <> · next set unlocked.</>
                : <> · try again to clear it — failed attempts don't affect your score.</>)}
            </p>
          </div>
        </div>

        {(() => {
          const totalQ = (state as any)?.total_questions
            ?? payload.per_question?.length
            ?? Math.max(0, (r.correct_count ?? 0) + (r.wrong_count ?? 0));
          const skipped = Math.max(0, totalQ - (r.correct_count ?? 0) - (r.wrong_count ?? 0));
          return (
            <div className="relative mt-6 grid sm:grid-cols-4 gap-3">
              <Stat icon={<Award className="h-4 w-4" />}        tone="navy"  label="Total"    value={`${Number(r.total_score).toFixed(2)} / ${r.total_marks}`} />
              <Stat icon={<CheckCircle2 className="h-4 w-4" />} tone="green" label="Correct"  value={r.correct_count} />
              <Stat icon={<XCircle className="h-4 w-4" />}      tone="red"   label="Wrong"    value={r.wrong_count} />
              <Stat icon={<MinusCircle className="h-4 w-4" />}  tone="slate" label="Skipped"  value={skipped} />
            </div>
          );
        })()}

        <div className="relative mt-6 flex flex-wrap items-center gap-2">
          {/* Both navigations REPLACE the result page in history so the
              browser-back button doesn't bring it back after the user moved on. */}
          <Button
            variant="outline"
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => navigate(setsHref, { replace: true })}
          >
            Back to sets
          </Button>
          <Button
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => navigate(tryAgainHref, { replace: true })}
          >
            {passed ? 'Practice again' : 'Try again'}
          </Button>
        </div>
      </div>

      {/* ─── Per-question review (non-student only) ────────────────── */}
      {!isStudent && payload.per_question?.length ? (
        <div className="card p-5 sm:p-7">
          <header className="flex items-center gap-2 mb-4">
            <Eye className="h-4 w-4 text-amber-500" />
            <h2 className="font-display font-bold text-navy-900">Per-question review</h2>
            <Badge tone="amber" size="sm">Not visible to students</Badge>
          </header>
          <ul className="space-y-3">
            {payload.per_question.map((q, i) => (
              <li key={q.question_id} className={cn(
                'rounded-xl border px-4 py-3',
                q.is_correct ? 'border-emerald-200 bg-emerald-50/40' :
                q.is_attempted ? 'border-red-200 bg-red-50/30' :
                                 'border-slate-200 bg-slate-50',
              )}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-navy-800 text-white text-xs font-bold">
                      {i + 1}
                    </span>
                    <Badge tone={q.question_type === 'MCQ' ? 'sky' : q.question_type === 'MSQ' ? 'violet' : 'amber'}>
                      {q.question_type}
                    </Badge>
                    <Badge tone="slate" size="sm">{q.marks}m</Badge>
                    {q.is_correct
                      ? <Badge tone="green" size="sm" icon={<CheckCircle2 className="h-3 w-3" />}>Correct</Badge>
                      : q.is_attempted
                        ? <Badge tone="red" size="sm" icon={<XCircle className="h-3 w-3" />}>Wrong</Badge>
                        : <Badge tone="slate" size="sm" icon={<MinusCircle className="h-3 w-3" />}>Not attempted</Badge>}
                  </div>
                  <span className={cn(
                    'text-sm font-bold font-mono',
                    q.score_delta > 0 ? 'text-emerald-700' :
                    q.score_delta < 0 ? 'text-red-700' : 'text-slate-500',
                  )}>
                    {q.score_delta > 0 ? '+' : ''}{q.score_delta}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{q.question_text}</p>

                {/* Options for MCQ/MSQ — highlight correct in green and the
                    student's pick (when wrong) in red. NAT skips this block. */}
                {q.question_type !== 'NAT' && (q.option_a || q.option_b || q.option_c || q.option_d) && (
                  <div className="mt-2 grid sm:grid-cols-2 gap-1.5 text-xs">
                    {(['a', 'b', 'c', 'd'] as const).map(L => {
                      const text = (q as any)[`option_${L}`] as string | null;
                      if (!text) return null;
                      const correctSet = new Set(((q.correct_answer ?? '') as string).toLowerCase().split(''));
                      const studentSet = new Set(((q.student_answer ?? '') as string).toLowerCase().split(''));
                      const isCorrect = correctSet.has(L);
                      const isPicked  = studentSet.has(L);
                      return (
                        <div
                          key={L}
                          className={cn(
                            'rounded-lg border px-3 py-1.5 flex items-start gap-2',
                            isCorrect ? 'bg-emerald-50 border-emerald-200' :
                            isPicked  ? 'bg-red-50 border-red-200' :
                                        'bg-white border-slate-200',
                          )}
                        >
                          <span className={cn(
                            'grid h-5 w-5 place-items-center rounded-full text-[0.65rem] font-bold shrink-0 mt-0.5',
                            isCorrect ? 'bg-emerald-500 text-white' :
                            isPicked  ? 'bg-red-500 text-white' :
                                        'bg-slate-100 text-slate-600',
                          )}>
                            {L.toUpperCase()}
                          </span>
                          <span className={cn(
                            'flex-1',
                            isCorrect ? 'text-emerald-900 font-medium' :
                            isPicked  ? 'text-red-900' : 'text-slate-700',
                          )}>{text}</span>
                          {isCorrect && <span className="text-[0.65rem] text-emerald-700 font-semibold">correct</span>}
                          {!isCorrect && isPicked && <span className="text-[0.65rem] text-red-700 font-semibold">picked</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-2 grid sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                    <div className="text-[0.65rem] uppercase tracking-wider text-slate-500 font-semibold">Student answer</div>
                    <div className="font-mono text-slate-800">{q.student_answer ?? '—'}</div>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                    <div className="text-[0.65rem] uppercase tracking-wider text-emerald-600 font-semibold">Correct answer</div>
                    <div className="font-mono text-emerald-800">{q.correct_answer}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

    </PageContainer>
  );
}

const toneStat: Record<string, string> = {
  navy:  'bg-navy-50 text-navy-800 border-navy-100',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  red:   'bg-red-50 text-red-700 border-red-100',
  slate: 'bg-slate-50 text-slate-700 border-slate-200',
};
function Stat({ label, value, icon, tone }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone: keyof typeof toneStat }) {
  return (
    <div className={cn('rounded-xl border px-4 py-3 flex items-center gap-3', toneStat[tone])}>
      <span className="opacity-80">{icon}</span>
      <div>
        <div className="text-[0.65rem] uppercase tracking-wider opacity-70 font-semibold">{label}</div>
        <div className="text-lg font-bold leading-tight">{value}</div>
      </div>
    </div>
  );
}
