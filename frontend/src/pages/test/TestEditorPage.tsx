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
      const body: Parameters<typeof testsApi.update>[1] = {
        test_name: form.test_name.trim(),
        end_time: endISO,
        duration_minutes: form.duration_minutes,
        negative_marking: form.negative_marking,
      };
      if (canEditStartTime) body.start_time = startISO;
      if (assignments.length) {
        body.assignments = assignments.map(a => ({ dept_id: a.dept_id, academic_year: a.academic_year }));
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
                 hint={!canEditStartTime ? 'Locked — test has started.' : 'In your local timezone.'}>
            <input
              type="datetime-local"
              disabled={!canEditStartTime}
              {...register('start_time')}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </Field>
          <Field label="End time" required error={errors.end_time?.message}>
            <input
              type="datetime-local"
              {...register('end_time')}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            />
          </Field>
          <Field label="Duration (minutes)" required error={errors.duration_minutes?.message}
                 hint="5 to 500 — drives the per-attempt countdown.">
            <Input
              type="number" min={5} max={500}
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
          {mode === 'edit' && lockedAssignments.length > 0
            ? 'Existing participation cannot be removed — only new (dept × batch) pairs can be added.'
            : 'Pick which (department × batch) pairs are assigned this test. At least one pair is required.'}
        </p>
        <AssignmentsPicker
          value={assignments}
          onChange={setAssignments}
          lockedEntries={lockedAssignments}
          startedAlready={startedAlready}
        />
      </SectionCard>

      {/* ─── Mode + Content ─────────────────────────────────────── */}
      <SectionCard title="Question source" icon={<Wand2 className="h-4 w-4 text-amber-500" />}>
        {isIntelliExisting ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2 text-amber-800 text-sm">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <strong>Intelli-Pick test.</strong> Questions are auto-picked at creation and cannot be edited. Schedule, negative marking, and added participation are still editable.
            </div>
          </div>
        ) : !canEditQuestions ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-2 text-amber-800 text-sm">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              The test has already started — questions cannot be changed. Schedule, end time, and additional participation are still editable.
            </div>
          </div>
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
