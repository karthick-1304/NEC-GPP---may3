import { forwardRef, useMemo } from 'react';
import { Trash2, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ImageUploader } from './ImageUploader';
import { cn } from '@/lib/cn';
import type { QuestionType } from '@/types/api';

export interface QuestionDraft {
  _key: string;
  question_type: QuestionType;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  marks: 1 | 2;
  question_image_url: string | null;
  question_image_thumb_url: string | null;
  question_image_delete_url: string | null;
  /**
   * Internal stash so switching MCQ/MSQ → NAT and back doesn't wipe the user's
   * options + correct answer. Holds the last MCQ/MSQ payload before going NAT.
   */
  _stash?: {
    option_a: string; option_b: string; option_c: string; option_d: string;
    correct_answer: string;
    type: 'MCQ' | 'MSQ';
  };
}

export type QuestionFieldErrors = Partial<Record<
  'question_text' | 'option_a' | 'option_b' | 'option_c' | 'option_d' | 'correct_answer' | 'marks',
  string
>>;

interface Props {
  index: number;            // 1-based for label
  question: QuestionDraft;
  errors?: QuestionFieldErrors;
  onChange: (next: QuestionDraft) => void;
  onDelete: () => void;
  onAddBefore: () => void;
  onAddAfter: () => void;
  isFirst: boolean;
  isLast: boolean;
}

const TYPE_TONES: Record<QuestionType, 'sky' | 'violet' | 'amber'> = {
  MCQ: 'sky', MSQ: 'violet', NAT: 'amber',
};

