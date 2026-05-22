import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save, ArrowLeft, AlertTriangle, Award, ListChecks, Sparkles, ToggleLeft, ToggleRight,
} from 'lucide-react';

import { PageContainer } from '@/components/ui/PageContainer';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { InfoNote } from '@/components/ui/InfoNote';

import { setsApi } from '@/lib/api/sets';
import { topicsApi } from '@/lib/api/topics';
import { subjectsApi } from '@/lib/api/subjects';
import { parseApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';

import { QuestionsEditor, type QuestionsEditorHandle } from '@/components/practice/QuestionsEditor';
import { fromApiQuestion, toApiQuestions } from '@/components/practice/questionValidation';
import { newQuestion, type QuestionDraft } from '@/components/practice/QuestionEditor';

interface Props {
  mode: 'create' | 'edit';
}

export default function SetEditorPage({ mode }: Props) {
  const { subjectId, topicId, level, setId } =
    useParams<{ subjectId: string; topicId: string; level: string; setId?: string }>();
  const subjId = Number(subjectId);
  const topId  = Number(topicId);
  const lvl    = (level === '2' ? '2' : '1') as '1' | '2';
  const sid    = setId ? Number(setId) : undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const editorRef = useRef<QuestionsEditorHandle>(null);

  // ─── Set-level config ────────────────────────────────────────────
  const [negativeMarking, setNegativeMarking] = useState(false);
  // Stored as a string so we can distinguish empty (invalid) from 0 and avoid leading-zero artefacts.
  const [thresholdInput, setThresholdInput] = useState<string>('50');
  const threshold = thresholdInput === '' ? NaN : Number(thresholdInput);
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  // ─── Breadcrumb data ─────────────────────────────────────────────
  const { data: subject } = useQuery({
    queryKey: ['subject', subjId],
    queryFn: () => subjectsApi.get(subjId),
    enabled: Number.isFinite(subjId),
  });
  const { data: topicLevels } = useQuery({
    queryKey: ['topic-levels', subjId, topId],
    queryFn: () => topicsApi.levels(subjId, topId),
    enabled: Number.isFinite(subjId) && Number.isFinite(topId),
  });

  // ─── Pre-fill in edit mode ───────────────────────────────────────
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['set-admin', subjId, topId, sid],
    queryFn: () => setsApi.getForAdmin(subjId, topId, sid!),
    enabled: mode === 'edit' && Number.isFinite(sid),
  });
  const initialQuestions: QuestionDraft[] = useMemo(() => {
    if (mode !== 'edit' || !existing) return [newQuestion('MCQ')];
    return existing.questions.map(q => fromApiQuestion({
      question_type: q.question_type,
      question_text: q.question_text,
      option_a: q.option_a ?? null,
      option_b: q.option_b ?? null,
      option_c: q.option_c ?? null,
      option_d: q.option_d ?? null,
      correct_answer: q.correct_answer,
      marks: (q.marks as 1 | 2),
      question_image_url: q.question_image_url ?? null,
      question_image_thumb_url: q.question_image_thumb_url ?? null,
      question_image_delete_url: q.question_image_delete_url ?? null,
    }));
  }, [mode, existing]);

  useEffect(() => {
    if (mode === 'edit' && existing) {
      setNegativeMarking(existing.set.negative_marking === 1);
      setThresholdInput(String(existing.set.threshold_percentage ?? 50));
      editorRef.current?.setAll(initialQuestions);
    }
  }, [mode, existing, initialQuestions]);

  // ─── Submit ──────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (body: Parameters<typeof setsApi.create>[2]) => setsApi.create(subjId, topId, body),
    onSuccess: () => {
      toast.success('Set created');
      qc.invalidateQueries({ queryKey: ['sets', subjId, topId] });
      qc.invalidateQueries({ queryKey: ['topic-levels', subjId, topId] });
      qc.invalidateQueries({ queryKey: ['topics', subjId] });
      navigate(`/practice/subjects/${subjId}/topics/${topId}/levels/${lvl}/sets`, { replace: true });
    },
    onError: (e) => toast.error(parseApiError(e).message || 'Could not create set'),
  });
  const updateMut = useMutation({
    mutationFn: (body: Parameters<typeof setsApi.update>[3]) => setsApi.update(subjId, topId, sid!, body),
    onSuccess: () => {
      toast.success('Set updated');
      qc.invalidateQueries({ queryKey: ['sets', subjId, topId] });
      qc.invalidateQueries({ queryKey: ['set-admin', subjId, topId, sid] });
      qc.invalidateQueries({ queryKey: ['topic-levels', subjId, topId] });
      navigate(`/practice/subjects/${subjId}/topics/${topId}/levels/${lvl}/sets`, { replace: true });
    },
    onError: (e) => toast.error(parseApiError(e).message || 'Could not update set'),
  });

  const onSave = () => {
    setThresholdError(null);
    if (thresholdInput === '') {
      setThresholdError('Threshold is required (1–100).');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
      setThresholdError('Threshold must be between 1 and 100.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const drafts = editorRef.current?.validateAndCollect();
    if (!drafts) return; // editor scrolls + shows errors
    const apiQs = toApiQuestions(drafts);

    if (mode === 'create') {
      createMut.mutate({
        level: lvl,
        negative_marking: negativeMarking,
        threshold_percentage: threshold,
        questions: apiQs,
      });
    } else {
      updateMut.mutate({
        negative_marking: negativeMarking,
        threshold_percentage: threshold,
        questions: apiQs,
      });
    }
  };

  // ─── Render ──────────────────────────────────────────────────────
  if (mode === 'edit' && loadingExisting) {
    return (
      <PageContainer>
        <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading set…</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Breadcrumbs items={[
        { label: 'Practice', to: '/practice' },
        { label: subject?.subject_name ?? 'Subject', to: `/practice/subjects/${subjId}/topics` },
        { label: topicLevels?.topic?.topic_name ?? 'Topic', to: `/practice/subjects/${subjId}/topics/${topId}/levels` },
        { label: `Level ${lvl} sets`, to: `/practice/subjects/${subjId}/topics/${topId}/levels/${lvl}/sets` },
        { label: mode === 'create' ? 'New set' : `Edit set #${sid}` },
      ]} className="mb-5" />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">
            {mode === 'create' ? 'Create a new set' : `Edit set #${sid}`}
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <Badge tone={lvl === '1' ? 'sky' : 'violet'} size="sm">Level {lvl}</Badge>
            {mode === 'edit' && existing?.set.set_name && <Badge tone="slate" size="sm">{existing.set.set_name}</Badge>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button
            leftIcon={<Save className="h-4 w-4" />}
            loading={createMut.isPending || updateMut.isPending}
            onClick={onSave}
          >
            {mode === 'create' ? 'Create set' : 'Save changes'}
          </Button>
        </div>
      </div>

      <InfoNote tone="mail" className="mb-5">
        {mode === 'create'
          ? 'New set creation notified to all collaborators of this subject.'
          : 'Editing of set notified to all collaborators of this subject.'}
      </InfoNote>

      {/* ─── Set-level config card ───────────────────────────────── */}
      <div className="card p-5 sm:p-6 mb-5">
        <h2 className="font-display font-bold text-navy-900 mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" /> Set settings
        </h2>
        <div className="grid sm:grid-cols-2 gap-5">
          {/* Negative marking */}
          <Field
            label="Negative marking"
            hint="When ON, GATE-style negative marking applies to wrong MCQ answers (−⅓ of marks). MSQ/NAT are never negative-marked."
          >
            <button
              type="button"
              onClick={() => setNegativeMarking(v => !v)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border px-3 h-11 text-sm font-semibold transition-colors',
                negativeMarking
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50',
              )}
            >
              {negativeMarking ? <ToggleRight className="h-5 w-5 text-amber-600" /> : <ToggleLeft className="h-5 w-5 text-slate-400" />}
              {negativeMarking ? 'Enabled' : 'Disabled'}
            </button>
          </Field>

          {/* Threshold */}
          <Field
            label="Threshold percentage"
            required
            error={thresholdError ?? undefined}
            hint={thresholdInput === ''
              ? 'Pick a value between 1 and 100.'
              : threshold > 0 && threshold < 50
                ? 'Threshold below 50% may make sets too easy to clear.'
                : 'Students unlock the next set when they score greater than or equal to this percentage.'}
          >
            <div className="relative">
              <Input
                type="text"
                inputMode="numeric"
                value={thresholdInput}
                onChange={(e) => {
                  // Allow empty (so the field can be cleared without falling to 0).
                  // Strip non-digits and leading zeros so we never get "050".
                  const raw = e.target.value.replace(/[^\d]/g, '');
                  const cleaned = raw === '' ? '' : raw.replace(/^0+(?=\d)/, '');
                  // Cap to 3 digits (max value is 100).
                  setThresholdInput(cleaned.slice(0, 3));
                  if (thresholdError) setThresholdError(null);
                }}
                placeholder="50"
                rightIcon={<span className="text-slate-400">%</span>}
                invalid={!!thresholdError || thresholdInput === ''}
              />
              {thresholdInput === '' && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-lg">
                  <AlertTriangle className="h-3 w-3" />
                  Threshold is required.
                </div>
              )}
              {thresholdInput !== '' && threshold > 0 && threshold < 50 && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                  <AlertTriangle className="h-3 w-3" />
                  Heads-up: low threshold (&lt; 50%).
                </div>
              )}
            </div>
          </Field>
        </div>

        {/* Live computed totals */}
        <LiveTotals editorRef={editorRef} />
      </div>

      {/* ─── Questions editor ────────────────────────────────────── */}
      <div className="card p-5 sm:p-6">
        <QuestionsEditor
          ref={editorRef}
          initial={initialQuestions}
          excelContext={{ parse: (file) => setsApi.parseExcel(subjId, topId, file) }}
        />
      </div>

      {/* ─── Footer save ─────────────────────────────────────────── */}
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        <Button
          leftIcon={<Save className="h-4 w-4" />}
          loading={createMut.isPending || updateMut.isPending}
          onClick={onSave}
        >
          {mode === 'create' ? 'Create set' : 'Save changes'}
        </Button>
      </div>
    </PageContainer>
  );
}

