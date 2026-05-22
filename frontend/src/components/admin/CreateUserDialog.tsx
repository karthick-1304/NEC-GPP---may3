import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { User, Mail, Phone, Building2, Hash, Calendar } from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { adminApi } from '@/lib/api/admin';
import { commonApi } from '@/lib/api/common';
import { parseApiError } from '@/lib/api/client';
import type { Role } from '@/types/api';

interface Props {
  role: Extract<Role, 'Student' | 'Staff' | 'Admin'>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const baseShape = {
  full_name:    z.string().trim().min(2, 'At least 2 characters').max(50),
  email:        z.string().email().max(50),
  phone_number: z.string().regex(/^\d{10,15}$/, 'Digits only, 10–15 chars').optional().or(z.literal('')),
};

const studentSchema = z.object({
  ...baseShape,
  dept_code:  z.string().min(2, 'Select any one dept').max(20),
  // Batch year is stored as a string but must represent a positive integer
  // (start year of the batch, e.g. "2022"). Mirrors the backend's
  // /^[1-9]\d*$/ regex so the frontend rejects "0", negative, and non-numeric
  // input up-front instead of waiting for a 400 from the API.
  batch_year: z.string()
    .min(1, 'Batch year is required')
    .max(10)
    .regex(/^[1-9]\d*$/, 'Batch year must be a positive number greater than 0'),
  reg_num:    z.string().min(1).max(50).regex(/^[a-zA-Z0-9]+$/, 'Alphanumeric only'),
});
const staffSchema = z.object({
  ...baseShape,
  dept_code: z.string().min(2, 'Select any one dept').max(20),
});
const adminSchema = z.object(baseShape);

type StudentForm = z.infer<typeof studentSchema>;
type StaffForm   = z.infer<typeof staffSchema>;
type AdminForm   = z.infer<typeof adminSchema>;

export const CreateUserDialog = ({ role, open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: commonApi.departments, staleTime: 5 * 60_000 });

  if (role === 'Student') return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Create student" description="Single-user create. Default password is emailed to them.">
      <CreateStudentForm depts={depts} onClose={() => onOpenChange(false)} qc={qc} />
    </Dialog>
  );
  if (role === 'Staff') return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Create staff" description="Default password is emailed to them.">
      <CreateStaffForm depts={depts} onClose={() => onOpenChange(false)} qc={qc} />
    </Dialog>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Create admin" description="Admins have full system access.">
      <CreateAdminForm onClose={() => onOpenChange(false)} qc={qc} />
    </Dialog>
  );
};

function CreateStudentForm({ depts, onClose, qc }: { depts: { dept_code: string; dept_name: string }[]; onClose: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const { register, handleSubmit, formState: { errors }, reset } =
    useForm<StudentForm>({ resolver: zodResolver(studentSchema), defaultValues: { phone_number: '' } });
  useEffect(() => { reset(); /* eslint-disable-next-line */ }, []);
  const m = useMutation({
    mutationFn: (d: StudentForm) => adminApi.createStudent({ ...d, phone_number: d.phone_number || null }),
    onSuccess: () => { toast.success('Student created'); qc.invalidateQueries({ queryKey: ['admin-users'] }); onClose(); },
    onError: (e) => toast.error(parseApiError(e).message),
  });
  return (
    <form onSubmit={handleSubmit(d => m.mutate(d))} className="space-y-3" noValidate>
      <Field label="Full name" required error={errors.full_name?.message}>
        <Input leftIcon={<User className="h-4 w-4" />} {...register('full_name')} />
      </Field>
      <Field label="Email" required error={errors.email?.message}>
        <Input type="email" leftIcon={<Mail className="h-4 w-4" />} {...register('email')} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Phone (optional)" error={errors.phone_number?.message}>
          <Input leftIcon={<Phone className="h-4 w-4" />} {...register('phone_number')} />
        </Field>
        <Field label="Reg number" required error={errors.reg_num?.message}>
          <Input leftIcon={<Hash className="h-4 w-4" />} {...register('reg_num')} />
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Department code" required error={errors.dept_code?.message}>
          <select {...register('dept_code')} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40">
            <option value="">Pick a department…</option>
            {depts.map(d => <option key={d.dept_code} value={d.dept_code}>{d.dept_name} ({d.dept_code})</option>)}
          </select>
        </Field>
        <Field label="Batch year" required error={errors.batch_year?.message}>
          <Input leftIcon={<Calendar className="h-4 w-4" />} placeholder="e.g. 2024-2028" {...register('batch_year')} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={m.isPending}>Create student</Button>
      </div>
    </form>
  );
}

function CreateStaffForm({ depts, onClose, qc }: { depts: { dept_code: string; dept_name: string }[]; onClose: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const { register, handleSubmit, formState: { errors }, reset } =
    useForm<StaffForm>({ resolver: zodResolver(staffSchema), defaultValues: { phone_number: '' } });
  useEffect(() => { reset(); /* eslint-disable-next-line */ }, []);
  const m = useMutation({
    mutationFn: (d: StaffForm) => adminApi.createStaff({ ...d, phone_number: d.phone_number || null }),
    onSuccess: () => { toast.success('Staff created'); qc.invalidateQueries({ queryKey: ['admin-users'] }); onClose(); },
    onError: (e) => toast.error(parseApiError(e).message),
  });
  return (
    <form onSubmit={handleSubmit(d => m.mutate(d))} className="space-y-3" noValidate>
      <Field label="Full name" required error={errors.full_name?.message}><Input leftIcon={<User className="h-4 w-4" />} {...register('full_name')} /></Field>
      <Field label="Email" required error={errors.email?.message}><Input type="email" leftIcon={<Mail className="h-4 w-4" />} {...register('email')} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Phone (optional)" error={errors.phone_number?.message}>
          <Input leftIcon={<Phone className="h-4 w-4" />} {...register('phone_number')} />
        </Field>
        <Field label="Department code" required error={errors.dept_code?.message}>
          <select {...register('dept_code')} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40">
            <option value="">Pick a department…</option>
            {depts.map(d => <option key={d.dept_code} value={d.dept_code}>{d.dept_name} ({d.dept_code})</option>)}
          </select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={m.isPending}>Create staff</Button>
      </div>
    </form>
  );
}

function CreateAdminForm({ onClose, qc }: { onClose: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const { register, handleSubmit, formState: { errors }, reset } =
    useForm<AdminForm>({ resolver: zodResolver(adminSchema), defaultValues: { phone_number: '' } });
  useEffect(() => { reset(); /* eslint-disable-next-line */ }, []);
  const m = useMutation({
    mutationFn: (d: AdminForm) => adminApi.createAdmin({ ...d, phone_number: d.phone_number || null }),
    onSuccess: () => { toast.success('Admin created'); qc.invalidateQueries({ queryKey: ['admin-users'] }); onClose(); },
    onError: (e) => toast.error(parseApiError(e).message),
  });
  return (
    <form onSubmit={handleSubmit(d => m.mutate(d))} className="space-y-3" noValidate>
      <Field label="Full name" required error={errors.full_name?.message}><Input leftIcon={<User className="h-4 w-4" />} {...register('full_name')} /></Field>
      <Field label="Email" required error={errors.email?.message}><Input type="email" leftIcon={<Mail className="h-4 w-4" />} {...register('email')} /></Field>
      <Field label="Phone (optional)" error={errors.phone_number?.message}>
        <Input leftIcon={<Phone className="h-4 w-4" />} {...register('phone_number')} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={m.isPending}>Create admin</Button>
      </div>
    </form>
  );
}