export const QuestionEditor = forwardRef<HTMLDivElement, Props>(
  ({ index, question, errors, onChange, onDelete, onAddBefore, onAddAfter, isFirst, isLast }, ref) => {
    const setField = <K extends keyof QuestionDraft>(k: K, v: QuestionDraft[K]) =>
      onChange({ ...question, [k]: v });

    const switchType = (type: QuestionType) => {
      if (type === question.question_type) return;
      const cur = question.question_type;

      // MCQ/MSQ → NAT: stash the options + answer so we can restore them later.
      if ((cur === 'MCQ' || cur === 'MSQ') && type === 'NAT') {
        onChange({
          ...question,
          question_type: 'NAT',
          option_a: '', option_b: '', option_c: '', option_d: '',
          correct_answer: '',
          marks: 1,
          _stash: {
            option_a: question.option_a, option_b: question.option_b,
            option_c: question.option_c, option_d: question.option_d,
            correct_answer: question.correct_answer,
            type: cur,
          },
        });
        return;
      }

      // NAT → MCQ/MSQ: pop the stash if present.
      if (cur === 'NAT' && (type === 'MCQ' || type === 'MSQ')) {
        const stash = question._stash;
        onChange({
          ...question,
          question_type: type,
          option_a: stash?.option_a ?? '',
          option_b: stash?.option_b ?? '',
          option_c: stash?.option_c ?? '',
          option_d: stash?.option_d ?? '',
          // Restore answer only if we're going back to the same type the stash was from.
          correct_answer: stash && stash.type === type ? stash.correct_answer : '',
          marks: type === 'MSQ' ? 2 : 1,
          _stash: undefined,
        });
        return;
      }

      // MCQ ↔ MSQ: keep the options, reset the answer (semantics differ).
      onChange({
        ...question,
        question_type: type,
        correct_answer: '',
        marks: type === 'MSQ' ? 2 : 1,
      });
    };

    const hasError = !!errors && Object.keys(errors).length > 0;

    return (
      <>
        <div
          ref={ref}
          className={cn(
            'card p-5 sm:p-6 space-y-4 transition',
            hasError && 'ring-2 ring-red-300 border-red-200',
          )}
        >
          {/* ─── Header ────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-navy-800 text-white text-xs font-bold">
                {index}
              </span>
              <Badge tone={TYPE_TONES[question.question_type]}>{question.question_type}</Badge>
              <Badge tone="slate" size="sm">{question.marks} mark{question.marks > 1 ? 's' : ''}</Badge>
            </div>
            <button
              type="button"
              onClick={onDelete}
              className="grid h-8 w-8 place-items-center rounded-lg text-red-600 hover:bg-red-50"
              aria-label="Delete question"
              title="Delete question"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* ─── Type switcher ─────────────────────────────────────── */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Type</div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {(['MCQ', 'MSQ', 'NAT'] as QuestionType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchType(t)}
                  className={cn(
                    'px-4 h-9 text-sm font-semibold rounded-lg transition-colors',
                    question.question_type === t
                      ? 'bg-white text-navy-900 shadow-sm'
                      : 'text-slate-600 hover:text-navy-800',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {question.question_type === 'MCQ' && 'Multiple Choice — exactly one correct option (a/b/c/d).'}
              {question.question_type === 'MSQ' && 'Multiple Select — one or more correct options.'}
              {question.question_type === 'NAT' && 'Numerical Answer Type — answer must be a numeric value. Up to 4 decimals.'}
            </p>
          </div>

          {/* ─── Question text ─────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Question text <span className="text-red-500">*</span>
            </label>
            <textarea
              value={question.question_text}
              onChange={(e) => setField('question_text', e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Type the question…"
              className={cn(
                'block w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 resize-y',
                'focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-navy-500',
                errors?.question_text ? 'border-red-400 focus:ring-red-400/40 focus:border-red-500' : 'border-slate-300',
              )}
            />
            {errors?.question_text && <p className="text-xs font-medium text-red-600 mt-1">{errors.question_text}</p>}
          </div>

          {/* ─── Image ─────────────────────────────────────────────── */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Image (optional)</div>
            <ImageUploader
              imageUrl={question.question_image_url}
              thumbUrl={question.question_image_thumb_url}
              onUploaded={(u) => onChange({
                ...question,
                question_image_url: u.url,
                question_image_thumb_url: u.thumb_url,
                question_image_delete_url: u.delete_url,
              })}
              onRemove={() => onChange({
                ...question,
                question_image_url: null,
                question_image_thumb_url: null,
                question_image_delete_url: null,
              })}
            />
          </div>

          {/* ─── Type-specific body ────────────────────────────────── */}
          {question.question_type !== 'NAT' ? (
            <McqMsqBody
              type={question.question_type}
              question={question}
              errors={errors}
              onChange={onChange}
            />
          ) : (
            <NatBody question={question} errors={errors} onChange={onChange} />
          )}

          {/* ─── Marks ─────────────────────────────────────────────── */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Marks</div>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {([1, 2] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  disabled={question.question_type === 'MSQ' && m === 1}
                  onClick={() => setField('marks', m)}
                  className={cn(
                    'px-4 h-9 text-sm font-bold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                    question.marks === m
                      ? 'bg-amber-400 text-navy-900 shadow-sm ring-2 ring-amber-300'
                      : 'text-slate-600 hover:bg-white hover:text-navy-800',
                  )}
                >
                  {m} mark{m > 1 ? 's' : ''}
                </button>
              ))}
            </div>
            {question.question_type === 'MSQ' && (
              <p className="text-xs text-slate-500 mt-1.5">GATE rule: MSQ questions are always 2 marks.</p>
            )}
            {errors?.marks && <p className="text-xs font-medium text-red-600 mt-1">{errors.marks}</p>}
          </div>
        </div>
      </>
    );
  },
);
QuestionEditor.displayName = 'QuestionEditor';

// ─── MCQ / MSQ body ─────────────────────────────────────────────────────
function McqMsqBody({
  type, question, errors, onChange,
}: { type: 'MCQ' | 'MSQ'; question: QuestionDraft; errors?: QuestionFieldErrors; onChange: (q: QuestionDraft) => void; }) {
  const letters: Array<'a' | 'b' | 'c' | 'd'> = ['a', 'b', 'c', 'd'];
  const fieldKey = (L: 'a' | 'b' | 'c' | 'd') => (`option_${L}` as 'option_a' | 'option_b' | 'option_c' | 'option_d');

  const selectedSet = useMemo(() => new Set(
    type === 'MSQ'
      ? (question.correct_answer || '').toLowerCase().split('').filter(c => 'abcd'.includes(c))
      : [question.correct_answer.toLowerCase()].filter(c => 'abcd'.includes(c)),
  ), [type, question.correct_answer]);

  const setCorrect = (L: 'a' | 'b' | 'c' | 'd') => {
    if (type === 'MCQ') {
      onChange({ ...question, correct_answer: L });
    } else {
      const next = new Set(selectedSet);
      if (next.has(L)) next.delete(L); else next.add(L);
      const sorted = Array.from(next).sort().join('');
      onChange({ ...question, correct_answer: sorted });
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Options & correct answer</span>
        <span className="text-xs text-slate-400">
          {type === 'MCQ' ? 'Pick one correct option' : 'Tick all correct options'}
        </span>
      </div>
      {letters.map(L => (
        <OptionRow
          key={L}
          letter={L}
          value={question[fieldKey(L)]}
          onChange={(v) => onChange({ ...question, [fieldKey(L)]: v })}
          error={errors?.[fieldKey(L)]}
          isCorrect={selectedSet.has(L)}
          onToggleCorrect={() => setCorrect(L)}
          mode={type}
        />
      ))}
      {errors?.correct_answer && <p className="text-xs font-medium text-red-600">{errors.correct_answer}</p>}
    </div>
  );
}

function OptionRow({
  letter, value, onChange, error, isCorrect, onToggleCorrect, mode,
}: {
  letter: 'a' | 'b' | 'c' | 'd';
  value: string;
  onChange: (v: string) => void;
  error?: string;
  isCorrect: boolean;
  onToggleCorrect: () => void;
  mode: 'MCQ' | 'MSQ';
}) {
  return (
    <div className="space-y-1">
      <div className={cn(
        'flex items-stretch gap-2 rounded-xl border bg-white transition-colors',
        isCorrect ? 'border-emerald-400 ring-1 ring-emerald-200' : 'border-slate-300',
        error && 'border-red-400 ring-1 ring-red-200',
      )}>
        {/* Letter tag */}
        <button
          type="button"
          onClick={onToggleCorrect}
          className={cn(
            'grid place-items-center w-12 rounded-l-xl font-bold text-sm shrink-0 transition-colors',
            isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          )}
          title={`Mark option ${letter.toUpperCase()} as correct`}
          aria-label={`Toggle correct: option ${letter.toUpperCase()}`}
        >
          {isCorrect ? '✓' : letter.toUpperCase()}
        </button>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Option ${letter.toUpperCase()}`}
          maxLength={2000}
          className="h-11 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-slate-400"
        />
        <span className="hidden sm:flex items-center pr-3 text-[0.7rem] uppercase tracking-wider text-slate-400">
          {mode === 'MCQ' ? 'radio' : 'check'}
        </span>
      </div>
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

// ─── NAT body ───────────────────────────────────────────────────────────
function NatBody({ question, errors, onChange }: { question: QuestionDraft; errors?: QuestionFieldErrors; onChange: (q: QuestionDraft) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        Correct numeric answer <span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={question.correct_answer}
        onChange={(e) => onChange({ ...question, correct_answer: e.target.value.replace(/[^\d.\-]/g, '') })}
        placeholder="e.g. 3.1416"
        className={cn(
          'h-11 w-full max-w-xs rounded-xl border bg-white px-4 text-sm font-mono',
          'focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-navy-500',
          errors?.correct_answer ? 'border-red-400' : 'border-slate-300',
        )}
      />
      <p className="text-xs text-slate-500 mt-1.5">Up to 4 decimal places. Stored as a string for tolerance comparison.</p>
      {errors?.correct_answer && <p className="text-xs font-medium text-red-600 mt-1">{errors.correct_answer}</p>}
    </div>
  );
}

// ─── Add Question divider ───────────────────────────────────────────────
function AddQuestionRow({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex items-center my-2 group">
      <span className="flex-1 h-px bg-slate-200 group-hover:bg-amber-300 transition-colors" />
      <button
        type="button"
        onClick={onClick}
        className="mx-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 h-8 text-xs font-semibold text-slate-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add question here
      </button>
      <span className="flex-1 h-px bg-slate-200 group-hover:bg-amber-300 transition-colors" />
    </div>
  );
}

// Export sentinel helpers for the parent
export const newQuestion = (type: QuestionType = 'MCQ'): QuestionDraft => ({
  _key: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `q-${Math.random().toString(36).slice(2)}-${Date.now()}`,
  question_type: type,
  question_text: '',
  option_a: type === 'NAT' ? '' : '',
  option_b: type === 'NAT' ? '' : '',
  option_c: type === 'NAT' ? '' : '',
  option_d: type === 'NAT' ? '' : '',
  correct_answer: '',
  marks: type === 'MSQ' ? 2 : 1,
  question_image_url: null,
  question_image_thumb_url: null,
  question_image_delete_url: null,
});

// Re-export icons for the parent's "first add" button
export { Plus as AddIcon, ArrowUp, ArrowDown };
