import { useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import {
  MoreVertical, Pencil, Trash2, Download, ArrowRight,
  Layers, BookOpen,
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

import { topicsApi } from '@/lib/api/topics';
import { parseApiError } from '@/lib/api/client';
import { downloadBlob, downloadCoreAndAttempts } from '@/lib/download';
import { cn } from '@/lib/cn';
import type { Topic } from '@/types/api';

import { EditTopicNameDialog } from './EditTopicNameDialog';

interface Props {
  topic: Topic;
  isCollaborator: boolean;
  isSuperAccess: boolean;
}

export const TopicCard = ({ topic, isCollaborator, isSuperAccess }: Props) => {
  const { subjectId } = useParams<{ subjectId: string }>();
  const subjId = Number(subjectId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Two-stage delete: first download both exports locally (so the user
  // performing the action keeps a copy on their device), THEN fire the
  // DELETE. If the download step fails the delete is aborted entirely.
  const removeMut = useMutation({
    mutationFn: async () => {
      await downloadCoreAndAttempts(`topic_${topic.topic_name}`, (type) =>
        topicsApi.exportBlob(subjId, topic.topic_id, type),
      );
      return topicsApi.remove(subjId, topic.topic_id);
    },
    onSuccess: () => {
      toast.success(`"${topic.topic_name}" deleted. Local copy downloaded; collaborators emailed.`);
      qc.invalidateQueries({ queryKey: ['topics', subjId] });
      qc.invalidateQueries({ queryKey: ['subjects'] }); // topics_count changes
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(parseApiError(e).message || 'Could not export — deletion cancelled.'),
  });

  const onExport = async (type: 'core' | 'attempts') => {
    try {
      const blob = await topicsApi.exportBlob(subjId, topic.topic_id, type);
      const safe = topic.topic_name.replace(/\s+/g, '_');
      downloadBlob(blob, `topic_${safe}_${type}_${Date.now()}.xlsx`);
      toast.success(`Export ready — ${type}`);
    } catch (e) {
      toast.error(parseApiError(e).message);
    }
  };

  const goLevels = () =>
    navigate(`/practice/subjects/${subjId}/topics/${topic.topic_id}/levels`);

  const l1 = Number(topic.sets_level1 ?? 0);
  const l2 = Number(topic.sets_level2 ?? 0);
  const total = Number(topic.total_sets ?? l1 + l2);

  return (
    <>
      <div className="card card-hover p-5 flex flex-col h-full">
        <div className="flex items-start justify-between gap-2 mb-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 text-navy-700 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider border border-navy-100">
            <Layers className="h-3 w-3" />
            Topic #{topic.display_order ?? '—'}
          </span>
          {isCollaborator && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-navy-800 -mr-1 -mt-1"
                  aria-label="Topic actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Topic actions</DropdownMenuLabel>
                <DropdownMenuItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setEditOpen(true)}>
                  Edit topic name
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
                      Delete topic
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <button type="button" onClick={goLevels} className="text-left flex-1 group">
          <h3 className="font-display font-bold text-navy-900 text-lg leading-snug line-clamp-2 group-hover:text-navy-700">
            {topic.topic_name}
          </h3>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="Level 1" value={l1} tone="sky" />
            <Stat label="Level 2" value={l2} tone="violet" />
            <Stat label="Total"   value={total} tone="navy" icon={<BookOpen className="h-3 w-3" />} />
          </div>
        </button>

        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-end">
          <Button size="sm" onClick={goLevels} rightIcon={<ArrowRight className="h-3.5 w-3.5" />}>
            View levels
          </Button>
        </div>
      </div>

      <EditTopicNameDialog open={editOpen} onOpenChange={setEditOpen} topic={topic} subjectId={subjId} />
      <ConfirmDialog
        open={confirmDelete} onOpenChange={setConfirmDelete}
        title={`Delete "${topic.topic_name}"?`}
        description="All sets, questions, and practice attempts under this topic will be permanently deleted. A full export is emailed to collaborators automatically."
        confirmText="Delete topic"
        destructive
        loading={removeMut.isPending}
        onConfirm={() => removeMut.mutate()}
      />
    </>
  );
};

const Stat = ({ label, value, tone, icon }: { label: string; value: number; tone: 'sky' | 'violet' | 'navy'; icon?: React.ReactNode }) => {
  const tones = {
    sky:    'bg-sky-50 text-sky-800 border-sky-100',
    violet: 'bg-violet-50 text-violet-800 border-violet-100',
    navy:   'bg-navy-50 text-navy-800 border-navy-100',
  };
  return (
    <div className={cn('rounded-lg border px-2 py-2 text-center', tones[tone])}>
      <div className="text-xs font-semibold flex items-center justify-center gap-1 opacity-80">
        {icon}{label}
      </div>
      <div className="text-lg font-bold leading-tight mt-0.5">{value}</div>
    </div>
  );
};

