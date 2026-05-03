import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, Clock, Maximize2, ArrowLeft, ArrowRight, ListChecks,
  Send, Flag, Eye, Save, CheckCircle2, RefreshCw, ShieldAlert,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

import { testsApi, type TestAttemptStartResponse } from '@/lib/api/tests';
import { parseApiError } from '@/lib/api/client';
import { formatSecondsHHMMSS } from '@/lib/format';
import { cn } from '@/lib/cn';

import { QuestionPalette, type PaletteEntry } from '@/components/practice/QuestionPalette';
import { QuestionRenderer } from '@/components/practice/QuestionRenderer';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useMalpracticeWatcher } from '@/hooks/useMalpracticeWatcher';

const MAX_ATTEMPTS    = 3;
const SAVE_INTERVAL_MS = 40 * 1000;
const SUBMITTING_HOLD_S = 90; // 1:30

interface AnswerState {
  answer: string | null;
  visited: boolean;
  flagged: boolean;
}

type Phase =
  | 'preflight'
  | 'attempt'
  | 'left-fs'
  | 'moved-out'
  | 'submitting'        // request in flight
  | 'submit-retry-wait' // waiting between retries (1:30 countdown)
  | 'submit-window-closed' // test_end_time crossed before we could submit
  | 'submitted'         // success — 3-second confirmation
  | 'error';

