import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Trophy, Users, Eye, RefreshCw, Crown,
  Medal, GraduationCap, Building2, Calendar,
  Search as SearchIcon, ListChecks, Target, ClipboardList,
} from 'lucide-react';

import { PageContainer } from '@/components/ui/PageContainer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';

import { progressApi, type LeaderboardRow, type ProgressStudent } from '@/lib/api/progress';
import { commonApi } from '@/lib/api/common';
import { parseApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/cn';

import { StudentDetailDialog } from '@/components/progress/StudentDetailDialog';
import { MyProgressCard } from '@/components/progress/MyProgressCard';

const PAGE_SIZE = 12;

export default function ProgressPage() {
  const { user } = useAuth();
  const isStudent = user?.role === 'Student';
  const [tab, setTab] = useState(isStudent ? 'mine' : 'students');

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900 flex items-center gap-2">
          <Trophy className="h-6 w-6 text-amber-500" /> Progress Explorer
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {isStudent
            ? 'Your progress card and where you stand on the leaderboard.'
            : 'Track student progress and see where everyone stands.'}
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {isStudent
            ? <TabsTrigger value="mine"><Users className="h-4 w-4 mr-1.5" /> My Progress</TabsTrigger>
            : <TabsTrigger value="students"><Users className="h-4 w-4 mr-1.5" /> Students</TabsTrigger>}
          <TabsTrigger value="leaderboard"><Medal className="h-4 w-4 mr-1.5" /> Leaderboard</TabsTrigger>
        </TabsList>
        {isStudent
          ? <TabsContent value="mine"><MyProgressCard /></TabsContent>
          : <TabsContent value="students"><StudentsTab /></TabsContent>}
        <TabsContent value="leaderboard"><LeaderboardTab /></TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ─── Students tab ────────────────────────────────────────────────────────
function StudentsTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const isHOD   = user?.role === 'Dept Head';
  const isStaff = user?.role === 'Staff';

  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState<string>('');
  const [batchYear, setBatchYear] = useState('');
  const [page, setPage] = useState(1);
  const debSearch = useDebouncedValue(search, 300);

  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => { setPage(1); }, [debSearch, deptId, batchYear]);

  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: commonApi.departments, staleTime: 5 * 60_000, enabled: isAdmin });
  const { data: years = [] } = useQuery({ queryKey: ['batch-years'], queryFn: commonApi.batchYears, staleTime: 5 * 60_000, enabled: isAdmin || isHOD });

  const { data, isLoading } = useQuery({
    queryKey: ['progress-list', { debSearch, deptId, batchYear, page }],
    queryFn: () => progressApi.list({
      search: debSearch || undefined,
      dept_id: deptId ? Number(deptId) : undefined,
      batch_year: batchYear || undefined,
      page, limit: PAGE_SIZE,
    }),
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email, reg num…" />
        {isAdmin && (
          <select
            value={deptId} onChange={(e) => setDeptId(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            <option value="">All depts</option>
            {depts.map(d => <option key={d.dept_id} value={d.dept_id}>{d.dept_code}</option>)}
          </select>
        )}
        {(isAdmin || isHOD) && (
          <select
            value={batchYear} onChange={(e) => setBatchYear(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            <option value="">All batches</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        {isStaff && <Badge tone="amber">Showing your tutorward only</Badge>}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : (data?.students?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<SearchIcon className="h-6 w-6" />}
          title="No students match"
          description="Adjust filters, or try a different search term."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Student</th>
                <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Dept · Batch</th>
                <th className="text-right px-3 py-3 font-semibold"><Target className="h-3 w-3 inline" /></th>
                <th className="text-right px-3 py-3 font-semibold"><ClipboardList className="h-3 w-3 inline" /></th>
                <th className="text-right px-3 py-3 font-semibold hidden sm:table-cell">L1</th>
                <th className="text-right px-3 py-3 font-semibold hidden sm:table-cell">L2</th>
                <th className="text-right px-3 py-3 font-semibold hidden md:table-cell">Topics</th>
                <th className="text-right px-3 py-3 font-semibold">Open</th>
              </tr>
            </thead>
            <tbody>
              {data!.students.map(s => <Row key={s.user_id} s={s} onOpen={() => setOpenId(s.user_id)} />)}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="mt-5"><Pagination page={page} total={data.total} limit={PAGE_SIZE} onChange={setPage} /></div>
      )}

      <StudentDetailDialog studentId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </>
  );
}

const Row = ({ s, onOpen }: { s: ProgressStudent; onOpen: () => void }) => (
  <tr className="border-b border-slate-100 hover:bg-slate-50/50">
    <td className="px-4 py-3">
      <div className="font-semibold text-navy-900">{s.full_name}</div>
      <div className="text-xs text-slate-500 font-mono">{s.reg_num}</div>
    </td>
    <td className="px-4 py-3 hidden sm:table-cell">
      <Badge tone="navy" size="sm">{s.dept_code ?? '—'}</Badge>
      <span className="text-slate-300 mx-1.5">·</span>
      <span className="text-xs">{s.batch_year ?? '—'}</span>
    </td>
    <td className="px-3 py-3 text-right font-semibold text-amber-700">{s.practice_score}</td>
    <td className="px-3 py-3 text-right font-semibold text-navy-800">{s.test_score}</td>
    <td className="px-3 py-3 text-right text-slate-700 hidden sm:table-cell">{s.lev_1_completed}</td>
    <td className="px-3 py-3 text-right text-slate-700 hidden sm:table-cell">{s.lev_2_completed}</td>
    <td className="px-3 py-3 text-right text-slate-700 hidden md:table-cell">{s.topics_completed}</td>
    <td className="px-3 py-3 text-right">
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1 rounded-lg px-2 h-9 text-xs font-semibold text-navy-700 hover:bg-navy-50"
      >
        <Eye className="h-4 w-4" /> Open
      </button>
    </td>
  </tr>
);

// ─── Leaderboard tab ────────────────────────────────────────────────────
function LeaderboardTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const qc = useQueryClient();

  const [type, setType] = useState<'practice' | 'test'>('practice');
  const [dimension, setDimension] = useState<'all' | 'dept' | 'batch'>('all');
  const [value, setValue] = useState<string>('');
  const [search, setSearch] = useState('');
  const debSearch = useDebouncedValue(search, 300);

  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: commonApi.departments, staleTime: 5 * 60_000 });
  const { data: years = [] } = useQuery({ queryKey: ['batch-years'], queryFn: commonApi.batchYears, staleTime: 5 * 60_000 });

  // When the dimension changes (or its dataset arrives), default to the most useful value:
  //   dept  → first department's id
  //   batch → oldest batch year (smallest string in the list)
  //   all   → no value
  useEffect(() => {
    if (dimension === 'all') {
      setValue('');
      return;
    }
    if (dimension === 'dept' && depts.length) {
      setValue(String(depts[0]!.dept_id));
    } else if (dimension === 'batch' && years.length) {
      setValue([...years].sort()[0]!);
    } else {
      setValue('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension, depts.length, years.length]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['leaderboard', { type, dimension, value, debSearch }],
    queryFn: () => progressApi.leaderboard({
      type, dimension,
      value: dimension !== 'all' ? value || undefined : undefined,
      search: debSearch || undefined,
    }),
  });

  const rebuildMut = useMutation({
    mutationFn: progressApi.rebuild,
    onSuccess: () => {
      toast.success('Leaderboards rebuilt');
      qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <>
      <div className="card p-4 sm:p-5 mb-5">
        <div className={cn('grid gap-3', dimension === 'all' ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
          {/* Type */}
          <Field label="Type">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 w-full">
              {(['practice', 'test'] as const).map(t => (
                <button key={t} type="button"
                        onClick={() => setType(t)}
                        className={cn('flex-1 px-3 h-9 text-sm font-semibold rounded-lg transition-colors',
                          type === t ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-navy-800')}>
                  {t === 'practice' ? <span className="inline-flex items-center gap-1.5"><Target className="h-3.5 w-3.5" /> Practice</span>
                                     : <span className="inline-flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Tests</span>}
                </button>
              ))}
            </div>
          </Field>
          {/* Dimension */}
          <Field label="Slice">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 w-full">
              {(['all', 'dept', 'batch'] as const).map(d => (
                <button key={d} type="button"
                        onClick={() => setDimension(d)}
                        className={cn('flex-1 px-3 h-9 text-sm font-semibold rounded-lg transition-colors',
                          dimension === d ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-navy-800')}>
                  {d === 'all' ? 'Global' : d === 'dept' ? 'By Dept' : 'By Batch'}
                </button>
              ))}
            </div>
          </Field>
          {/* Value — hidden entirely for Global slice */}
          {dimension !== 'all' && (
            <Field
              label={dimension === 'dept' ? 'Pick a department' : 'Pick a batch year'}
            >
              {dimension === 'dept' ? (
                <select value={value} onChange={(e) => setValue(e.target.value)}
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40">
                  {depts.map(d => <option key={d.dept_id} value={d.dept_id}>{d.dept_code} · {d.dept_name}</option>)}
                </select>
              ) : (
                <select value={value} onChange={(e) => setValue(e.target.value)}
                        className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
            </Field>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Search a student in this leaderboard…" className="!flex-1" />
          {isAdmin && (
            <Button variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />}
                    loading={rebuildMut.isPending} onClick={() => rebuildMut.mutate()}>
              Rebuild leaderboards
            </Button>
          )}
        </div>
        {data?.last_updated && (
          <p className="mt-3 text-xs text-slate-500">
            Last updated: <span className="font-semibold">{formatDateTime(data.last_updated)}</span>
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>
      ) : (data?.leaderboard?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-6 w-6" />}
          title="No entries yet"
          description={dimension !== 'all' && !value
            ? 'Pick a value to see this slice.'
            : 'No matching students for this slice / search.'}
        />
      ) : (
        <div className={cn('card overflow-hidden', isFetching && 'opacity-90')}>
          <ul className="divide-y divide-slate-100">
            {data!.leaderboard.map(r => <LeaderRow key={`${r.email}-${r.rank}`} r={r} />)}
          </ul>
        </div>
      )}
    </>
  );
}

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="block text-xs uppercase tracking-wider text-slate-500 font-semibold">{label}</label>
    {children}
    {hint && <p className="text-xs text-slate-400">{hint}</p>}
  </div>
);

const LeaderRow = ({ r }: { r: LeaderboardRow }) => {
  const top3 =
    r.rank === 1 ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300' :
    r.rank === 2 ? 'bg-slate-200 text-slate-700' :
    r.rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-600';
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/50">
      <span className={cn('grid h-9 w-9 place-items-center rounded-full font-bold text-xs', top3)}>
        {r.rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-navy-900 truncate flex items-center gap-2">
          {r.full_name}
          {r.rank === 1 && <Crown className="h-4 w-4 text-amber-500" />}
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
          <span className="font-mono">{r.reg_num}</span>
          {r.dept_name && (<><span className="text-slate-300">·</span><Building2 className="h-3 w-3" /><span>{r.dept_name}</span></>)}
          {r.batch_year && (<><span className="text-slate-300">·</span><Calendar className="h-3 w-3" /><span>{r.batch_year}</span></>)}
        </div>
      </div>
      <span className="font-mono font-bold text-navy-900 text-base">{Number(r.score).toFixed(2)}</span>
    </li>
  );
};
