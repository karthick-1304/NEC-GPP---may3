import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Pencil } from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

import { subjectsApi } from '@/lib/api/subjects';
import { parseApiError } from '@/lib/api/client';
import type { Subject } from '@/types/api';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subject: Subject;
}

const schema = z.object({
  subject_name: z.string().trim().min(2, 'At least 2 characters').max(150),
});
type Form = z.infer<typeof schema>;

export const EditSubjectNameDialog = ({ open, onOpenChange, subject }: Props) => {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { subject_name: subject.subject_name },
  });

  useEffect(() => {
    if (open) reset({ subject_name: subject.subject_name });
  }, [open, subject.subject_name, reset]);

  const m = useMutation({
    mutationFn: (name: string) => subjectsApi.updateName(subject.subject_id, name),
    onSuccess: (_r, name) => {
      toast.success(`Renamed to "${name}"`);
      qc.invalidateQueries({ queryKey: ['subjects'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const submit = (d: Form) => m.mutate(d.subject_name.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="md">
      <div className="flex items-center gap-3 -mt-2 mb-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy-700">
          <Pencil className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display font-bold text-navy-900 text-lg">Edit subject name</h2>
          <p className="text-sm text-slate-500">Collaborators are notified about the change.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4">
        <Field label="Subject name" required error={errors.subject_name?.message}>
          <Input leftIcon={<BookOpen className="h-4 w-4" />} invalid={!!errors.subject_name}
                 {...register('subject_name')} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting || m.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting || m.isPending}>Save changes</Button>
        </div>
      </form>
    </Dialog>
  );
};
