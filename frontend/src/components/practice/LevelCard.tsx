import { useNavigate, useParams } from 'react-router-dom';
import { Lock, ArrowRight, Layers, CheckCircle2, Sparkles, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { LevelInfo } from '@/types/api';

interface Props {
  level: LevelInfo;
  isStudent: boolean;
}

export const LevelCard = ({ level, isStudent }: Props) => {
  const { subjectId, topicId } = useParams<{ subjectId: string; topicId: string }>();
  const navigate = useNavigate();

  const isLocked   = isStudent && !!level.locked;
  const completed  = level.completed_sets ?? 0;
  const total      = level.set_count;
  const newAvailable = !!level.new_sets_available;
  // Empty levels block STUDENTS (nothing to attempt) but should let
  // collaborators in so they can create the first set.
  const blockedBecauseEmpty = isStudent && total === 0;
  const blocked = isLocked || blockedBecauseEmpty;

  const goSets = () => {
    if (blocked) return;
    navigate(`/practice/subjects/${subjectId}/topics/${topicId}/levels/${level.level}/sets`);
  };

  const accent = level.level === '1'
    ? { bg: 'bg-sky-50', icon: 'bg-sky-100 text-sky-700', accentText: 'text-sky-700' }
    : { bg: 'bg-violet-50', icon: 'bg-violet-100 text-violet-700', accentText: 'text-violet-700' };

  return (
    <div className={cn(
      'card card-hover p-6 sm:p-7 flex flex-col h-full overflow-hidden relative',
      isLocked && 'opacity-90 ring-1 ring-amber-200',
    )}>
      <div className={cn('absolute -top-12 -right-12 h-44 w-44 rounded-full opacity-60', accent.bg)} aria-hidden />

      <div className="relative flex items-start justify-between gap-3 mb-3">
        <div className={cn('grid h-12 w-12 place-items-center rounded-xl', accent.icon)}>
          <Layers className="h-5 w-5" />
        </div>
        {newAvailable && !isLocked && isStudent && (
          <Badge tone="amber" size="sm" icon={<Sparkles className="h-3 w-3" />}>New sets</Badge>
        )}
        {isLocked && (
          <Badge tone="red" size="sm" icon={<Lock className="h-3 w-3" />}>Complete Level 1 first</Badge>
        )}
      </div>

      <div className="relative">
        <h3 className="text-2xl font-display font-bold text-navy-900">{level.label}</h3>
        <p className={cn('text-sm font-medium mt-1', accent.accentText)}>
          {level.description}
        </p>
      </div>

      <div className="relative mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-[0.7rem] uppercase tracking-wider text-slate-500 font-semibold">Total sets</div>
          <div className="text-2xl font-bold text-navy-900 mt-0.5 leading-tight">{total}</div>
        </div>
        {isStudent ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-[0.7rem] uppercase tracking-wider text-emerald-700 font-semibold">Cleared</div>
            <div className="text-2xl font-bold text-emerald-800 mt-0.5 leading-tight flex items-center gap-1">
              {completed}<span className="text-base text-emerald-600 font-semibold">/{total}</span>
              {completed === total && total > 0 && (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 ml-auto" />
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[0.7rem] uppercase tracking-wider text-slate-500 font-semibold">Difficulty</div>
            <div className="text-base font-bold text-navy-900 mt-0.5 leading-tight inline-flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4 text-slate-400" />
              {level.level === '1' ? 'Intermediate' : 'Advanced'}
            </div>
          </div>
        )}
      </div>

      <div className="relative mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
        {isLocked ? (
          <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />Locked until Level 1 done
          </p>
        ) : (
          <p className="text-xs text-slate-400">
            {total === 0 ? 'No sets yet' : 'Tap to open sets'}
          </p>
        )}
        <Button
          size="sm"
          variant={blocked ? 'outline' : 'primary'}
          onClick={goSets}
          disabled={blocked}
          rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
        >
          {!isStudent && total === 0 ? 'Create sets' : 'View sets'}
        </Button>
      </div>
    </div>
  );
};
