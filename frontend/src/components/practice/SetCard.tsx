import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import {
  MoreVertical, Pencil, Trash2, Download, Play,
  Lock, AlertTriangle, CheckCircle2, ListChecks, Sparkles, Award,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/Dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/Dropdown';

import { setsApi } from '@/lib/api/sets';
import { parseApiError } from '@/lib/api/client';
import { downloadBlob, downloadCoreAndAttempts } from '@/lib/download';
import { cn } from '@/lib/cn';
import type { PracticeSet } from '@/types/api';
import { useAuth } from '@/lib/auth/AuthContext';

interface Props {
  set: PracticeSet;
  isCollaborator: boolean;
  isSuperAccess: boolean;
}

export const SetCard = ({ set, isCollaborator, isSuperAccess }: Props) => {
  const { subjectId, topicId } = useParams<{ subjectId: string; topicId: string }>();
  const subjId = Number(subjectId);
  const topId  = Number(topicId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [confirmDelete, setConfirmDelete] = useState(false);

  const isStudent = user?.role === 'Student';
  const isLocked  = isStudent && !!set.locked;
  const isCompleted = !!set.is_completed;

  // Two-stage delete: first download both exports locally (so the user
  // performing the action keeps a copy on their device), THEN fire the
  // DELETE. If the download step fails the delete is aborted entirely.
  const removeMut = useMutation({
    mutationFn: async () => {
      const setLabel = set.set_name ?? `set_${set.set_id}`;
      await downloadCoreAndAttempts(setLabel, (type) =>
        setsApi.exportBlob(subjId, topId, set.set_id, type),
      );
      return setsApi.remove(subjId, topId, set.set_id);
    },
    onSuccess: () => {
      toast.success(`${set.set_name ?? 'Set'} deleted. Local copy downloaded; collaborators emailed.`);
      qc.invalidateQueries({ queryKey: ['sets', subjId, topId] });
      qc.invalidateQueries({ queryKey: ['topics', subjId] });
      qc.invalidateQueries({ queryKey: ['topic-levels', subjId, topId] });
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(parseApiError(e).message || 'Could not export — deletion cancelled.'),
  });

  const onExport = async (type: 'core' | 'attempts') => {
    try {
      const blob = await setsApi.exportBlob(subjId, topId, set.set_id, type);
      downloadBlob(blob, `set_${set.set_id}_${type}_${Date.now()}.xlsx`);
      toast.success(`Export ready — ${type}`);
    } catch (e) {
      toast.error(parseApiError(e).message);
    }
  };

  const startPractice = () => {
    if (isLocked) return;
    navigate(`/practice/subjects/${subjId}/topics/${topId}/levels/${set.level}/sets/${set.set_id}/attempt`);
  };

  const editSet = () => {
    navigate(`/practice/subjects/${subjId}/topics/${topId}/levels/${set.level}/sets/${set.set_id}/edit`);
  };

  return (
    <>
      <div className={cn(
        'card card-hover p-5 flex flex-col h-full relative',
        isLocked && 'opacity-95 ring-1 ring-amber-200',
        isCompleted && 'ring-1 ring-emerald-200',
      )}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 text-navy-700 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider border border-navy-100">
              {set.set_name ?? `Set ${set.display_order}`}
            </span>
            <Badge tone={set.level === '1' ? 'sky' : 'violet'} size="sm">
              Level {set.level}
            </Badge>
            {!!set.negative_marking && (
              <Badge tone="amber" size="sm" icon={<AlertTriangle className="h-3 w-3" />}>Neg marking</Badge>
            )}
            {isCompleted && (
              <Badge tone="green" size="sm" icon={<CheckCircle2 className="h-3 w-3" />}>Cleared</Badge>
            )}
          </div>

          {isCollaborator && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-navy-800 -mr-1 -mt-1"
                  aria-label="Set actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Set actions</DropdownMenuLabel>
                <DropdownMenuItem icon={<Pencil className="h-4 w-4" />} onSelect={editSet}>
                  Edit set
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<Download className="h-4 w-4" />} onSelect={() => onExport('core')}>
                  Export — core
                </DropdownMenuItem>
                <DropdownMenuItem icon={<Download className="h-4 w-4" />} onSelect={() => onExport('attempts')}>
                  Export — attempts
                </DropdownMenuItem>
                {isSuperAccess && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem danger icon={<Trash2 className="h-4 w-4" />} onSelect={() => setConfirmDelete(true)}>
                      Delete set
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <button
          type="button"
          onClick={startPractice}
          disabled={isLocked}
          className="text-left flex-1 group disabled:cursor-not-allowed"
        >
          <h3 className={cn(
            'font-display font-bold text-navy-900 text-lg leading-snug transition-colors',
            !isLocked && 'group-hover:text-navy-700',
          )}>
            {set.set_name ?? `Set ${set.display_order}`}
          </h3>

          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Stat label="Questions" value={set.total_questions} icon={<ListChecks className="h-3 w-3" />} />
            <Stat label="Marks"     value={set.total_marks}     icon={<Award className="h-3 w-3" />} />
            <Stat label="Threshold" value={`${set.threshold_percentage}%`} icon={<Sparkles className="h-3 w-3" />} />
          </div>
        </button>

        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
          {isLocked ? (
            <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />Complete previous set
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              {set.total_questions === 0 ? 'No questions yet' : '30-minute practice'}
            </p>
          )}
          <Button
            size="sm"
            variant={isLocked || set.total_questions === 0 ? 'outline' : 'amber'}
            onClick={startPractice}
            disabled={isLocked || set.total_questions === 0}
            leftIcon={<Play className="h-3.5 w-3.5" />}
          >
            Start practice
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete} onOpenChange={setConfirmDelete}
        title={`Delete ${set.set_name ?? 'this set'}?`}
        description="The set, its questions (if not used elsewhere), and student attempts will be permanently deleted. A core + attempts export is emailed to collaborators."
        confirmText="Delete set"
        destructive
        loading={removeMut.isPending}
        onConfirm={() => removeMut.mutate()}
      />
    </>
  );
};

const Stat = ({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
    <div className="text-[0.65rem] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
      {icon}{label}
    </div>
    <div className="text-base font-bold text-navy-900 leading-tight mt-0.5">{value}</div>
  </div>
);
