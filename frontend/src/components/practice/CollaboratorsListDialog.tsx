import { useQuery } from '@tanstack/react-query';
import { Lock, Eye, EyeOff, Users, ShieldCheck } from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { subjectsApi } from '@/lib/api/subjects';
import type { Subject } from '@/types/api';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subject: Subject;
}

export const CollaboratorsListDialog = ({ open, onOpenChange, subject }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ['subject', subject.subject_id, 'collaborators'],
    queryFn: () => subjectsApi.collaborators(subject.subject_id),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Collaborators" description={subject.subject_name}>
      <div className="flex items-center gap-2 mb-4 text-sm text-slate-500">
        <Users className="h-4 w-4" /> Departments collaborating on this subject
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>
      )}

      {!isLoading && (data?.collaborators?.length ?? 0) === 0 && (
        <p className="text-sm text-slate-500">No collaborating departments yet.</p>
      )}

      <ul className="space-y-2">
        {data?.collaborators?.map(c => {
          const isOwner = c.dept_code === subject.creator;
          return (
            <li key={c.dept_id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold text-navy-900 truncate flex items-center gap-2">
                  {c.dept_name}
                  {isOwner && <Badge tone="amber" size="sm" icon={<ShieldCheck className="h-3 w-3" />}>Owner</Badge>}
                </div>
                <div className="text-xs text-slate-500">{c.dept_code}</div>
              </div>
              {c.dept_sub_lock === 1
                ? <Badge tone="red" icon={<EyeOff className="h-3 w-3" />}>Hidden in dept</Badge>
                : <Badge tone="green" icon={<Eye className="h-3 w-3" />}>Visible</Badge>
              }
            </li>
          );
        })}
      </ul>

      {subject.locked === 1 && (
        <p className="mt-4 text-xs text-amber-700 inline-flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> The subject is currently locked by the owner.
        </p>
      )}
    </Dialog>
  );
};
