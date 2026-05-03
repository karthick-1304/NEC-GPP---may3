import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { User, Mail, Phone, Hash, Calendar } from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { adminApi, type AdminUserRow } from '@/lib/api/admin';
import { commonApi } from '@/lib/api/common';
import { parseApiError } from '@/lib/api/client';

interface Props {
  user: AdminUserRow | null;
  onOpenChange: (o: boolean) => void;
}

const studentSchema = z.object({
  full_name: z.string().trim().min(2).max(50).optional(),
  email:     z.string().email().max(50).optional(),
  phone_number: z.string().regex(/^\d{10,15}$/).optional().or(z.literal('')),
  batch_year: z.string().min(1).max(10).optional(),
  dept_code:  z.string().min(2, 'Pick any one dept').max(20).optional(),
  reg_num:    z.string().min(1).max(50).regex(/^[a-zA-Z0-9]+$/).optional(),
  remove_tutor: z.boolean().optional(),
});
const staffSchema = z.object({
  full_name: z.string().trim().min(2).max(50).optional(),
  email:     z.string().email().max(50).optional(),
  phone_number: z.string().regex(/^\d{10,15}$/).optional().or(z.literal('')),
  dept_code:  z.string().min(2, 'Pick any one dept').max(20).optional(),
});
type StudentForm = z.infer<typeof studentSchema>;
type StaffForm   = z.infer<typeof staffSchema>;

export const EditUserDialog = ({ user, onOpenChange }: Props) => {
  if (!user) return null;
  if (user.role === 'Student') return <EditStudent user={user} onOpenChange={onOpenChange} />;
  if (user.role === 'Staff')   return <EditStaff   user={user} onOpenChange={onOpenChange} />;
  // No edit endpoint for Admin / Dept Head
  return (
    <Dialog open onOpenChange={onOpenChange} title={`Cannot edit ${user.role}`}>
      <p className="text-sm text-slate-600">
        Edit endpoints are only available for Students and Staff. {user.role} accounts can be deleted from the table directly.
      </p>
    </Dialog>
  );
};

function EditStudent({ user, onOpenChange }: { user: AdminUserRow; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: commonApi.departments, staleTime: 5 * 60_000 });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
  });
  useEffect(() => {
    reset({
      full_name: user.full_name, email: user.email, phone_number: user.phone_number ?? '',
      batch_year: user.batch_year, dept_code: user.dept_code ?? '', reg_num: user.reg_num,
      remove_tutor: false,
    });
  }, [user, reset]);

  const m = useMutation({
    mutationFn: (d: StudentForm) => adminApi.editStudent(user.user_id, {
      ...d,
      phone_number: d.phone_number === '' ? null : d.phone_number,
    } as any),
    onSuccess: () => { toast.success('Student updated'); qc.invalidateQueries({ queryKey: ['admin-users'] }); onOpenChange(false); },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange} title={`Edit student — ${user.full_name}`} size="lg">
      <form onSubmit={handleSubmit(d => m.mutate(d))} className="space-y-3" noValidate>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Full name" error={errors.full_name?.message}>
            <Input leftIcon={<User className="h-4 w-4" />} {...register('full_name')} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <Input type="email" leftIcon={<Mail className="h-4 w-4" />} {...register('email')} />
          </Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Phone" error={errors.phone_number?.message}>
            <Input leftIcon={<Phone className="h-4 w-4" />} {...register('phone_number')} />
          </Field>
          <Field label="Reg number" error={errors.reg_num?.message}>
            <Input leftIcon={<Hash className="h-4 w-4" />} {...register('reg_num')} />
          </Field>
          <Field label="Batch year" error={errors.batch_year?.message}>
            <Input leftIcon={<Calendar className="h-4 w-4" />} {...register('batch_year')} />
          </Field>
        </div>
        <Field label="Department code" error={errors.dept_code?.message}>
          <select {...register('dept_code')} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40">
            <option value="">Pick any department</option>
            {depts.map(d => <option key={d.dept_code} value={d.dept_code}>{d.dept_name} ({d.dept_code})</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" {...register('remove_tutor')} className="h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-amber-400" />
          Also remove their current tutor assignment
        </label>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 mt-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={m.isPending}>Save changes</Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditStaff({ user, onOpenChange }: { user: AdminUserRow; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: commonApi.departments, staleTime: 5 * 60_000 });
  const { register, handleSubmit, reset, formState: { errors } } = useForm<StaffForm>({
    resolver: zodResolver(staffSchema),
  });
  useEffect(() => {
    reset({
      full_name: user.full_name, email: user.email,
      phone_number: user.phone_number ?? '', dept_code: user.dept_code ?? '',
    });
  }, [user, reset]);

  const m = useMutation({
    mutationFn: (d: StaffForm) => adminApi.editStaff(user.user_id, {
      ...d,
      phone_number: d.phone_number === '' ? null : d.phone_number,
    } as any),
    onSuccess: () => { toast.success('Staff updated'); qc.invalidateQueries({ queryKey: ['admin-users'] }); onOpenChange(false); },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange} title={`Edit staff — ${user.full_name}`}>
      <form onSubmit={handleSubmit(d => m.mutate(d))} className="space-y-3" noValidate>
        <Field label="Full name" error={errors.full_name?.message}><Input leftIcon={<User className="h-4 w-4" />} {...register('full_name')} /></Field>
        <Field label="Email" error={errors.email?.message}><Input type="email" leftIcon={<Mail className="h-4 w-4" />} {...register('email')} /></Field>
        <Field label="Phone" error={errors.phone_number?.message}><Input leftIcon={<Phone className="h-4 w-4" />} {...register('phone_number')} /></Field>
        <Field label="Department code" error={errors.dept_code?.message}>
          <select {...register('dept_code')} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40">
            <option value="">Pick any department</option>
            {depts.map(d => <option key={d.dept_code} value={d.dept_code}>{d.dept_name} ({d.dept_code})</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 mt-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" loading={m.isPending}>Save changes</Button>
        </div>
      </form>
    </Dialog>
  );
}
