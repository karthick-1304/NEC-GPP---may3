import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users, GraduationCap, Settings, Plus, Trash2, Save,
  Search as SearchIcon, AlertTriangle, Award,
} from 'lucide-react';

import { PageContainer } from '@/components/ui/PageContainer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Dialog';

import { tutorApi, type TutorwardStudent } from '@/lib/api/tutor';
import { commonApi } from '@/lib/api/common';
import { useAuth } from '@/lib/auth/AuthContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { parseApiError } from '@/lib/api/client';

const PAGE_SIZE = 12;

export default function TutorwardPage() {
  const [tab, setTab] = useState('mine');
  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Tutorward</h1>
        <p className="text-sm text-slate-500 mt-1">Mentor and track students assigned to you.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="mine">     <Users className="h-4 w-4 mr-1.5" /> My Students</TabsTrigger>
          <TabsTrigger value="available"><GraduationCap className="h-4 w-4 mr-1.5" /> Available Students</TabsTrigger>
          <TabsTrigger value="settings"> <Settings className="h-4 w-4 mr-1.5" /> Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="mine"><MyWardsTab /></TabsContent>
        <TabsContent value="available"><AvailableTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ─── My Wards ───────────────────────────────────────────────────────────
function MyWardsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debSearch = useDebouncedValue(search, 300);
  useEffect(() => { setPage(1); }, [debSearch]);

  const { data, isLoading } = useQuery({
    queryKey: ['my-wards', { search: debSearch, page }],
    queryFn: () => tutorApi.myWards({ search: debSearch || undefined, page, limit: PAGE_SIZE }),
  });

  const [toRemove, setToRemove] = useState<TutorwardStudent | null>(null);
  const removeMut = useMutation({
    mutationFn: (sid: number) => tutorApi.remove(sid),
    onSuccess: () => {
      toast.success('Student removed from your tutorward');
      qc.invalidateQueries({ queryKey: ['my-wards'] });
      qc.invalidateQueries({ queryKey: ['available-students'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      setToRemove(null);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email, reg number…" />
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16" />)}
        </div>
      ) : (data?.students?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={debSearch ? 'No matching wards' : 'No students in your tutorward yet'}
          description={debSearch
            ? 'Try a different keyword.'
            : 'Switch to "Available Students" section to add students to your tutorward.'}
        />
      ) : (
        <ul className="space-y-2">
          {data!.students.map(s => (
            <li key={s.user_id} className="card flex items-center gap-3 p-3 sm:p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-navy-800 text-white font-bold text-sm">
                {(s.full_name?.[0] ?? '?').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-navy-900 truncate">{s.full_name}</div>
                <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono">{s.reg_num}</span>
                  <span className="text-slate-300">·</span>
                  <span>{s.email}</span>
                  {s.dept_code && (<><span className="text-slate-300">·</span><span>{s.dept_code} · {s.batch_year}</span></>)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setToRemove(s)}
                className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                aria-label="Remove from tutorward"
                title="Remove from tutorward"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="mt-5">
          <Pagination page={page} total={data.total} limit={PAGE_SIZE} onChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}
        title={`Remove ${toRemove?.full_name}?`}
        description="They will be no longer in your tutorward and become available again for any tutor in their department."
        confirmText="Remove"
        destructive
        loading={removeMut.isPending}
        onConfirm={() => { if (toRemove) removeMut.mutate(toRemove.user_id); }}
      />
    </>
  );
}

// ─── Available ──────────────────────────────────────────────────────────
function AvailableTab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debSearch = useDebouncedValue(search, 300);
  useEffect(() => { setPage(1); }, [debSearch]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['available-students', { search: debSearch, page }],
    queryFn: () => tutorApi.available({ search: debSearch || undefined, page, limit: PAGE_SIZE }),
    retry: false,
  });

  const errMsg = error ? parseApiError(error).message : null;

  const addMut = useMutation({
    mutationFn: (sid: number) => tutorApi.add(sid),
    onSuccess: () => {
      toast.success('Student added to your tutorward');
      qc.invalidateQueries({ queryKey: ['available-students'] });
      qc.invalidateQueries({ queryKey: ['my-wards'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  if (errMsg) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6" />}
        title="Cannot list available students"
        description={errMsg}
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="text-sm text-slate-600 inline-flex items-center gap-2 flex-wrap">
          <span className="text-slate-500">Tutor batch:</span>
          <Badge tone="amber" size="sm">
            {data?.tutor_batch_year ?? '—'}
          </Badge>
          {/* Show dept code chip alongside the batch — clarifies which scope
              is being filtered on the Available list. */}
          {user?.dept_code && (
            <>
              <Badge tone="navy" size="sm">{user.dept_code}</Badge>
            </>
          )}
          <span className="text-slate-300 mx-1">·</span>
          <span className="text-xs text-slate-500">only same-dept students of this batch are listed</span>
        </div>
      </div>
      <div className="flex items-center gap-3 mb-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email, reg number…" />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16" />)}
        </div>
      ) : (data?.students?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<SearchIcon className="h-6 w-6" />}
          title={debSearch ? 'No matching students' : 'No available students for your batch'}
          description={debSearch
            ? 'Try a different keyword.'
            : 'Either every student is already assigned, or your tutor batch year doesn\'t match any students.'}
        />
      ) : (
        <ul className="space-y-2">
          {data!.students.map(s => (
            <li key={s.user_id} className="card flex items-center gap-3 p-3 sm:p-4">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-slate-700 font-bold text-sm">
                {(s.full_name?.[0] ?? '?').toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-navy-900 truncate">{s.full_name}</div>
                <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono">{s.reg_num}</span>
                  <span className="text-slate-300">·</span>
                  <span>{s.email}</span>
                </div>
              </div>
              <Button
                size="sm"
                leftIcon={<Plus className="h-3.5 w-3.5" />}
                loading={addMut.isPending && addMut.variables === s.user_id}
                onClick={() => addMut.mutate(s.user_id)}
              >
                Add to tutorward
              </Button>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="mt-5">
          <Pagination page={page} total={data.total} limit={PAGE_SIZE} onChange={setPage} />
        </div>
      )}
    </>
  );
}

// ─── Settings (tutor batch year) ────────────────────────────────────────
function SettingsTab() {
  const { user, refreshMe } = useAuth();
  const qc = useQueryClient();

  const { data: years = [] } = useQuery({
    queryKey: ['batch-years'],
    queryFn: commonApi.batchYears,
    staleTime: 5 * 60_000,
  });
  const { data: wards } = useQuery({
    queryKey: ['my-wards', { _peek: true }],
    queryFn: () => tutorApi.myWards({ page: 1, limit: 1 }),
  });

  // The dropdown's value is one of:
  //   '' (the placeholder "—" shown when nothing is set yet)
  //   '__none__' (chosen "No tutoring batch year" — submits null)
  //   <year string> like "2024-2028"
  const [year, setYear] = useState<string>(user?.tutor_batch_year ?? '');
  useEffect(() => { setYear(user?.tutor_batch_year ?? ''); }, [user?.tutor_batch_year]);

  const m = useMutation({
    mutationFn: (y: string | null) => tutorApi.setBatchYear(y),
    onSuccess: (r) => {
      toast.success(r.tutor_batch_year
        ? `Tutor batch year set to ${r.tutor_batch_year}`
        : 'No tutoring batch year — set cleared');
      refreshMe().catch(() => {});
      qc.invalidateQueries({ queryKey: ['available-students'] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const blocked = (wards?.total ?? 0) > 0;
  const NONE = '__none__';
  const onSave = () => {
    if (year === NONE) m.mutate(null);
    else if (year)     m.mutate(year);
  };

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2">
        <div className="card p-6 sm:p-8">
          <header className="flex items-center gap-3 mb-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy-700"><Award className="h-4 w-4" /></span>
            <div>
              <h3 className="font-display font-bold text-navy-900">Tutor batch year</h3>
              <p className="text-sm text-slate-500">Defines which batch's students , you're about to tutoring.</p>
            </div>
          </header>
          
          {blocked && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 mb-4 flex gap-2 text-amber-800 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>You have {wards?.total} student{wards?.total === 1 ? '' : 's'} in your tutorward — remove all of them before changing the batch year.</span>
            </div>
          )}

          <Field label="Batch year" required hint='Pick from the listed batches, or choose "No tutoring batch year" to clear.'>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              disabled={blocked}
              className="h-11 w-full sm:w-72 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 disabled:bg-slate-50"
            >
              <option value="">— Pick a batch —</option>
              <option value={NONE}>No tutoring batch year</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>

          <div className="mt-5">
            <Button
              leftIcon={<Save className="h-4 w-4" />}
              // Save button enables when the user picks SOMETHING (a year or
              // the "no tutoring" sentinel), and isn't blocked by wards.
              disabled={!year || blocked}
              loading={m.isPending}
              onClick={onSave}
            >
              Save batch year
            </Button>
          </div>
        </div>
      </div>
      <aside>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h4 className="font-semibold text-amber-800 mb-2 text-sm">Why is this locked?</h4>
          <ul className="text-xs text-amber-900/90 space-y-1.5 leading-relaxed">
            <li>• Changing batch year mid-semester would break tutorward continuity.</li>
            <li>• If you need to change your tutoring batch year, then remove all students from your tutorward first, then come back here.</li>
            <li>• Available Students list = students in your dept + your tutoring batch year + not assigned to any tutor.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