export default function TestAttemptPage() {
  const { testId: tidParam } = useParams<{ testId: string }>();
  const testId = Number(tidParam);
  const navigate = useNavigate();
  // Optional test name passed from the TestCard via navigation state so the
  // pre-flight screen can show "<Test name> — ready?" before /start runs.
  const location = useLocation();
  const navTestName = (location.state as { test_name?: string } | null)?.test_name;

  const rootRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, request: enterFs, exit: exitFs } = useFullscreen(rootRef);

  const [phase, setPhase] = useState<Phase>('preflight');
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [start, setStart] = useState<TestAttemptStartResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Map<number, AnswerState>>(new Map());
  const [currentIdx, setCurrentIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Absolute "ends-at" timestamp. The server's clock is based on
  // attempt_start_time + duration_minutes, so we anchor the display to that
  // instead of decrementing a free-running counter — that way pausing or
  // re-entering the page never drifts the displayed remaining time away
  // from server truth, and the JS timer doesn't need to "stop" during the
  // soft fullscreen notice.
  const [endsAtMs, setEndsAtMs] = useState<number | null>(null);

  // ─── Start mutation: triggered from pre-flight after fullscreen ───
  const startMut = useMutation({
    mutationFn: () => testsApi.startAttempt(testId),
    onSuccess: (r) => {
      setStart(r);
      const ends = Date.now() + r.time_remaining_sec * 1000;
      setEndsAtMs(ends);
      setSecondsLeft(r.time_remaining_sec);

      // Build answers map from saved_answers + visit flags
      const m = new Map<number, AnswerState>();
      r.questions.forEach((q, i) => {
        const saved = r.saved_answers.find(a => a.question_id === q.question_id)?.answer ?? null;
        m.set(q.question_id, { answer: saved, visited: i === 0 || !!saved, flagged: false });
      });
      setAnswers(m);
      setPhase('attempt');
    },
    onError: (e) => {
      setErrorMsg(parseApiError(e).message || 'Could not start test attempt');
      setPhase('error');
    },
  });

  // ─── Submit mutation ──────────────────────────────────────────────
  // We call this directly from the retry loop. onSuccess/onError move the FSM.
  const submitMut = useMutation({
    mutationFn: () => {
      const list = (start?.questions ?? []).map(q => ({
        question_id: q.question_id,
        answer: answers.get(q.question_id)?.answer ?? null,
      }));
      return testsApi.submitAttempt(testId, list);
    },
    onSuccess: () => {
      setPhase('submitted');
      // Drop out of fullscreen so the green confirmation page (and the
      // auto-redirect to /tests right after) renders in normal mode.
      exitFs().catch(() => {});
    },
    onError: (e) => {
      // Don't toast — the retry screen surfaces the state. Decide next phase below.
      const endTimeMs = start?.test.end_time ? new Date(start.test.end_time).getTime() : 0;
      if (endTimeMs && Date.now() >= endTimeMs) {
        setPhase('submit-window-closed');
      } else {
        setPhase('submit-retry-wait');
      }
      // Surface a quiet toast so the user knows we're retrying
      toast.error(parseApiError(e).message || 'Submission failed — will retry…');
    },
  });

  // ─── Save mutation (every 40 s) ───────────────────────────────────
  const saveMut = useMutation({
    mutationFn: () => {
      const list = (start?.questions ?? []).map(q => ({
        question_id: q.question_id,
        answer: answers.get(q.question_id)?.answer ?? null,
      }));
      return testsApi.saveProgress(testId, list);
    },
    onSuccess: () => setLastSavedAt(new Date()),
    onError: (e) => {
      // Don't toast on every failure to avoid noise — surface only auth issues
      const err = parseApiError(e);
      if (err.status === 401 || err.status === 403) toast.error(err.message);
    },
  });

  // Periodic save while attempting
  useEffect(() => {
    if (phase !== 'attempt') return;
    const id = setInterval(() => { saveMut.mutate(); }, SAVE_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ─── Mark visited on navigation ──────────────────────────────────
  useEffect(() => {
    const q = start?.questions[currentIdx];
    if (!q) return;
    setAnswers(prev => {
      const cur = prev.get(q.question_id);
      if (!cur || cur.visited) return prev;
      const next = new Map(prev);
      next.set(q.question_id, { ...cur, visited: true });
      return next;
    });
  }, [currentIdx, start?.questions]);

  // ─── Timer ───────────────────────────────────────────────────────
  // Recompute remaining seconds from the absolute end-time on every tick.
  // Runs continuously while we still have an end-time, regardless of phase
  // ('attempt', 'left-fs', whatever) — the server's clock keeps moving, so
  // ours must too. Stops once the test has fully finished (submitted or
  // window closed) so we don't re-trigger auto-submit on cleanup.
  useEffect(() => {
    if (!endsAtMs) return;
    if (phase === 'submitted' || phase === 'submit-window-closed') return;
    const tick = () => setSecondsLeft(Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000)));
    tick(); // sync immediately on mount / state change
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAtMs, phase]);

  // ─── Auto-submit on time-up + warnings ───────────────────────────
  const fired = useRef<{ five: boolean; two: boolean; one: boolean }>({ five: false, two: false, one: false });
  const triggerSubmitFlow = useCallback(() => {
    setPhase('submitting');
    submitMut.mutate();
  }, [submitMut]);

  useEffect(() => {
    // Auto-submit must fire from BOTH 'attempt' AND 'left-fs' once the server
    // clock hits 0 — otherwise a user who stepped out via Esc and came back
    // past end_time would skip the auto-submit entirely.
    const inAttempt = phase === 'attempt' || phase === 'left-fs';
    if (!inAttempt) return;
    if (secondsLeft <= 0) { triggerSubmitFlow(); return; }
    // Toasts are noise while the soft notice is up — only fire during 'attempt'.
    if (phase !== 'attempt') return;
    if (secondsLeft <= 300 && !fired.current.five) { fired.current.five = true; toast.warning('5 minutes remaining'); }
    if (secondsLeft <= 120 && !fired.current.two)  { fired.current.two  = true; toast.warning('2 minutes remaining'); }
    if (secondsLeft <= 60  && !fired.current.one)  { fired.current.one  = true; toast.warning('1 minute remaining', { duration: 6000 }); }
  }, [phase, secondsLeft, triggerSubmitFlow]);

  // ─── Submission retry loop ──────────────────────────────────────
  // While phase === 'submit-retry-wait', count down from 1:30. When the timer
  // hits 0, fire submit again. Loop until success ('submitted') or until
  // test_end_time crosses ('submit-window-closed').
  const [retryLeft, setRetryLeft] = useState(SUBMITTING_HOLD_S);

  useEffect(() => {
    if (phase !== 'submit-retry-wait') return;

    // Hard stop if the test window has already closed
    const endTimeMs = start?.test.end_time ? new Date(start.test.end_time).getTime() : 0;
    if (endTimeMs && Date.now() >= endTimeMs) {
      setPhase('submit-window-closed');
      return;
    }

    setRetryLeft(SUBMITTING_HOLD_S);
    const t = setInterval(() => setRetryLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [phase, start?.test.end_time]);

  useEffect(() => {
    if (phase !== 'submit-retry-wait' || retryLeft > 0) return;
    // Time to retry — but check the window first
    const endTimeMs = start?.test.end_time ? new Date(start.test.end_time).getTime() : 0;
    if (endTimeMs && Date.now() >= endTimeMs) {
      setPhase('submit-window-closed');
      return;
    }
    setPhase('submitting');
    submitMut.mutate();
  }, [phase, retryLeft, start?.test.end_time, submitMut]);

  // ─── 'submitted' → 3 seconds → /tests ────────────────────────────
  useEffect(() => {
    if (phase !== 'submitted') return;
    const t = setTimeout(() => navigate('/tests', { replace: true }), 3000);
    return () => clearTimeout(t);
  }, [phase, navigate]);

  // ─── Malpractice watcher ─────────────────────────────────────────
  // Stays armed for BOTH 'attempt' and 'left-fs'. Otherwise tab-switching
  // while the soft "Return to fullscreen" notice is up would slip past
  // undetected (because we'd have torn down listeners on phase change).
  const onWipe = useCallback(() => {
    if (phase !== 'attempt' && phase !== 'left-fs') return;
    const cnt = start?.attempt_count ?? 1;
    if (cnt >= MAX_ATTEMPTS) {
      // Final attempt → force submit
      triggerSubmitFlow();
    } else {
      setPhase('moved-out');
    }
  }, [phase, start?.attempt_count, triggerSubmitFlow]);

  useMalpracticeWatcher({
    enabled: phase === 'attempt' || phase === 'left-fs',
    onWipe,
    // `onLeftFullscreen` isn't used here — the isFullscreen-state effect
    // below is the single source of truth for entering/leaving fullscreen.
    onLeftFullscreen: () => { /* no-op */ },
  });

  // ─── PRIMARY fullscreen-state guard ─────────────────────────────
  // Don't rely on fullscreenchange/keydown event races. The `isFullscreen`
  // state from useFullscreen is the single source of truth for whether the
  // page is currently fullscreen — driven directly by `document.fullscreenElement`.
  //
  // Two complementary rules:
  //   1. `attempt` + NOT fullscreen   → soft "Return to fullscreen" prompt.
  //      (Covers Esc, F11 toggle, programmatic exit, denied-on-first-request.)
  //   2. `left-fs` + IS fullscreen    → snap back to `attempt`.
  //      (Covers user clicking the "Resume in fullscreen" button.)
  useEffect(() => {
    if (phase === 'attempt' && !isFullscreen) {
      setPhase('left-fs');
    } else if (phase === 'left-fs' && isFullscreen) {
      setPhase('attempt');
    }
  }, [isFullscreen, phase]);

  // ─── Palette + counts ────────────────────────────────────────────
  const palette: PaletteEntry[] = useMemo(() => (start?.questions ?? []).map((q, i) => {
    const a = answers.get(q.question_id);
    const status: PaletteEntry['status'] =
      a?.answer && a.answer !== '' ? 'answered'
      : a?.visited ? 'visited' : 'unvisited';
    return { index: i + 1, status, flagged: !!a?.flagged, current: i === currentIdx };
  }), [start?.questions, answers, currentIdx]);

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

  // ─── Pre-flight start ────────────────────────────────────────────
  const begin = async () => {
    await enterFs();
    startMut.mutate();
  };

  // ─── Render branches ─────────────────────────────────────────────
  if (phase === 'preflight') {
    return <PreFlightCard testId={testId} testName={navTestName} loading={startMut.isPending} onStart={begin} onCancel={() => navigate(-1)} />;
  }
  if (phase === 'error') {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="card p-8 text-center max-w-md">
          <ShieldAlert className="h-10 w-10 text-red-500 mx-auto" />
          <h2 className="mt-4 font-display font-bold text-navy-900 text-lg">Could not start the test</h2>
          <p className="text-sm text-slate-600 mt-2">{errorMsg}</p>
          <Button className="mt-5" onClick={() => navigate('/tests')}>Back to tests</Button>
        </div>
      </div>
    );
  }
  if (phase === 'submitting') {
    return <SubmittingInflightScreen />;
  }
  if (phase === 'submit-retry-wait') {
    return <SubmittingRetryScreen secondsLeft={retryLeft} retryNow={() => { setPhase('submitting'); submitMut.mutate(); }} />;
  }
  if (phase === 'submitted') {
    return <SubmittedSuccessScreen />;
  }
  if (phase === 'submit-window-closed') {
    return <SubmitWindowClosedScreen onBack={() => navigate('/tests', { replace: true })} />;
  }
  if (phase === 'moved-out') {
    return <MovedOutScreen attemptCount={start?.attempt_count ?? 1} onBack={() => navigate('/tests')} />;
  }

  // ─── Main attempt UI ─────────────────────────────────────────────
  const q = start?.questions[currentIdx];
  if (!start || !q) return null;

  return (
    <div ref={rootRef} tabIndex={-1} className="min-h-screen flex flex-col bg-slate-50 outline-none">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="h-4 w-4 text-amber-500" />
            <span className="font-display font-bold text-navy-900 truncate">{start.test.test_name}</span>
            <Badge tone="navy" size="sm">Attempt {start.attempt_count}/{MAX_ATTEMPTS}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1 text-[0.7rem] text-slate-500">
              <Save className="h-3 w-3" />
              {lastSavedAt
                ? <>Saved <span className="font-mono">{lastSavedAt.toLocaleTimeString()}</span></>
                : 'Auto-save every 40 s'}
            </span>
            <Timer seconds={secondsLeft} />
          </div>
        </div>
        <div className="h-1 w-full bg-slate-100">
          <div
            className={cn('h-full transition-all',
              secondsLeft <= 60 ? 'bg-red-500' :
              secondsLeft <= 300 ? 'bg-amber-400' : 'bg-emerald-500')}
            style={{ width: `${Math.min(100, (secondsLeft / Math.max(1, start.test.duration_minutes * 60)) * 100)}%` }}
          />
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-5">
        <div className="grid lg:grid-cols-[1fr_22rem] gap-5 items-start">
          <section>
            <QuestionRenderer
              question={q}
              index={currentIdx + 1}
              total={start.questions.length}
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
                <Button variant="ghost" leftIcon={<Flag className="h-4 w-4" />}
                        onClick={() => toggleFlagFor(q.question_id)}>
                  {answers.get(q.question_id)?.flagged ? 'Unflag' : 'Flag'}
                </Button>
                {currentIdx < start.questions.length - 1 ? (
                  <Button rightIcon={<ArrowRight className="h-4 w-4" />}
                          onClick={() => setCurrentIdx(i => Math.min(start.questions.length - 1, i + 1))}>
                    Next
                  </Button>
                ) : (
                  <Button variant="amber" leftIcon={<Send className="h-4 w-4" />}
                          onClick={() => setConfirmSubmitOpen(true)}>
                    Submit attempt
                  </Button>
                )}
              </div>
            </div>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-20">
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Progress</div>
              <div className="grid grid-cols-2 gap-2">
                <Stat tone="green" label="Answered"  value={counts.answered} />
                <Stat tone="red"   label="Skipped"   value={counts.visited} />
                <Stat tone="slate" label="Untouched" value={counts.unvisited} />
                <Stat tone="amber" label="Flagged"   value={counts.flagged} />
              </div>
              <Button className="w-full mt-4" leftIcon={<Send className="h-4 w-4" />}
                      onClick={() => setConfirmSubmitOpen(true)}>
                Submit attempt
              </Button>
            </div>

            <QuestionPalette entries={palette} onJump={setCurrentIdx} />

            <div className="card p-4 bg-amber-50 border-amber-200">
              <div className="flex gap-2 text-amber-800 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {(start.attempt_count ?? 1) >= MAX_ATTEMPTS
                    ? 'Final attempt — switching tabs or windows will FORCE-SUBMIT immediately.'
                    : 'Switching tabs / minimising will end this attempt without scoring. You can resume from the tests list if attempts remain.'}
                </span>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {phase === 'left-fs' && <FullscreenNotice onResume={enterFs} />}

      <ConfirmDialog
        open={confirmSubmitOpen}
        onOpenChange={setConfirmSubmitOpen}
        title="Submit your attempt?"
        description={(() => {
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
              <p className="mt-3 text-sm">Final scoring runs on the server after the test window closes.</p>
            </>
          );
        })()}
        confirmText="Submit"
        onConfirm={() => { setConfirmSubmitOpen(false); triggerSubmitFlow(); }}
      />
    </div>
  );
}

