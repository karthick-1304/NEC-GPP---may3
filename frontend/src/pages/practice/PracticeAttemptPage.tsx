import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, Clock, Maximize2, ArrowLeft, ArrowRight,
  CheckCircle2, ListChecks, Send, Flag, Eye,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

import { practiceApi } from '@/lib/api/practice';
import { topicsApi } from '@/lib/api/topics';
import { subjectsApi } from '@/lib/api/subjects';
import { parseApiError } from '@/lib/api/client';
import { formatSecondsHHMMSS } from '@/lib/format';
import { cn } from '@/lib/cn';

import { QuestionPalette, type PaletteEntry } from '@/components/practice/QuestionPalette';
import { QuestionRenderer } from '@/components/practice/QuestionRenderer';

import { useFullscreen } from '@/hooks/useFullscreen';
import { useMalpracticeWatcher } from '@/hooks/useMalpracticeWatcher';

interface AnswerState {
  answer: string | null;
  visited: boolean;
  flagged: boolean;
}

type Phase = 'intro' | 'attempt' | 'wiped' | 'submitted';

export default function PracticeAttemptPage() {
  const { subjectId, topicId, setId } = useParams<{ subjectId: string; topicId: string; setId: string }>();
  const subjId = Number(subjectId);
  const topId  = Number(topicId);
  const sid    = Number(setId);
  const navigate = useNavigate();

  const rootRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, request: enterFs } = useFullscreen(rootRef);

  const [phase, setPhase] = useState<Phase>('intro');
  const [showFsNotice, setShowFsNotice] = useState(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);

  // ─── Data ─────────────────────────────────────────────────────────────
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['practice-questions', subjId, topId, sid],
    queryFn: () => practiceApi.questions(subjId, topId, sid),
    enabled: Number.isFinite(sid),
    staleTime: Infinity, // shouldn't refetch mid-attempt
  });
  const questions = data?.shuffled ?? [];
  const set = data?.set;

  // Context for the header — Subject + Topic names. Cached, so re-entering
  // the same attempt is instant.
  const { data: subject } = useQuery({
    queryKey: ['subject', subjId],
    queryFn: () => subjectsApi.get(subjId),
    enabled: Number.isFinite(subjId),
    staleTime: 5 * 60_000,
  });
  const { data: topicLevels } = useQuery({
    queryKey: ['topic-levels', subjId, topId],
    queryFn: () => topicsApi.levels(subjId, topId),
    enabled: Number.isFinite(subjId) && Number.isFinite(topId),
    staleTime: 5 * 60_000,
  });

  // ─── Per-question state ──────────────────────────────────────────────
  const [answers, setAnswers] = useState<Map<number, AnswerState>>(new Map());
  const [currentIdx, setCurrentIdx] = useState(0);

  // Initialise answers map once questions arrive, mark first as visited
  useEffect(() => {
    if (!questions.length || answers.size > 0) return;
    const m = new Map<number, AnswerState>();
    questions.forEach((q, i) => {
      m.set(q.question_id, { answer: null, visited: i === 0, flagged: false });
    });
    setAnswers(m);
  }, [questions, answers.size]);

  // Mark current question visited when navigating to it
  useEffect(() => {
    if (!questions.length) return;
    const q = questions[currentIdx];
    if (!q) return;
    setAnswers(prev => {
      const cur = prev.get(q.question_id);
      if (!cur || cur.visited) return prev;
      const next = new Map(prev);
      next.set(q.question_id, { ...cur, visited: true });
      return next;
    });
  }, [currentIdx, questions]);

  // ─── Timer ───────────────────────────────────────────────────────────
  const totalSeconds = (set?.timer_minutes ?? 30) * 60;
  const [secondsLeft, setSecondsLeft] = useState<number>(totalSeconds);
  useEffect(() => { setSecondsLeft(totalSeconds); }, [totalSeconds]);

  const fired = useRef<{ five: boolean; two: boolean; one: boolean }>({ five: false, two: false, one: false });
  useEffect(() => {
    if (phase !== 'attempt') return;
    const t = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // ─── Submit mutation ─────────────────────────────────────────────────
  const submitMut = useMutation({
    mutationFn: (autoSubmit: boolean) => {
      const list = questions.map(q => ({
        question_id: q.question_id,
        answer: answers.get(q.question_id)?.answer ?? null,
      }));
      return practiceApi.submit(subjId, topId, sid, list).then((r) => ({ ...r, autoSubmit }));
    },
    onSuccess: (r) => {
      toast.success(r.autoSubmit
        ? 'Time up — your attempt was auto-submitted.'
        : (r.result.passed ? 'Attempt submitted — Passed!' : 'Attempt submitted'));
      setPhase('submitted');
      navigate(
        `/practice/subjects/${subjId}/topics/${topId}/levels/${set?.level ?? '1'}/sets/${sid}/result`,
        { state: { ...r, total_questions: questions.length }, replace: true },
      );
    },
    onError: (e) => toast.error(parseApiError(e).message || 'Could not submit your attempt'),
  });

  // Auto-submit at 0
  useEffect(() => {
    if (phase !== 'attempt') return;
    if (secondsLeft <= 0 && !submitMut.isPending) {
      submitMut.mutate(true);
    } else {
      // Time warnings
      if (secondsLeft <= 300 && !fired.current.five) { fired.current.five = true; toast.warning('5 minutes remaining'); }
      if (secondsLeft <= 120 && !fired.current.two)  { fired.current.two  = true; toast.warning('2 minutes remaining'); }
      if (secondsLeft <= 60  && !fired.current.one)  { fired.current.one  = true; toast.warning('1 minute remaining', { duration: 6000 }); }
    }
  }, [secondsLeft, phase, submitMut]);

  // ─── Malpractice watcher ─────────────────────────────────────────────
  // Armed during 'attempt' AND while the "Return to fullscreen" notice is
  // showing (showFsNotice). Otherwise a tab-switch from inside the notice
  // would not wipe — but the user is still effectively inside an attempt.
  const onWipe = useCallback(() => {
    // We're "inside the attempt" while phase === 'attempt' (covers both
    // fullscreen mode and the soft-notice mode — `showFsNotice` doesn't
    // change phase).
    if (phase === 'attempt') setPhase('wiped');
  }, [phase]);
  useMalpracticeWatcher({
    enabled: phase === 'attempt',
    onWipe,
    onLeftFullscreen: () => { /* handled by the isFullscreen effect below */ },
  });

  // Single source of truth: while attempting, if we're not fullscreen, show
  // the soft notice. As soon as fullscreen returns, dismiss it.
  useEffect(() => {
    if (phase !== 'attempt') return;
    setShowFsNotice(!isFullscreen);
  }, [phase, isFullscreen]);

  // ─── Start attempt: enter fullscreen first ───────────────────────────
  const beginAttempt = async () => {
    await enterFs();
    setPhase('attempt');
  };

  // ─── Palette + counts ────────────────────────────────────────────────
  const palette: PaletteEntry[] = useMemo(() => questions.map((q, i) => {
    const a = answers.get(q.question_id);
    const status: PaletteEntry['status'] =
      a?.answer && a.answer !== '' ? 'answered'
      : a?.visited ? 'visited' : 'unvisited';
    return { index: i + 1, status, flagged: !!a?.flagged, current: i === currentIdx };
  }), [questions, answers, currentIdx]);

  const counts = useMemo(() => {
    let answered = 0, visited = 0, flagged = 0;
    palette.forEach(p => {
      if (p.status === 'answered') answered++;
      else if (p.status === 'visited') visited++;
      if (p.flagged) flagged++;
    });
    return { answered, visited, flagged, unvisited: palette.length - answered - visited };
  }, [palette]);

  const setAnswerFor = (qid: number, answer: string | null) =>
    setAnswers(prev => {
      const cur = prev.get(qid);
      const next = new Map(prev);
      next.set(qid, { answer, visited: true, flagged: !!cur?.flagged });
      return next;
    });
  const toggleFlagFor = (qid: number) =>
    setAnswers(prev => {
      const cur = prev.get(qid);
      const next = new Map(prev);
      next.set(qid, { answer: cur?.answer ?? null, visited: true, flagged: !cur?.flagged });
      return next;
    });

  // ─── Render branches ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-600"><Spinner /> Loading practice set…</div>
      </div>
    );
  }
  if (isError || !set) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="card p-8 text-center max-w-md">
          <h2 className="font-display font-bold text-navy-900 text-lg">Could not load this set</h2>
          <p className="text-sm text-slate-600 mt-2">{parseApiError(error).message || 'Please try again.'}</p>
          <Button className="mt-5" onClick={() => navigate(-1)}>Back</Button>
        </div>
      </div>
    );
  }

  const q = questions[currentIdx];

  return (
    <div ref={rootRef} className="min-h-screen bg-slate-50">
      {/* ─── Intro / Pre-flight ──────────────────────────────────────── */}
      {phase === 'intro' && (
        <PreFlight
          set={set}
          totalQ={questions.length}
          onStart={beginAttempt}
          onCancel={() => navigate(-1)}
        />
      )}

      {/* ─── Wiped (malpractice) ─────────────────────────────────────── */}
      {phase === 'wiped' && (
        <WipedScreen
          onBack={() => navigate(`/practice/subjects/${subjId}/topics/${topId}/levels/${set.level}/sets`)}
        />
      )}

      {/* ─── Attempt UI ──────────────────────────────────────────────── */}
      {phase === 'attempt' && q && (
        <div className="min-h-screen flex flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Eye className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="font-display font-bold text-navy-900 truncate">
                    {subject?.subject_name ?? 'Practice Attempt'}
                  </span>
                  <Badge tone={set.level === '1' ? 'sky' : 'violet'} size="sm">Level {set.level}</Badge>
                  {set.negative_marking && <Badge tone="amber" size="sm">Neg marking</Badge>}
                </div>
                {/* Topic · Set context line.
                    Show display_order ("Set 3") rather than the internal
                    set_id ("Set 1012") — matches the numbering students see
                    on the SetCard listing. */}
                <div className="text-[0.7rem] text-slate-500 truncate mt-0.5 pl-6">
                  {topicLevels?.topic?.topic_name ?? 'Topic'}
                  <span className="text-slate-300 mx-1.5">·</span>
                  Set {set.display_order ?? set.set_id}
                </div>
              </div>
              <Timer seconds={secondsLeft} />
            </div>
            {/* Slim progress bar */}
            <div className="h-1 w-full bg-slate-100">
              <div
                className={cn(
                  'h-full transition-all',
                  secondsLeft <= 60 ? 'bg-red-500' :
                  secondsLeft <= 300 ? 'bg-amber-400' : 'bg-emerald-500',
                )}
                style={{ width: `${Math.min(100, (secondsLeft / totalSeconds) * 100)}%` }}
              />
            </div>
          </header>

          <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-5">
            <div className="grid lg:grid-cols-[1fr_22rem] gap-5 items-start">
              {/* Question column */}
              <section>
                <QuestionRenderer
                  question={q}
                  index={currentIdx + 1}
                  total={questions.length}
                  answer={answers.get(q.question_id)?.answer ?? null}
                  onAnswerChange={(a) => setAnswerFor(q.question_id, a)}
                  flagged={!!answers.get(q.question_id)?.flagged}
                  onToggleFlag={() => toggleFlagFor(q.question_id)}
                />

                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    leftIcon={<ArrowLeft className="h-4 w-4" />}
                    onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                    disabled={currentIdx === 0}
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      leftIcon={<Flag className="h-4 w-4" />}
                      onClick={() => toggleFlagFor(q.question_id)}
                    >
                      {answers.get(q.question_id)?.flagged ? 'Unflag' : 'Flag'}
                    </Button>
                    {currentIdx < questions.length - 1 ? (
                      <Button
                        rightIcon={<ArrowRight className="h-4 w-4" />}
                        onClick={() => setCurrentIdx(i => Math.min(questions.length - 1, i + 1))}
                      >
                        Next
                      </Button>
                    ) : (
                      <Button
                        variant="amber"
                        leftIcon={<Send className="h-4 w-4" />}
                        onClick={() => setConfirmSubmitOpen(true)}
                      >
                        Submit attempt
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              {/* Sidebar */}
              <aside className="space-y-4 lg:sticky lg:top-20">
                <div className="card p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Progress</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat tone="green"  label="Answered"   value={counts.answered} />
                    <Stat tone="red"    label="Skipped"    value={counts.visited} />
                    <Stat tone="slate"  label="Untouched"  value={counts.unvisited} />
                    <Stat tone="amber"  label="Flagged"    value={counts.flagged} />
                  </div>
                  <Button
                    className="w-full mt-4"
                    leftIcon={<Send className="h-4 w-4" />}
                    onClick={() => setConfirmSubmitOpen(true)}
                  >
                    Submit attempt
                  </Button>
                </div>
                <QuestionPalette
                  entries={palette}
                  onJump={(i) => setCurrentIdx(i)}
                />
                <div className="card p-4 bg-amber-50 border-amber-200">
                  <div className="flex gap-2 text-amber-800 text-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Switching tabs / minimising / opening another window will end your attempt without scoring. Stay in fullscreen.</span>
                  </div>
                </div>
              </aside>
            </div>
          </main>
        </div>
      )}

      {/* ─── Soft "return to fullscreen" overlay ─────────────────────── */}
      {phase === 'attempt' && showFsNotice && (
        <FullscreenNotice onResume={enterFs} />
      )}

      {/* ─── Submit confirm ──────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmSubmitOpen}
        onOpenChange={setConfirmSubmitOpen}
        title="Submit your attempt?"
        description={(() => {
          // Unanswered = skipped + untouched (per the requested copy).
          const unanswered = counts.visited + counts.unvisited;
          return (
            <>
              <div className="grid grid-cols-3 gap-2 mt-1 text-center">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-2">
                  <div className="text-[0.65rem] uppercase tracking-wider text-emerald-700 font-semibold">Answered</div>
                  <div className="text-xl font-bold text-emerald-800 mt-0.5 font-mono">{counts.answered}</div>
                </div>
                <div className="rounded-lg bg-red-50 border border-red-200 px-2 py-2">
                  <div className="text-[0.65rem] uppercase tracking-wider text-red-700 font-semibold">Unanswered</div>
                  <div className="text-xl font-bold text-red-800 mt-0.5 font-mono">{unanswered}</div>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-2">
                  <div className="text-[0.65rem] uppercase tracking-wider text-amber-700 font-semibold">Flagged</div>
                  <div className="text-xl font-bold text-amber-800 mt-0.5 font-mono">{counts.flagged}</div>
                </div>
              </div>
              <p className="mt-3 text-sm">Once submitted, you won't be able to change your answers.</p>
            </>
          );
        })()}
        confirmText="Submit"
        loading={submitMut.isPending}
        onConfirm={() => { submitMut.mutate(false); setConfirmSubmitOpen(false); }}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────

function PreFlight({
  set, totalQ, onStart, onCancel,
}: { set: NonNullable<ReturnType<typeof Object.values>>[number]; totalQ: number; onStart: () => void; onCancel: () => void }) {
  const s = set as any;
  return (
    <div className="min-h-screen grid place-items-center bg-mesh bg-brand-gradient-soft p-4">
      <div className="card p-6 sm:p-10 max-w-xl w-full animate-slide-up">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-600 mb-5">
          <ListChecks className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-display font-bold text-navy-900">Ready to start?</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          You're about to enter <strong>fullscreen practice mode</strong>. Read the rules below carefully.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Stat tone="navy"   label="Questions"  value={totalQ} />
          <Stat tone="amber"  label="Marks"      value={s.total_marks} />
          <Stat tone="sky"    label="Threshold"  value={`${s.threshold_percentage}%`} />
          <Stat tone="violet" label="Time"       value={`${s.timer_minutes} min`} />
        </div>

        <ul className="mt-5 space-y-2 text-sm text-slate-700">
          <Rule ok>You'll have <strong>{s.timer_minutes} minutes</strong> on the timer. It will auto-submit when the timer runs out.</Rule>
          <Rule ok>You can flag, revisit, and change answers freely until you submit.</Rule>
          {s.negative_marking
            ? <Rule warn>This set has GATE-style negative marking on MCQ wrong answers.</Rule>
            : <Rule ok>No negative marking on this set.</Rule>}
          <Rule warn>Pressing Esc will show a "return to fullscreen" prompt — your attempt is preserved.</Rule>
          <Rule danger>Switching tab, opening a new window, or closing the tab ends the attempt with no score.</Rule>
        </ul>

        <div className="mt-7 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button leftIcon={<Maximize2 className="h-4 w-4" />} onClick={onStart}>
            Enter fullscreen & start
          </Button>
        </div>
      </div>
    </div>
  );
}

function Rule({ ok, warn, danger, children }: { ok?: boolean; warn?: boolean; danger?: boolean; children: React.ReactNode }) {
  const tone =
    danger ? 'text-red-700 bg-red-50 border-red-100' :
    warn   ? 'text-amber-800 bg-amber-50 border-amber-100' :
             'text-slate-700 bg-slate-50 border-slate-100';
  const Icon = danger ? AlertTriangle : warn ? AlertTriangle : CheckCircle2;
  return (
    <li className={cn('flex gap-2 rounded-lg border px-3 py-2 text-xs', tone)}>
      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

function Timer({ seconds }: { seconds: number }) {
  const tone = seconds <= 60 ? 'bg-red-100 text-red-700 ring-2 ring-red-300 animate-pulse-glow' :
               seconds <= 300 ? 'bg-amber-100 text-amber-800' :
               'bg-emerald-50 text-emerald-700';
  return (
    <div className={cn('inline-flex items-center gap-2 rounded-xl px-3 h-9 text-sm font-mono font-bold', tone)}>
      <Clock className="h-4 w-4" />
      {formatSecondsHHMMSS(seconds)}
    </div>
  );
}

function FullscreenNotice({ onResume }: { onResume: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center backdrop-blur-md bg-slate-900/40 animate-fade-in">
      <div className="card p-6 sm:p-8 max-w-md w-[92vw] text-center animate-scale-in">
        <div className="grid h-12 w-12 mx-auto place-items-center rounded-2xl bg-amber-100 text-amber-600">
          <Maximize2 className="h-5 w-5" />
        </div>
        <h2 className="mt-4 font-display font-bold text-navy-900 text-lg">Return to fullscreen</h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Practice attempts must run in fullscreen. Your answers are still preserved — just hit the button to continue your attempt.
        </p>
        <Button className="mt-5 w-full" leftIcon={<Maximize2 className="h-4 w-4" />} onClick={onResume}>
          Resume in fullscreen
        </Button>
      </div>
    </div>
  );
}

function WipedScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen grid place-items-center bg-red-50 p-4">
      <div className="card p-6 sm:p-10 max-w-lg w-full text-center border-2 border-red-200">
        <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-red-100 text-red-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-display font-bold text-red-700">Attempt ended</h1>
        <p className="mt-3 text-slate-700 leading-relaxed">
          You moved out of the practice attempt page (tab switch, window change, or tab close).
          <br />
          For practice integrity, this attempt has ended without scoring.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Don't worry — practice attempts are unlimited. You can start the set again.
        </p>
        <Button className="mt-6" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Back to sets
        </Button>
      </div>
    </div>
  );
}

const toneStat: Record<string, string> = {
  amber:  'bg-amber-50 text-amber-800 border-amber-100',
  navy:   'bg-navy-50 text-navy-800 border-navy-100',
  sky:    'bg-sky-50 text-sky-700 border-sky-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
  green:  'bg-emerald-50 text-emerald-700 border-emerald-100',
  red:    'bg-red-50 text-red-700 border-red-100',
  slate:  'bg-slate-50 text-slate-700 border-slate-200',
};
function Stat({ label, value, tone = 'navy' }: { label: string; value: React.ReactNode; tone?: keyof typeof toneStat }) {
  return (
    <div className={cn('rounded-xl border px-3 py-2', toneStat[tone])}>
      <div className="text-[0.65rem] uppercase tracking-wider opacity-80 font-semibold">{label}</div>
      <div className="text-lg font-bold leading-tight mt-0.5">{value}</div>
    </div>
  );
}
