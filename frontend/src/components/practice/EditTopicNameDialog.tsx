import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers, Pencil } from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { topicsApi } from '@/lib/api/topics';
import { parseApiError } from '@/lib/api/client';
import type { Topic } from '@/types/api';

interface Props {
  subjectId: number;
  topic: Topic;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const schema = z.object({
  topic_name: z.string().trim().min(2, 'At least 2 characters').max(50),
});
type Form = z.infer<typeof schema>;

export const EditTopicNameDialog = ({ subjectId, topic, open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { topic_name: topic.topic_name },
  });
  useEffect(() => { if (open) reset({ topic_name: topic.topic_name }); }, [open, topic.topic_name, reset]);

  const m = useMutation({
    mutationFn: (name: string) => topicsApi.updateName(subjectId, topic.topic_id, name),
    onSuccess: (_r, name) => {
      toast.success(`Renamed to "${name}"`);
      qc.invalidateQueries({ queryKey: ['topics', subjectId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm">
      <div className="flex items-center gap-3 -mt-2 mb-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy-700">
          <Pencil className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display font-bold text-navy-900 text-lg">Edit topic name</h2>
          <p className="text-sm text-slate-500">Collaborators are notified about the change.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit(d => m.mutate(d.topic_name.trim()))} noValidate className="space-y-4">
        <Field label="Topic name" required error={errors.topic_name?.message}>
          <Input leftIcon={<Layers className="h-4 w-4" />}
                 invalid={!!errors.topic_name} {...register('topic_name')} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={isSubmitting || m.isPending}>Save changes</Button>
        </div>
      </form>
    </Dialog>
  );
};