// ─── Sub-screens ────────────────────────────────────────────────────────

function PreFlightCard({ testId, testName, loading, onStart, onCancel }: { testId: number; testName?: string; loading: boolean; onStart: () => void; onCancel: () => void }) {
  // Title prefers the human-readable test name (passed in from the listing
  // page via navigation state). Falls back to "Test #<id>" when the user
  // landed here via a direct URL where no state is attached.
  const title = testName ? `${testName} — ready?` : `Test #${testId} — ready?`;
  return (
    <div className="min-h-screen grid place-items-center bg-mesh bg-brand-gradient-soft p-4">
      <div className="card p-6 sm:p-10 max-w-xl w-full animate-slide-up">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-600 mb-5">
          <ListChecks className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-display font-bold text-navy-900">{title}</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed">
          You're about to enter <strong>fullscreen test mode</strong>. Read the rules below carefully — they're stricter than practice.
        </p>

        <ul className="mt-5 space-y-2 text-sm">
          <Rule ok>The timer begins as soon as you click Start Test and runs continuously — it will not pause even if you navigate away from the test page.</Rule>
          <Rule ok>Answers auto-save every 40 seconds. A "Saved at HH:MM:SS" indicator stays on screen.</Rule>
          <Rule warn>Esc only shows a "return to fullscreen" prompt — your attempt continues.</Rule>
          <Rule danger>Switching tabs, minimising, or opening another window ends this attempt.</Rule>
          <Rule danger>You have up to {MAX_ATTEMPTS} attempts. On the final attempt, malpractice triggers an immediate force-submit.</Rule>
          <Rule warn>If duration or test end time is reached, your answers are auto-submitted.</Rule>
        </ul>

        <div className="mt-7 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button leftIcon={<Maximize2 className="h-4 w-4" />} loading={loading} onClick={onStart}>
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
          Tests must run in fullscreen. Your answers and timer are preserved — just hit the button below.
        </p>
        <Button className="mt-5 w-full" leftIcon={<Maximize2 className="h-4 w-4" />} onClick={onResume}>
          Resume in fullscreen
        </Button>
      </div>
    </div>
  );
}

