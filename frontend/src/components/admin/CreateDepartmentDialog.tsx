import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Mail, Phone, Hash } from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { adminApi } from '@/lib/api/admin';
import { parseApiError } from '@/lib/api/client';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

const schema = z.object({
  dept_name: z.string().trim().min(2).max(50),
  dept_code: z.string().trim().min(2).max(20).regex(/^[A-Z0-9]+$/, 'Uppercase A-Z and digits only'),
  hod_email: z.string().email().max(50),
  hod_phone: z.string().regex(/^\d{10,15}$/, 'Digits only, 10–15 chars').optional().or(z.literal('')),
});
type Form = z.infer<typeof schema>;

export const CreateDepartmentDialog = ({ open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { hod_phone: '' },
  });
  useEffect(() => { if (open) reset({ hod_phone: '' }); }, [open, reset]);

  const m = useMutation({
    mutationFn: (d: Form) => adminApi.createDepartment({
      dept_name: d.dept_name.trim(),
      dept_code: d.dept_code.toUpperCase(),
      hod_email: d.hod_email.toLowerCase(),
      hod_phone: d.hod_phone || null,
    }),
    onSuccess: (r) => {
      toast.success(`Department created (id: ${r.dept_id}). HOD password emailed.`);
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}
            title="Create department + HOD"
            description="An HOD user will be created automatically as `HOD_<DEPT_CODE>` and emailed credentials.">
      <form onSubmit={handleSubmit(d => m.mutate(d))} className="space-y-3" noValidate>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Department name" required error={errors.dept_name?.message}>
            <Input leftIcon={<Building2 className="h-4 w-4" />} placeholder="Computer Science" {...register('dept_name')} />
          </Field>
          <Field label="Department code" required error={errors.dept_code?.message} hint="Uppercase, e.g. CSE, ECE">
            <Input leftIcon={<Hash className="h-4 w-4" />} placeholder="CSE" {...register('dept_code')}
                   onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }} />
          </Field>
        </div>
        <Field label="HOD email" required error={errors.hod_email?.message}>
          <Input type="email" leftIcon={<Mail className="h-4 w-4" />} placeholder="hod_cse@nec.edu.in" {...register('hod_email')} />
        </Field>
        <Field label="HOD phone (optional)" error={errors.hod_phone?.message}>
          <Input leftIcon={<Phone className="h-4 w-4" />} {...register('hod_phone')} />
        </Field>
        <div className="flex justify-end gap-2 pt-3 mt-3 border-t border-slate-100">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={m.isPending}>Create department</Button>
        </div>
      </form>
    </Dialog>
  );
};