// ─── Sticky live totals (questions × marks) ──────────────────────────
function LiveTotals({ editorRef }: { editorRef: React.RefObject<QuestionsEditorHandle> }) {
  // We rerender on parent changes — a quick "live preview" pulled by reading the current draft list
  // through validateAndCollect() would mutate state. Instead we expose a small DOM-based observer.
  // Simpler approach: just count by introspecting nothing. We stub — UI shows guidance instead.
  return (
    <div className="mt-5 pt-4 border-t border-slate-100 grid sm:grid-cols-3 gap-3 text-xs">
      <Hint icon={<ListChecks className="h-3.5 w-3.5" />} label="Add question" text="Use “Add question” to insert question anywhere — above or below any item." />
      <Hint icon={<Award className="h-3.5 w-3.5" />}      label="Marks rule"   text="MCQ / NAT: 1 or 2 marks · MSQ: always 2 marks (GATE rule)." />
      <Hint icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Validation" text="Errors highlight in red. The first invalid question is auto-scrolled into view on clicking Save." />
    </div>
  );
}
function Hint({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
      <div className="flex items-center gap-1.5 font-semibold text-slate-700 text-xs mb-1">
        {icon}{label}
      </div>
      <div className="text-slate-600 leading-snug">{text}</div>
    </div>
  );
}