function MovedOutScreen({ attemptCount, onBack }: { attemptCount: number; onBack: () => void }) {
  const remaining = Math.max(0, MAX_ATTEMPTS - attemptCount);
  return (
    <div className="min-h-screen grid place-items-center bg-amber-50 p-4">
      <div className="card p-6 sm:p-10 max-w-lg w-full text-center border-2 border-amber-200">
        <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-amber-100 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-display font-bold text-amber-700">You moved out from the test</h1>
        <p className="mt-3 text-slate-700 leading-relaxed">
          Tab change, window switch, or page close detected. This attempt has ended.
          <br />
          You can navigate to the tests section to continue if attempts remain.
        </p>
        <p className="mt-3 text-sm text-slate-500">
          Attempt <span className="font-semibold text-navy-800">{attemptCount}</span> of {MAX_ATTEMPTS} ·
          {' '}{remaining} remaining
        </p>
        <Button className="mt-6" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Navigate to tests section
        </Button>
      </div>
    </div>
  );
}

/** Request is in flight (just clicked Submit, or auto-trigger fired). */
function SubmittingInflightScreen() {
  return (
    <div className="min-h-screen grid place-items-center bg-white p-6">
      <div className="max-w-md w-full text-center">
        <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-navy-50 text-navy-700">
          <Spinner className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-display font-bold text-navy-900">
          We are submitting your attempt
        </h1>
        <p className="mt-3 text-slate-600 leading-relaxed">
          Please stay on this screen. Do not close this tab.
        </p>
      </div>
    </div>
  );
}

