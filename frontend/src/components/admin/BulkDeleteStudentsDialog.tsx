import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, AlertTriangle } from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { adminApi } from '@/lib/api/admin';
import { commonApi } from '@/lib/api/common';
import { parseApiError } from '@/lib/api/client';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export const BulkDeleteStudentsDialog = ({ open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: commonApi.departments, staleTime: 5 * 60_000 });
  const { data: years = [] } = useQuery({ queryKey: ['batch-years'], queryFn: commonApi.batchYears, staleTime: 5 * 60_000 });
  const [batchYear, setBatchYear] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [confirmTyped, setConfirmTyped] = useState('');

  const m = useMutation({
    mutationFn: () => adminApi.bulkDeleteStudents(batchYear, deptCode),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.deleted_count} students`);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      onOpenChange(false);
      setBatchYear(''); setDeptCode(''); setConfirmTyped('');
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const ready = batchYear && deptCode && confirmTyped === 'DELETE';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}
            title="Bulk delete students"
            description="Type DELETE to confirm. This permanently removes all student accounts in the chosen batch + department."
            size="md">
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4 flex gap-2 text-red-700 text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>This is irreversible. All practice attempts, test attempts, and results for the deleted students are also lost.</span>
      </div>

      <div className="space-y-3">
        <Field label="Batch year" required>
          <select
            value={batchYear} onChange={(e) => setBatchYear(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            <option value="">Pick a year…</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <Field label="Department code" required>
          <select
            value={deptCode} onChange={(e) => setDeptCode(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            <option value="">Pick a department…</option>
            {depts.map(d => <option key={d.dept_code} value={d.dept_code}>{d.dept_name} ({d.dept_code})</option>)}
          </select>
        </Field>
        <Field label="Type DELETE to confirm" required>
          <Input value={confirmTyped} onChange={(e) => setConfirmTyped(e.target.value)} placeholder="DELETE" />
        </Field>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant="danger" leftIcon={<Trash2 className="h-4 w-4" />} disabled={!ready} loading={m.isPending} onClick={() => m.mutate()}>
          Delete students
        </Button>
      </div>
    </Dialog>
  );
};
