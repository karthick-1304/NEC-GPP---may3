import { Flag } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { ZoomableImage } from './ZoomableImage';
import type { QuestionForAttempt, QuestionType } from '@/types/api';

interface Props {
  question: QuestionForAttempt;
  index: number;            // 1-based for display
  total: number;
  answer: string | null;    // current answer ('a', 'cd', '3.14', or '')
  onAnswerChange: (next: string | null) => void;
  flagged: boolean;
  onToggleFlag: () => void;
}

export const QuestionRenderer = ({
  question, index, total, answer, onAnswerChange, flagged, onToggleFlag,
}: Props) => {
  const optionLetters: Array<'a' | 'b' | 'c' | 'd'> = ['a', 'b', 'c', 'd'];
  const opts: Record<string, string | null> = {
    a: question.option_a, b: question.option_b, c: question.option_c, d: question.option_d,
  };

  return (
    <div className="card p-5 sm:p-7">
      <header className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-navy-800 text-white text-xs font-bold">
            {index}
          </span>
          <span className="text-xs text-slate-500">of {total}</span>
          <Badge tone={
            question.question_type === 'MCQ' ? 'sky' :
            question.question_type === 'MSQ' ? 'violet' : 'amber'
          }>{question.question_type}</Badge>
          <Badge tone="slate" size="sm">
            {question.marks} mark{question.marks > 1 ? 's' : ''}
          </Badge>
        </div>
        <button
          type="button"
          onClick={onToggleFlag}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors',
            flagged
              ? 'bg-amber-100 text-amber-800 border-amber-200'
              : 'text-slate-600 border-slate-200 hover:bg-slate-50',
          )}
          aria-pressed={flagged}
        >
          <Flag className={cn('h-3.5 w-3.5', flagged && 'fill-amber-400 text-amber-500')} />
          {flagged ? 'Flagged' : 'Flag for review'}
        </button>
      </header>

      <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap mb-4">
        {question.question_text}
      </div>

      {question.question_image_url && (
        <div className="mb-5">
          <ZoomableImage
            src={question.question_image_url}
            thumbSrc={question.question_image_thumb_url}
            alt="Question reference"
          />
        </div>
      )}

      {question.question_type === 'NAT'
        ? <NatInput value={answer ?? ''} onChange={onAnswerChange} />
        : (
          <div className="grid sm:grid-cols-2 gap-2.5">
            {optionLetters.map(L => opts[L] != null && (
              <OptionButton
                key={L}
                letter={L}
                text={opts[L]!}
                type={question.question_type}
                answer={answer}
                onAnswerChange={onAnswerChange}
              />
            ))}
          </div>
        )}

      {answer != null && answer !== '' && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onAnswerChange(null)}
            className="text-xs font-semibold text-slate-500 hover:text-red-600 transition-colors"
          >
            Clear answer
          </button>
        </div>
      )}
    </div>
  );
};

// ─── MCQ / MSQ option button ─────────────────────────────────────────────
function OptionButton({
  letter, text, type, answer, onAnswerChange,
}: {
  letter: 'a' | 'b' | 'c' | 'd';
  text: string;
  type: QuestionType;
  answer: string | null;
  onAnswerChange: (next: string) => void;
}) {
  const selected = (() => {
    if (type === 'MCQ') return answer === letter;
    if (type === 'MSQ') return (answer ?? '').toLowerCase().includes(letter);
    return false;
  })();

  const onClick = () => {
    if (type === 'MCQ') {
      onAnswerChange(letter);
    } else if (type === 'MSQ') {
      const cur = new Set((answer ?? '').toLowerCase().split('').filter(c => 'abcd'.includes(c)));
      if (cur.has(letter)) cur.delete(letter); else cur.add(letter);
      const next = Array.from(cur).sort().join('');
      onAnswerChange(next);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
        selected
          ? 'bg-navy-50 border-navy-400 ring-1 ring-navy-200'
          : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300',
      )}
    >
      <span className={cn(
        'grid h-7 w-7 place-items-center rounded-full font-bold text-sm shrink-0 mt-0.5',
        selected ? 'bg-navy-800 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200',
      )}>
        {letter.toUpperCase()}
      </span>
      <span className="text-sm text-slate-800 leading-relaxed">{text}</span>
    </button>
  );
}

// ─── NAT numeric input ───────────────────────────────────────────────────
function NatInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        Your numeric answer
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.\-]/g, '');
          onChange(v);
        }}
        placeholder="e.g. 3.1416"
        className="h-12 w-full max-w-xs rounded-xl border border-slate-300 bg-white px-4 text-base font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-navy-500"
      />
      <p className="mt-2 text-xs text-slate-500">
        Up to 4 decimal places · ±0.0001 tolerance applied during scoring (GATE rule).
      </p>
    </div>
  );
}
