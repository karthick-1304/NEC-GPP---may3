import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save, ArrowLeft, AlertTriangle, Calendar, Clock,
  Sparkles, ListChecks, Lock, ToggleLeft, ToggleRight, Wand2,
} from 'lucide-react';

import { PageContainer } from '@/components/ui/PageContainer';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

import { testsApi } from '@/lib/api/tests';
import { parseApiError } from '@/lib/api/client';
import { localInputToIso, toLocalInput } from '@/lib/datetime';
import { cn } from '@/lib/cn';

import { QuestionsEditor, type QuestionsEditorHandle } from '@/components/practice/QuestionsEditor';
import { fromApiQuestion, toApiQuestions } from '@/components/practice/questionValidation';
import { newQuestion } from '@/components/practice/QuestionEditor';

import { AssignmentsPicker, type AssignmentEntry } from '@/components/test/AssignmentsPicker';
import { IntelliPickConfig, type IntelliState } from '@/components/test/IntelliPickConfig';

// ─── Form schema (basic fields only — questions/assignments handled separately) ──
//
// Two cross-field refinements:
//   1. end_time > start_time (always)
//   2. start_time > NOW (skipped on edit when the test has already started —
//      handled in `onValid` instead, since the schema doesn't know
//      `canEditStartTime`).
const baseSchema = z.object({
  test_name:        z.string().trim().min(2, 'At least 2 characters').max(50),
  start_time:       z.string().min(1, 'Start time is required'),
  end_time:         z.string().min(1, 'End time is required'),
  duration_minutes: z.coerce.number().int().min(5, 'At least 5 minutes').max(500, 'At most 500 minutes'),
  negative_marking: z.boolean().default(true),
}).refine((d) => {
  const a = new Date(d.start_time).getTime();
  const b = new Date(d.end_time).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && b > a;
}, { message: 'End time must be after start time', path: ['end_time'] });

type FormValues = z.infer<typeof baseSchema>;

interface Props {
  mode: 'create' | 'edit';
}

