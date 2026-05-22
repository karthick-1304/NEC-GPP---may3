import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Sparkles, Users } from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { InfoNote } from '@/components/ui/InfoNote';
import { MultiSelect } from '@/components/ui/MultiSelect';
import type { MultiOption } from '@/components/ui/MultiSelect';

import { subjectsApi } from '@/lib/api/subjects';
import { commonApi } from '@/lib/api/common';
import { parseApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const schema = z.object({
  subject_name: z.string().trim().min(2, 'At least 2 characters').max(150),
  notify:       z.boolean().default(true),
});
type Form = z.infer<typeof schema>;

export const CreateSubjectDialog = ({ open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [collabIds, setCollabIds] = useState<number[]>([]);

  const { data: depts = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: commonApi.departments,
    staleTime: 5 * 60_000,
  });

  // Pre-check: HOD's own dept (pinned, non-removable). Admin: empty by default.
  const ownDeptId = user?.role === 'Dept Head' ? user.dept_id ?? null : null;

  // Reset selection on each open
  useEffect(() => {
    if (open) setCollabIds(ownDeptId ? [ownDeptId] : []);
  }, [open, ownDeptId]);

  const options = useMemo<MultiOption[]>(
    () => depts.map(d => ({
      value: d.dept_id,
      label: `${d.dept_name} (${d.dept_code})`,
      description: d.dept_code,
      pinned: d.dept_id === ownDeptId,
    })),
    [depts, ownDeptId],
  );

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { subject_name: '', notify: true },
  });
  useEffect(() => { if (open) reset({ subject_name: '', notify: true }); }, [open, reset]);

  const create = useMutation({
    mutationFn: (body: { subject_name: string; collaborator_dept_ids: number[]; notify: boolean }) =>
      subjectsApi.create(body),
    onSuccess: (r, vars) => {
      toast.success(`Subject "${vars.subject_name}" created`);
      qc.invalidateQueries({ queryKey: ['subjects'] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(parseApiError(err).message || 'Could not create subject'),
  });

  const submit = (d: Form) => {
    // Always include the pinned dept if HOD
    const ids = ownDeptId ? Array.from(new Set([ownDeptId, ...collabIds])) : [...collabIds];
    create.mutate({
      subject_name: d.subject_name.trim(),
      collaborator_dept_ids: ids.filter(id => id !== ownDeptId), // backend re-adds owner dept
      notify: d.notify,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg">
      <div className="flex items-center gap-3 -mt-2 mb-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display font-bold text-navy-900 text-lg">Create a new subject</h2>
          <p className="text-sm text-slate-500">
            {user?.role === 'Dept Head'
              ? 'Your department is automatically a collaborator. Add others if needed.'
              : 'Pick any departments to collaborate, or leave empty.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-5">
        <InfoNote tone="mail">
          All collaborators of this subject will be emailed about the creation.
        </InfoNote>

        <Field label="Subject name" htmlFor="sub-name" required error={errors.subject_name?.message}
               hint="A unique name across the platform.">
          <Input
            id="sub-name"
            placeholder="e.g. Engineering Mathematics"
            leftIcon={<BookOpen className="h-4 w-4" />}
            invalid={!!errors.subject_name}
            {...register('subject_name')}
          />
        </Field>

        <Field
          label="Collaborating departments"
          hint="Departments here will see this subject under My Subjects."
        >
          <MultiSelect
            options={options}
            value={collabIds}
            onChange={(next) => {
              // Keep the pinned dept always selected
              const set = new Set(next.map(Number));
              if (ownDeptId) set.add(ownDeptId);
              setCollabIds(Array.from(set));
            }}
            placeholder="Select collaborators…"
          />
        </Field>

        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3">
          <input type="checkbox" id="notify" {...register('notify')}
                 className="h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-amber-400" />
          <label htmlFor="notify" className="text-sm text-slate-700 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            Email notify all non-collaborating department heads about this creation of new subject
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting || create.isPending}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || create.isPending}>Create subject</Button>
        </div>
      </form>
    </Dialog>
  );
};