/** Last submit failed; counting down to the next retry. */
function SubmittingRetryScreen({ secondsLeft, retryNow }: { secondsLeft: number; retryNow: () => void }) {
  return (
    <div className="min-h-screen grid place-items-center bg-white p-6">
      <div className="max-w-md w-full text-center">
        <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <RefreshCw className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-display font-bold text-navy-900">
          Network hiccup — retrying soon
        </h1>
        <p className="mt-3 text-slate-600 leading-relaxed">
          We'll retry submitting your attempt automatically. Stay on this screen — your answers are safe.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-amber-800 font-mono font-bold">
          <Clock className="h-4 w-4" />
          {formatSecondsHHMMSS(secondsLeft)}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Retries continue every 1:30 until your attempt is accepted, or until the test window closes.
        </p>
        <Button className="mt-5" variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={retryNow}>
          Retry now
        </Button>
      </div>
    </div>
  );
}

/** Success: green confirmation, auto-redirects in 3 s. */
function SubmittedSuccessScreen() {
  return (
    <div className="min-h-screen grid place-items-center bg-emerald-50 p-6">
      <div className="card p-6 sm:p-10 max-w-md w-full text-center border-2 border-emerald-200 animate-scale-in">
        <div className="grid h-16 w-16 mx-auto place-items-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-2xl font-display font-bold text-emerald-700">Successfully submitted</h1>
        <p className="mt-2 text-slate-700 leading-relaxed">
          Your attempt has been recorded. Final scoring runs after the test window closes.
        </p>
        <p className="mt-4 text-xs text-slate-500">Routing back to tests in 3 seconds…</p>
      </div>
    </div>
  );
}