export default function TestEditorPage({ mode }: Props) {
  const { testId: testIdParam } = useParams<{ testId?: string }>();
  const testId = testIdParam ? Number(testIdParam) : undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const editorRef = useRef<QuestionsEditorHandle>(null);

  // ─── State (non-RHF parts) ───────────────────────────────────────
  const [intelliMode, setIntelliMode] = useState(false);
  const [intelli, setIntelli] = useState<IntelliState>({ subject_id: null, level: '1', topicCounts: new Map() });
  const [assignments, setAssignments] = useState<AssignmentEntry[]>([]);
  const [lockedAssignments, setLockedAssignments] = useState<AssignmentEntry[]>([]);
  // Locked entries the user unchecked in the picker. Sent as
  // `remove_assignments` on save (edit mode, not-started). The backend will
  // DELETE them; the frontend already moved them OUT of lockedAssignments so
  // they render as unchecked immediately.
  const [removedAssignments, setRemovedAssignments] = useState<AssignmentEntry[]>([]);

  // ─── RHF for the simple inputs ────────────────────────────────────
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      test_name: '',
      // No pre-filled schedule — the user must enter both times explicitly.
      start_time: '',
      end_time:   '',
      duration_minutes: 30,
      negative_marking: true,
    },
  });

  const negative_marking = watch('negative_marking');

  // ─── Edit mode: prefill ───────────────────────────────────────────
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['test-admin', testId],
    queryFn: () => testsApi.getForAdmin(testId!),
    enabled: mode === 'edit' && Number.isFinite(testId),
  });

  useEffect(() => {
    if (mode !== 'edit' || !existing) return;
    reset({
      test_name: existing.test.test_name,
      start_time: toLocalInput(existing.test.start_time),
      end_time:   toLocalInput(existing.test.end_time),
      duration_minutes: existing.test.duration_minutes,
      negative_marking: existing.test.negative_marking === 1,
    });
    setLockedAssignments(existing.assignments.map(a => ({ ...a, locked: true })));
    setAssignments([]);
    setRemovedAssignments([]); // fresh edit session — no pending removals
    setIntelliMode(existing.test.is_intelli_pick === 1);

    if (existing.test.is_intelli_pick !== 1 && existing.questions.length) {
      const drafts = existing.questions.map(q => fromApiQuestion({
        question_type: q.question_type,
        question_text: q.question_text,
        option_a: q.option_a ?? null,
        option_b: q.option_b ?? null,
        option_c: q.option_c ?? null,
        option_d: q.option_d ?? null,
        correct_answer: q.correct_answer,
        marks: q.marks as 1 | 2,
        question_image_url: q.question_image_url ?? null,
        question_image_thumb_url: q.question_image_thumb_url ?? null,
        question_image_delete_url: q.question_image_delete_url ?? null,
      }));
      setTimeout(() => editorRef.current?.setAll(drafts), 0);
    }
  }, [mode, existing, reset]);

  const startedAlready = useMemo(() => {
    if (mode !== 'edit' || !existing) return false;
    return new Date(existing.test.start_time).getTime() <= Date.now();
  }, [mode, existing]);
  const isIntelliExisting = mode === 'edit' && existing?.test.is_intelli_pick === 1;
  const canEditQuestions  = !isIntelliExisting && !startedAlready;
  const canEditStartTime  = !startedAlready;

  // ─── Mutations ────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: testsApi.create,
    onSuccess: () => {
      toast.success('Test created');
      qc.invalidateQueries({ queryKey: ['tests'] });
      navigate('/tests', { replace: true });
    },
    onError: (e) => toast.error(parseApiError(e).message || 'Could not create test'),
  });
  const updateMut = useMutation({
    mutationFn: (body: Parameters<typeof testsApi.update>[1]) => testsApi.update(testId!, body),
    onSuccess: () => {
      toast.success('Test updated');
      qc.invalidateQueries({ queryKey: ['tests'] });
      qc.invalidateQueries({ queryKey: ['test-admin', testId] });
      navigate('/tests', { replace: true });
    },
    onError: (e) => toast.error(parseApiError(e).message || 'Could not update test'),
  });

  const onValid = (form: FormValues) => {
    if (assignments.length + lockedAssignments.length === 0) {
      toast.error('Add at least one (department × academic year) assignment.');
      return;
    }
    const startISO = localInputToIso(form.start_time);
    const endISO   = localInputToIso(form.end_time);
    if (!startISO || !endISO) {
      toast.error('Start/End time is invalid.');
      return;
    }

    // Future-only rule for start_time. Mirrors the backend's strict
    // `Joi.date().greater('now')` — we reject the same values the server
    // would reject so the user never sees a generic 400 from the API for
    // something we can catch up-front.
    // On edit-after-start the field is locked and we don't send start_time
    // at all, so this guard is correctly skipped via `canEditStartTime`.
    const isStartEditable = mode === 'create' || canEditStartTime;
    if (isStartEditable) {
      const startMs = new Date(startISO).getTime();
      if (Number.isFinite(startMs) && startMs <= Date.now()) {
        toast.error('Start time must be greater than the current time.');
        return;
      }
    }

    if (mode === 'create') {
      let payload: Parameters<typeof testsApi.create>[0];
      if (intelliMode) {
        if (!intelli.subject_id || intelli.topicCounts.size === 0) {
          toast.error('Pick a subject and at least one topic for Intelli-Pick.');
          return;
        }
        // A topic is "selected" only when it carries a positive count. If a
        // ticked topic has 0/empty count, prompt the user instead of silently
        // dropping it.
        const blank = Array.from(intelli.topicCounts.entries()).find(([, c]) => !c || c <= 0);
        if (blank) {
          toast.error('Each ticked topic needs a question count. Either set a number or untick the topic.');
          return;
        }
        payload = {
          test_name: form.test_name.trim(),
          start_time: startISO, end_time: endISO,
          duration_minutes: form.duration_minutes,
          negative_marking: form.negative_marking,
          assignments: assignments.map(a => ({ dept_id: a.dept_id, academic_year: a.academic_year })),
          intelli_pick: true,
          intelli_config: {
            subject_id: intelli.subject_id,
            level: intelli.level,
            topics: Array.from(intelli.topicCounts.entries()).map(([topic_id, count]) => ({ topic_id, count })),
          },
        };
      } else {
        const drafts = editorRef.current?.validateAndCollect();
        if (!drafts) return;
        payload = {
          test_name: form.test_name.trim(),
          start_time: startISO, end_time: endISO,
          duration_minutes: form.duration_minutes,
          negative_marking: form.negative_marking,
          assignments: assignments.map(a => ({ dept_id: a.dept_id, academic_year: a.academic_year })),
          intelli_pick: false,
          questions: toApiQuestions(drafts),
        };
      }
      createMut.mutate(payload);
    } else {
      // EDIT
      //
      // Only send fields the user is allowed to change for this test's current
      // state. The backend independently re-checks `startedAlready` and rejects
      // any locked field — this just keeps the request payload honest so we
      // don't send fields we know will bounce.
      const body: Parameters<typeof testsApi.update>[1] = {
        test_name: form.test_name.trim(),
        negative_marking: form.negative_marking,
      };

      // Schedule + duration only when the test hasn't started yet.
      if (!startedAlready) {
        body.start_time = startISO;
        body.end_time   = endISO;
        body.duration_minutes = form.duration_minutes;
      }

      // Additions — always allowed (both started and not-started states).
      if (assignments.length) {
        body.assignments = assignments.map(a => ({ dept_id: a.dept_id, academic_year: a.academic_year }));
      }

      // Removals — only when not started. The picker emits onRemoveLocked
      // for each locked entry the user unchecks, and we track those in
      // `removedAssignments`. We also filter out anything the user has
      // since re-added (back in `assignments`) so we don't tell the backend
      // to add and remove the same pair in the same request.
      if (!startedAlready && removedAssignments.length) {
        const reAddedKeys = new Set(assignments.map(a => `${a.dept_id}|${a.academic_year}`));
        const toRemove = removedAssignments.filter(
          (r) => !reAddedKeys.has(`${r.dept_id}|${r.academic_year}`),
        );
        if (toRemove.length) {
          body.remove_assignments = toRemove.map(a => ({ dept_id: a.dept_id, academic_year: a.academic_year }));
        }
      }

      if (canEditQuestions) {
        const drafts = editorRef.current?.validateAndCollect();
        if (drafts) body.questions = toApiQuestions(drafts);
      }
      updateMut.mutate(body);
    }
  };

  if (mode === 'edit' && loadingExisting) {
    return <PageContainer><div className="flex items-center gap-2 text-slate-500 text-sm"><Spinner /> Loading test…</div></PageContainer>;
  }

  return (
    <PageContainer>
      <Breadcrumbs items={[
        { label: 'Tests', to: '/tests' },
        { label: mode === 'create' ? 'New test' : `Edit · ${existing?.test.test_name ?? ''}` },
      ]} className="mb-5" />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">
            {mode === 'create'
              ? 'Create a new test'
              : `Edit · ${existing?.test.test_name ?? ''}`}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === 'create'
              ? 'Schedule the test, pick its participation, and add or auto-pick questions.'
              : (startedAlready
                ? 'This test has already started — start time and questions are locked.'
                : 'Update test schedule, participation, or content.')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate(-1)}>Cancel</Button>
          <Button
            leftIcon={<Save className="h-4 w-4" />}
            loading={createMut.isPending || updateMut.isPending}
            onClick={handleSubmit(onValid)}
          >
            {mode === 'create' ? 'Create test' : 'Save changes'}
          </Button>
        </div>
      </div>

      {/* ─── Basic info ─────────────────────────────────────────── */}
      <SectionCard title="Basic info" icon={<Sparkles className="h-4 w-4 text-amber-500" />}>
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Test name" required error={errors.test_name?.message}>
            <Input placeholder="e.g. Mid-sem GATE Mock"
                   leftIcon={<ListChecks className="h-4 w-4" />}
                   invalid={!!errors.test_name}
                   {...register('test_name')} />
          </Field>
          <Field label="Negative marking" hint="GATE-style negative marking on wrong MCQ answers.">
            <button
              type="button"
              onClick={() => setValue('negative_marking', !negative_marking, { shouldDirty: true })}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border px-3 h-11 text-sm font-semibold transition-colors',
                negative_marking ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50',
              )}
            >
              {negative_marking ? <ToggleRight className="h-5 w-5 text-amber-600" /> : <ToggleLeft className="h-5 w-5 text-slate-400" />}
              {negative_marking ? 'Enabled' : 'Disabled'}
            </button>
          </Field>
        </div>
      </SectionCard>

      {/* ─── Schedule ───────────────────────────────────────────── */}
      <SectionCard title="Schedule" icon={<Calendar className="h-4 w-4 text-amber-500" />}>
        <div className="rounded-xl bg-navy-50 border border-navy-100 px-4 py-3 mb-4 text-xs text-navy-800 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <span>
            Once <strong>End time</strong> passes, the test is auto-evaluated server-side and a result Excel is
            emailed to the test creator and Admins about <strong>5 minutes</strong> after the end time.<strong>The Test will be deleted too.</strong> 
          </span>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          <Field label="Start time" required error={errors.start_time?.message}
                 hint={!canEditStartTime ? 'Locked (Can\'t Edit once test has started)' : 'In your local timezone.'}>
            <input
              type="datetime-local"
              disabled={!canEditStartTime}
              {...register('start_time')}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </Field>
          <Field label="End time" required error={errors.end_time?.message}
                 hint={startedAlready ? 'Locked (Can\'t Edit once test has started)' : undefined}>
            <input
              type="datetime-local"
              disabled={startedAlready}
              {...register('end_time')}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </Field>
          <Field label="Duration (minutes)" required error={errors.duration_minutes?.message}
                 hint={startedAlready ? 'Locked (Can\'t Edit once test has started)' : '5mins to 500mins — per-attempt countdown.'}>
            <Input
              // step=1 makes the integer intent explicit — without it some
              // browsers default to step=any and let fractional values slip
              // through, which then surprise the user when zod rounds.
              type="number" min={5} max={500} step={1}
              disabled={startedAlready}
              // ────────────────────────────────────────────────────────────
              // <input type="number"> has two notorious footguns that silently
              // decrement the value the user just typed:
              //   1. Scroll wheel — rotating the wheel while the input is
              //      focused changes the value (e.g. typing 300, scrolling
              //      the page, getting 299 or worse).
              //   2. ↑/↓/PgUp/PgDn keys — pressing ↓ once on a focused number
              //      input decrements by step (typing "300" then hitting ↓
              //      to move toward the Save button → 299).
              // We blur on wheel and prevent arrow/PgDn default to make the
              // typed value the only source of truth.
              // ────────────────────────────────────────────────────────────
              onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
              onKeyDown={(e) => {
                if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
                  e.preventDefault();
                }
              }}
              leftIcon={<Clock className="h-4 w-4" />}
              invalid={!!errors.duration_minutes}
              {...register('duration_minutes', { valueAsNumber: true })}
            />
          </Field>
        </div>
      </SectionCard>

      {/* ─── Assignments ────────────────────────────────────────── */}
      <SectionCard title="Participation" icon={<Calendar className="h-4 w-4 text-amber-500" />}>
        <p className="text-xs text-slate-500 mb-3">
          {mode === 'edit' && startedAlready
            ? 'Test has started — existing participation cannot be removed. You can still add new (dept × batch) pairs.'
            : mode === 'edit' && lockedAssignments.length > 0
              ? 'Existing participation can be removed (uncheck) or added. Removals take effect on save.'
              : 'Pick which (batch x department) pairs are assigned this test. At least one pair is required.'}
        </p>
        <AssignmentsPicker
          value={assignments}
          onChange={setAssignments}
          lockedEntries={lockedAssignments}
          startedAlready={startedAlready}
          // Picker emits this when the user unchecks a locked entry on a
          // not-started test. We move that entry OUT of lockedAssignments
          // (so it renders as unchecked) and INTO removedAssignments (which
          // becomes the `remove_assignments` payload on save).
          onRemoveLocked={(entry) => {
            setLockedAssignments(prev => prev.filter(
              a => !(a.dept_id === entry.dept_id && a.academic_year === entry.academic_year),
            ));
            setRemovedAssignments(prev => {
              // Dedupe: if the user does some toggle-uncheck-toggle dance,
              // we still only need one removal entry per pair.
              if (prev.some(p => p.dept_id === entry.dept_id && p.academic_year === entry.academic_year)) return prev;
              return [...prev, entry];
            });
          }}
        />
      </SectionCard>

      {/* ─── Mode + Content ─────────────────────────────────────── */}
      <SectionCard title="Question source" icon={<Wand2 className="h-4 w-4 text-amber-500" />}>
        {isIntelliExisting ? (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2 text-amber-800 text-sm mb-5">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Intelli-Pick test.</strong> Questions are auto-picked at creation and cannot be edited. Schedule, negative marking, and added participation are still editable. The chosen questions are shown below for reference.
              </div>
            </div>
            <ReadOnlyQuestionsList questions={existing?.questions ?? []} />
          </>
        ) : !canEditQuestions ? (
          <>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2 text-amber-800 text-sm mb-5">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                The test has already started — questions cannot be changed. Schedule, end time, and additional participation are still editable. The current questions are shown below for reference.
              </div>
            </div>
            <ReadOnlyQuestionsList questions={existing?.questions ?? []} />
          </>
        ) : (
          <>
            {mode === 'create' && (
              <div className="inline-flex rounded-xl bg-slate-100 p-1 mb-5">
                <button
                  type="button"
                  onClick={() => setIntelliMode(false)}
                  className={cn('px-4 h-9 text-sm font-semibold rounded-lg transition-colors',
                    !intelliMode ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-navy-800')}
                >
                  Make Questions
                </button>
                <button
                  type="button"
                  onClick={() => setIntelliMode(true)}
                  className={cn('px-4 h-9 text-sm font-semibold rounded-lg transition-colors',
                    intelliMode ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-navy-800')}
                >
                  Intelli-Pick
                </button>
              </div>
            )}

            {!intelliMode ? (
              <QuestionsEditor
                ref={editorRef}
                excelContext={{ parse: (file) => testsApi.parseExcel(file) }}
                initial={mode === 'edit' && existing
                  ? existing.questions.map(q => fromApiQuestion({
                      question_type: q.question_type,
                      question_text: q.question_text,
                      option_a: q.option_a ?? null,
                      option_b: q.option_b ?? null,
                      option_c: q.option_c ?? null,
                      option_d: q.option_d ?? null,
                      correct_answer: q.correct_answer,
                      marks: q.marks as 1 | 2,
                      question_image_url: q.question_image_url ?? null,
                      question_image_thumb_url: q.question_image_thumb_url ?? null,
                      question_image_delete_url: q.question_image_delete_url ?? null,
                    }))
                  : [newQuestion('MCQ')]}
              />
            ) : (
              <IntelliPickConfig state={intelli} onChange={setIntelli} />
            )}
          </>
        )}
      </SectionCard>

      {/* ─── Footer save ─────────────────────────────────────────── */}
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          loading={createMut.isPending || updateMut.isPending}
          onClick={handleSubmit(onValid)}
        >
          {mode === 'create' ? 'Create test' : 'Save changes'}
        </Button>
      </div>

      {mode === 'create' && intelliMode && (
        <p className="text-xs text-amber-700 mt-4 inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" /> Once Intelli-Pick is created, the resulting questions cannot be edited.
        </p>
      )}
    </PageContainer>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6 mb-5">
      <header className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="font-display font-bold text-navy-900">{title}</h2>
      </header>
      {children}
    </section>
  );
}

// ─── ReadOnlyQuestionsList ────────────────────────────────────────────────
// Displays the test's questions without any editing affordances. Rendered
// when the test has started (locked) or is Intelli-Pick. Shows everything
// the test creator might want to verify: text, options with the correct
// answer marked, marks, and any attached image.
function ReadOnlyQuestionsList({ questions }: {
  questions: Array<{
    question_id: number;
    question_type: 'MCQ' | 'MSQ' | 'NAT';
    question_text: string;
    option_a: string | null;
    option_b: string | null;
    option_c: string | null;
    option_d: string | null;
    correct_answer: string;
    marks: number;
    question_image_url: string | null;
    question_image_thumb_url: string | null;
  }>;
}) {
  if (!questions.length) {
    return (
      <p className="text-sm text-slate-500 italic">No questions to display.</p>
    );
  }

  // For MCQ/MSQ, correct_answer is a string like "A" or "A,C". Normalise to
  // a Set of single-letter keys so we can render a green ✓ on the right options.
  const correctSet = (q: { correct_answer: string }) =>
    new Set(q.correct_answer.split(',').map(s => s.trim().toUpperCase()));

  return (
    <ol className="space-y-3">
      {questions.map((q, i) => {
        const correct = correctSet(q);
        const opts = [
          { key: 'A', text: q.option_a },
          { key: 'B', text: q.option_b },
          { key: 'C', text: q.option_c },
          { key: 'D', text: q.option_d },
        ].filter(o => o.text != null);

        return (
          <li
            key={q.question_id}
            className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-navy-100 text-navy-700 text-xs font-bold shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider">
                    {q.question_type}
                  </span>
                  <span className="text-[0.7rem] text-slate-500">
                    {q.marks} mark{q.marks === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-sm text-navy-900 whitespace-pre-wrap leading-relaxed">
                  {q.question_text}
                </p>

                {q.question_image_url && (
                  <img
                    src={q.question_image_thumb_url || q.question_image_url}
                    alt="Question reference"
                    loading="lazy"
                    className="mt-2 max-h-48 rounded-lg border border-slate-200"
                  />
                )}

                {q.question_type === 'NAT' ? (
                  <div className="mt-3 text-xs text-slate-600">
                    Correct answer:{' '}
                    <span className="font-mono font-bold text-emerald-700">
                      {q.correct_answer || '—'}
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 grid sm:grid-cols-2 gap-2">
                    {opts.map(o => {
                      const isCorrect = correct.has(o.key);
                      return (
                        <div
                          key={o.key}
                          className={cn(
                            'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
                            isCorrect
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-white border-slate-200 text-slate-700',
                          )}
                        >
                          <span className={cn(
                            'grid h-5 w-5 place-items-center rounded-full text-[0.65rem] font-bold shrink-0',
                            isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600',
                          )}>
                            {o.key}
                          </span>
                          <span className="whitespace-pre-wrap leading-relaxed">{o.text}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
