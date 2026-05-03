import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileSpreadsheet, Upload, Download } from 'lucide-react';
import axios from 'axios';

import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { adminApi } from '@/lib/api/admin';
import { parseApiError } from '@/lib/api/client';

interface Props {
  kind: 'students' | 'staffs';
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export const BulkUploadDialog = ({ kind, open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Array<{ row?: number; reason: string; email?: string; reg_num?: string }>>([]);

  const m = useMutation({
    mutationFn: (f: File) => kind === 'students' ? adminApi.bulkStudents(f) : adminApi.bulkStaffs(f),
    onSuccess: (r) => {
      toast.success(`Imported ${r.created} ${kind}`);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      onOpenChange(false);
      setFile(null);
      setErrors([]);
    },
    onError: (err) => {
      // Backend bulk endpoints return { status:'fail', errors:[...] } on validation failure
      if (axios.isAxiosError(err) && err.response?.data?.errors) {
        setErrors(err.response.data.errors);
        toast.error('Bulk import aborted — see errors below');
      } else {
        toast.error(parseApiError(err).message);
      }
    },
  });

  // Wipe local state every time the dialog closes. Radix keeps the component
  // mounted while `open=false`, so without this the next open would still
  // surface the previous attempt's file selection and validation errors.
  useEffect(() => {
    if (!open) {
      setFile(null);
      setErrors([]);
      m.reset();
      // Also clear the underlying <input>'s value — otherwise re-opening and
      // picking the SAME path wouldn't fire `onChange` (browsers compare the
      // new path against the existing value and skip the event when equal).
      if (fileRef.current) fileRef.current.value = '';
    }
    // m is intentionally NOT in deps — we only want this on open transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Single entry point for adopting a new file. Always clears the previous
  // run's errors and the mutation error state so the UI doesn't visually
  // merge a stale failed attempt with a fresh selection.
  const adoptFile = (f: File | null) => {
    setFile(f);
    setErrors([]);
    if (m.isError) m.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}
            title={`Bulk import ${kind}`}
            description={kind === 'students'
              ? 'Excel columns: full_name · email · phone_number · dept_code · batch_year · reg_num'
              : 'Excel columns: full_name · email · phone_number · dept_code'}
            size="lg">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="text-sm">
          <div className="font-semibold text-navy-900">Need a starting point?</div>
          <div className="text-xs text-slate-500">Download the sample workbook with example rows + column hints.</div>
        </div>
        <a
          href={`/samples/${kind === 'students' ? 'students_sample.xlsx' : 'staffs_sample.xlsx'}`}
          download
          className="inline-flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-3 h-9 text-xs font-semibold text-navy-700 hover:bg-navy-50 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Download sample
        </a>
      </div>

      <div
        className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center cursor-pointer hover:bg-slate-100 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) adoptFile(f);
        }}
      >
        <FileSpreadsheet className="h-10 w-10 mx-auto text-slate-400" />
        {file ? (
          <>
            <p className="mt-3 font-semibold text-navy-900">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB · click to change</p>
          </>
        ) : (
          <>
            <p className="mt-3 font-semibold text-navy-900">Drop your .xlsx file here</p>
            <p className="text-xs text-slate-500">or click to browse</p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          // Wipe value BEFORE the OS picker opens, so re-selecting the same
          // path counts as a change and fires onChange. Without this, after
          // a failed attempt the user would have to pick a different file
          // (or re-open the modal) for the second pick to register, and a
          // re-saved file at the same path would even surface a
          // NotReadable/NetworkError because the browser would still hold
          // the original (now-stale) file handle.
          onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ''; }}
          onChange={(e) => adoptFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {errors.length > 0 && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="font-semibold text-red-700 mb-2 text-sm">Validation errors</div>
          <ul className="text-xs text-red-700 space-y-1 max-h-60 overflow-auto">
            {errors.slice(0, 200).map((e, i) => (
              <li key={i}>
                {e.row != null && <span className="font-semibold">Row {e.row}: </span>}
                {e.reason}
                {e.email && <span className="text-red-500"> ({e.email})</span>}
                {e.reg_num && <span className="text-red-500"> ({e.reg_num})</span>}
              </li>
            ))}
            {errors.length > 200 && <li>… and {errors.length - 200} more</li>}
          </ul>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          leftIcon={<Upload className="h-4 w-4" />}
          disabled={!file}
          loading={m.isPending}
          onClick={() => file && m.mutate(file)}
        >
          Import
        </Button>
      </div>
    </Dialog>
  );
};