/** Test window closed without a successful submit. */
function SubmitWindowClosedScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen grid place-items-center bg-red-50 p-6">
      <div className="card p-6 sm:p-10 max-w-md w-full text-center border-2 border-red-200">
        <div className="grid h-14 w-14 mx-auto place-items-center rounded-2xl bg-red-100 text-red-600">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-2xl font-display font-bold text-red-700">Submission window closed</h1>
        <p className="mt-3 text-slate-700 leading-relaxed">
          The test ended before we could complete your submission. The server will evaluate whatever was last auto-saved.
        </p>
        <Button className="mt-6" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Back to tests
        </Button>
      </div>
    </div>
  );
}

const toneStat: Record<string, string> = {
  amber:  'bg-amber-50 text-amber-800 border-amber-100',
  green:  'bg-emerald-50 text-emerald-700 border-emerald-100',
  red:    'bg-red-50 text-red-700 border-red-100',
  slate:  'bg-slate-50 text-slate-700 border-slate-200',
};
function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone: keyof typeof toneStat }) {
  return (
    <div className={cn('rounded-xl border px-3 py-2', toneStat[tone])}>
      <div className="text-[0.65rem] uppercase tracking-wider opacity-80 font-semibold">{label}</div>
      <div className="text-lg font-bold leading-tight mt-0.5">{value}</div>
    </div>
  );
}
