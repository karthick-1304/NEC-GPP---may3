import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Plus, FileSpreadsheet, Download } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { parseApiError } from '@/lib/api/client';
import axios from 'axios';

import { QuestionEditor, newQuestion, type QuestionDraft, type QuestionFieldErrors } from './QuestionEditor';
import { validateAll, fromApiQuestion } from './questionValidation';
import type { QuestionInput } from '@/lib/api/sets';

export interface QuestionsEditorHandle {
  /** Validate everything, scroll to the first invalid question, and return drafts (or null if invalid). */
  validateAndCollect: () => QuestionDraft[] | null;
  setAll: (drafts: QuestionDraft[]) => void;
}

interface Props {
  initial?: QuestionDraft[];
  /**
   * When non-null, enables the "Import from Excel" button.
   * `parse` is the API call to send the chosen file to the backend.
   * Set editor passes setsApi.parseExcel; Test editor passes testsApi.parseExcel.
   */
  excelContext: {
    parse: (file: File) => Promise<{ parsed: QuestionInput[]; total: number; valid_count: number }>;
  } | null;
}

export const QuestionsEditor = forwardRef<QuestionsEditorHandle, Props>(({ initial, excelContext }, ref) => {
  const [questions, setQuestions] = useState<QuestionDraft[]>(initial && initial.length ? initial : [newQuestion('MCQ')]);
  const [errors, setErrors] = useState<Map<number, QuestionFieldErrors>>(new Map());
  const itemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [excelDialog, setExcelDialog] = useState<{ open: boolean; parsed: QuestionDraft[] }>({ open: false, parsed: [] });
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelErrors, setExcelErrors] = useState<Array<{ row: number; messages: string[] }>>([]);

  useImperativeHandle(ref, () => ({
    validateAndCollect: () => {
      const map = validateAll(questions);
      setErrors(map);
      if (map.size === 0) return questions;
      // Scroll to first invalid
      const firstIdx = Math.min(...Array.from(map.keys()));
      const key = questions[firstIdx]?._key;
      const el = key ? itemRefs.current.get(key) : null;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast.error(`Please fix question ${firstIdx + 1} — ${map.size} question${map.size > 1 ? 's have' : ' has'} errors.`);
      }
      return null;
    },
    setAll: (drafts: QuestionDraft[]) => {
      setQuestions(drafts.length ? drafts : [newQuestion('MCQ')]);
      setErrors(new Map());
    },
  }), [questions]);

  // ─── Local mutators ──────────────────────────────────────────────
  const updateAt = (idx: number, next: QuestionDraft) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? next : q));
    setErrors(prev => { const m = new Map(prev); m.delete(idx); return m; });
  };
  const removeAt = (idx: number) => {
    if (questions.length === 1) {
      toast.warning('Set must have at least one question.');
      return;
    }
    setQuestions(prev => prev.filter((_, i) => i !== idx));
    setErrors(new Map());
  };
  const insertAt = (idx: number) => {
    const fresh = newQuestion('MCQ');
    setQuestions(prev => {
      const copy = [...prev];
      copy.splice(idx, 0, fresh);
      return copy;
    });
    setErrors(new Map());
    // Scroll to the new question on next paint
    requestAnimationFrame(() => {
      const el = itemRefs.current.get(fresh._key);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };
  const appendAtEnd = () => insertAt(questions.length);

  // ─── Excel parse ─────────────────────────────────────────────────
  const onPickExcel = async (file: File) => {
    if (!excelContext) return;
    setExcelBusy(true);
    setExcelErrors([]);
    try {
      const r = await excelContext.parse(file);
      const drafts = r.parsed.map(fromApiQuestion);
      setExcelDialog({ open: true, parsed: drafts });
      toast.success(`Parsed ${r.valid_count} questions from Excel`);
    } catch (err) {
      // Custom backend response: { status: 'fail', errors: [{ row, errors:[] }], total, error_count }
      if (axios.isAxiosError(err) && err.response?.data?.errors) {
        const data = err.response.data as { errors: Array<{ row: number; errors: string[] }>; error_count: number; total: number };
        setExcelErrors(data.errors.map(e => ({ row: e.row, messages: e.errors })));
        toast.error(`Excel had ${data.error_count} error${data.error_count > 1 ? 's' : ''} across ${data.total} rows`);
      } else {
        toast.error(parseApiError(err).message || 'Could not parse Excel');
      }
    } finally {
      setExcelBusy(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerExcel = () => fileInputRef.current?.click();

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-display font-bold text-navy-900 text-lg">
          Questions <span className="text-slate-400 font-medium">({questions.length})</span>
        </h2>
        <div className="flex items-center gap-2">
          {excelContext && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files && e.target.files[0] && onPickExcel(e.target.files[0])}
              />
              <a
                href="/samples/set_questions_sample.xlsx"
                download
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 h-10 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                title="Download a sample Excel file with MCQ / MSQ / NAT examples"
              >
                <Download className="h-4 w-4" />
                Sample
              </a>
              <Button
                type="button"
                variant="outline"
                size="md"
                leftIcon={<FileSpreadsheet className="h-4 w-4" />}
                loading={excelBusy}
                onClick={triggerExcel}
              >
                Import from Excel
              </Button>
            </>
          )}
          <Button type="button" variant="primary" size="md" leftIcon={<Plus className="h-4 w-4" />} onClick={appendAtEnd}>
            Add question
          </Button>
        </div>
      </div>

      {excelErrors.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 mb-4">
          <div className="font-semibold text-red-700 mb-2 text-sm">Excel parsing errors</div>
          <ul className="text-xs text-red-700 space-y-1 max-h-48 overflow-auto">
            {excelErrors.slice(0, 100).map((e, i) => (
              <li key={i}>
                <span className="font-semibold">Row {e.row}:</span>{' '}
                {e.messages.join('; ')}
              </li>
            ))}
            {excelErrors.length > 100 && <li>… and {excelErrors.length - 100} more</li>}
          </ul>
          <p className="text-xs text-red-700 mt-2">Fix and re-upload, or add questions manually below.</p>
        </div>
      )}

      <div>
        {/* Top adder — insert before question #1 */}
        <EndAdd onClick={() => insertAt(0)} top />

        {questions.map((q, idx) => (
          <div key={q._key}>
            {/* One inline "+ Add question" between adjacent questions */}
            {idx > 0 && <InlineAdd onClick={() => insertAt(idx)} />}
            <QuestionEditor
              ref={(el) => { itemRefs.current.set(q._key, el); }}
              index={idx + 1}
              question={q}
              errors={errors.get(idx)}
              onChange={(n) => updateAt(idx, n)}
              onDelete={() => removeAt(idx)}
              onAddBefore={() => insertAt(idx)}
              onAddAfter={() => insertAt(idx + 1)}
              isFirst={idx === 0}
              isLast={idx === questions.length - 1}
            />
          </div>
        ))}

        {/* Final "+ Add Question" appender */}
        <EndAdd onClick={appendAtEnd} />
      </div>

      {/* ─── Excel parse confirm: replace existing? ──────────────── */}
      <ConfirmDialog
        open={excelDialog.open}
        onOpenChange={(o) => setExcelDialog(s => ({ ...s, open: o }))}
        title="Replace current questions with Excel?"
        description={`We parsed ${excelDialog.parsed.length} valid questions. Click Replace to discard the current ${questions.length} question${questions.length > 1 ? 's' : ''} and use the Excel data, or Cancel to keep what you have.`}
        confirmText="Replace"
        destructive
        onConfirm={() => {
          setQuestions(excelDialog.parsed);
          setErrors(new Map());
          setExcelDialog({ open: false, parsed: [] });
        }}
      />
    </>
  );
});
QuestionsEditor.displayName = 'QuestionsEditor';

const InlineAdd = ({ onClick }: { onClick: () => void }) => (
  <div className="flex items-center my-3 group">
    <span className="flex-1 h-px bg-slate-200 group-hover:bg-amber-300 transition-colors" />
    <button
      type="button"
      onClick={onClick}
      className="mx-2 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 h-8 text-xs font-semibold text-slate-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors"
    >
      <Plus className="h-3.5 w-3.5" /> Add Question
    </button>
    <span className="flex-1 h-px bg-slate-200 group-hover:bg-amber-300 transition-colors" />
  </div>
);

const EndAdd = ({ onClick, top }: { onClick: () => void; top?: boolean }) => (
  <div className={`flex justify-center ${top ? 'mb-3' : 'mt-4'}`}>
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-white px-4 h-9 text-xs font-semibold text-slate-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors"
    >
      <Plus className="h-3.5 w-3.5" /> Add Question
    </button>
  </div>
);
