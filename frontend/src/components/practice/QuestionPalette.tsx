import { Flag } from 'lucide-react';
import { cn } from '@/lib/cn';

export type QuestionStatus = 'answered' | 'visited' | 'unvisited';

export interface PaletteEntry {
  index: number;        // 1-based display position
  status: QuestionStatus;
  flagged: boolean;
  current: boolean;
}

interface Props {
  entries: PaletteEntry[];
  onJump: (idx0: number) => void;
  className?: string;
}

const statusBg: Record<QuestionStatus, string> = {
  answered:  'bg-emerald-500 text-white border-emerald-600',
  visited:   'bg-red-500 text-white border-red-600',       // visited but not answered
  unvisited: 'bg-white text-slate-600 border-slate-300',
};

export const QuestionPalette = ({ entries, onJump, className }: Props) => (
  <div className={cn('card p-4', className)}>
    <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Question palette</div>
    <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
      {entries.map((e) => (
        <button
          key={e.index}
          type="button"
          onClick={() => onJump(e.index - 1)}
          className={cn(
            'relative h-10 w-10 rounded-lg border text-sm font-bold transition',
            statusBg[e.status],
            e.current && 'ring-2 ring-amber-400 ring-offset-1 ring-offset-white',
          )}
          aria-label={`Question ${e.index} — ${e.status}${e.flagged ? ', flagged' : ''}`}
        >
          {e.index}
          {e.flagged && (
            <Flag className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 text-amber-500 fill-amber-400" />
          )}
        </button>
      ))}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-1.5 text-[0.65rem] text-slate-600">
      <Legend cls="bg-emerald-500" label="Answered" />
      <Legend cls="bg-red-500" label="Not answered" />
      <Legend cls="bg-white border border-slate-300" label="Not visited" />
      <Legend cls="bg-amber-400" label="Flagged" iconFlag />
    </div>
  </div>
);

const Legend = ({ cls, label, iconFlag }: { cls: string; label: string; iconFlag?: boolean }) => (
  <div className="inline-flex items-center gap-1.5">
    {iconFlag
      ? <Flag className="h-3 w-3 text-amber-500 fill-amber-400" />
      : <span className={cn('inline-block h-3 w-3 rounded', cls)} />}
    <span>{label}</span>
  </div>
);
