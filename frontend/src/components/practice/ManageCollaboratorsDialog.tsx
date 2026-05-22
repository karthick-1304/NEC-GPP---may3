import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, ShieldCheck, Eye, EyeOff } from 'lucide-react';

import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { InfoNote } from '@/components/ui/InfoNote';
import { subjectsApi } from '@/lib/api/subjects';
import { parseApiError } from '@/lib/api/client';
import type { Subject } from '@/types/api';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subject: Subject;
}

export const ManageCollaboratorsDialog = ({ open, onOpenChange, subject }: Props) => {
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<{ dept_id: number; dept_name: string } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['subject', subject.subject_id, 'collaborators'],
    queryFn: () => subjectsApi.collaborators(subject.subject_id),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['subject', subject.subject_id, 'collaborators'] });
    qc.invalidateQueries({ queryKey: ['subjects'] });
    refetch();
  };

  const addMut = useMutation({
    mutationFn: (dept_id: number) => subjectsApi.addCollaborator(subject.subject_id, dept_id),
    onSuccess: () => { toast.success('Collaborator added'); invalidate(); },
    onError:   (e) => toast.error(parseApiError(e).message),
  });
  const removeMut = useMutation({
    mutationFn: (dept_id: number) => subjectsApi.removeCollaborator(subject.subject_id, dept_id),
    onSuccess: () => { toast.success('Collaborator removed'); invalidate(); setRemoving(null); },
    onError:   (e) => toast.error(parseApiError(e).message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Manage collaborators" description={subject.subject_name}>
        {isLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>}

        {!isLoading && (
          <>
          <InfoNote tone="mail" className="mb-4">
            Adding or removing a collaborator notifies all current collaborators.
          </InfoNote>
          <div className="grid md:grid-cols-2 gap-5">
            {/* Current */}
            <section>
              <h3 className="font-semibold text-navy-900 text-sm mb-2">Current ({data?.collaborators?.length ?? 0})</h3>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(data?.collaborators ?? []).map(c => {
                  const isOwner = c.dept_code === subject.creator;
                  return (
                    <div key={c.dept_id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="font-semibold text-navy-900 truncate flex items-center gap-2 text-sm">
                          {c.dept_name}
                          {isOwner && <Badge tone="amber" size="sm" icon={<ShieldCheck className="h-3 w-3" />}>Owner</Badge>}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5">
                          {c.dept_code}
                          {c.dept_sub_lock === 1
                            ? <span className="text-amber-700 inline-flex items-center gap-0.5"><EyeOff className="h-3 w-3" /> hidden</span>
                            : <span className="text-emerald-700 inline-flex items-center gap-0.5"><Eye className="h-3 w-3" /> visible</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRemoving({ dept_id: c.dept_id, dept_name: c.dept_name })}
                        disabled={isOwner}
                        title={isOwner ? "Owner's department cannot be removed" : 'Remove collaborator'}
                        className="grid h-8 w-8 place-items-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                        aria-label={`Remove ${c.dept_name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Available */}
            <section>
              <h3 className="font-semibold text-navy-900 text-sm mb-2">Add a department ({data?.nonCollaborators?.length ?? 0})</h3>
              {(data?.nonCollaborators?.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  Every department is already collaborating.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {data?.nonCollaborators?.map(d => (
                    <div key={d.dept_id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="font-semibold text-navy-900 truncate text-sm">{d.dept_name}</div>
                        <div className="text-xs text-slate-500">{d.dept_code}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Plus className="h-3.5 w-3.5" />}
                        loading={addMut.isPending && addMut.variables === d.dept_id}
                        onClick={() => addMut.mutate(d.dept_id)}
                      >
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          </>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove "${removing?.dept_name}" as collaborator?`}
        description="That department's HOD, staff, and students will lose access to this subject. Practice attempts they've already made are kept."
        confirmText="Remove"
        destructive
        loading={removeMut.isPending}
        onConfirm={() => { if (removing) removeMut.mutate(removing.dept_id); }}
      />
    </>
  );
};
