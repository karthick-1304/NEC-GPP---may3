import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers, Plus } from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { topicsApi } from '@/lib/api/topics';
import { parseApiError } from '@/lib/api/client';

interface Props {
  subjectId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const schema = z.object({
  topic_name: z.string().trim().min(2, 'At least 2 characters').max(50),
});
type Form = z.infer<typeof schema>;

export const CreateTopicDialog = ({ subjectId, open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { topic_name: '' },
  });
  useEffect(() => { if (open) reset({ topic_name: '' }); }, [open, reset]);

  const m = useMutation({
    mutationFn: (name: string) => topicsApi.create(subjectId, name),
    onSuccess: (_r, name) => {
      toast.success(`Topic "${name}" created`);
      qc.invalidateQueries({ queryKey: ['topics', subjectId] });
      qc.invalidateQueries({ queryKey: ['subjects'] }); // topics_count
      onOpenChange(false);
    },
    onError: (err) => toast.error(parseApiError(err).message || 'Could not create topic'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm">
      <div className="flex items-center gap-3 -mt-2 mb-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
          <Plus className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display font-bold text-navy-900 text-lg">Create a new topic</h2>
          <p className="text-sm text-slate-500">It will appear at the end of the topic order.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit(d => m.mutate(d.topic_name.trim()))} noValidate className="space-y-4">
        <Field label="Topic name" required error={errors.topic_name?.message}>
          <Input leftIcon={<Layers className="h-4 w-4" />} placeholder="e.g. Trees and Graphs"
                 invalid={!!errors.topic_name} {...register('topic_name')} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || m.isPending}>Create topic</Button>
        </div>
      </form>
    </Dialog>
  );
};
