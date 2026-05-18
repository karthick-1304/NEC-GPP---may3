import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Users, Building2, Plus, Upload, Trash2, Pencil,
  Crown, GraduationCap, Briefcase, ShieldCheck, AlertTriangle,
  Download as DownloadIcon,
} from 'lucide-react';

import { PageContainer } from '@/components/ui/PageContainer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Dialog';

import { adminApi, type AdminUserRow } from '@/lib/api/admin';
import { commonApi } from '@/lib/api/common';
import { parseApiError } from '@/lib/api/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Role } from '@/types/api';
import { cn } from '@/lib/cn';

import { CreateUserDialog } from '@/components/admin/CreateUserDialog';
import { BulkUploadDialog } from '@/components/admin/BulkUploadDialog';
import { EditUserDialog } from '@/components/admin/EditUserDialog';
import { BulkDeleteStudentsDialog } from '@/components/admin/BulkDeleteStudentsDialog';
import { CreateDepartmentDialog } from '@/components/admin/CreateDepartmentDialog';
import { EmailKillSwitch } from '@/components/admin/EmailKillSwitch';

const PAGE_SIZE = 12;

export default function AdminPage() {
  const [tab, setTab] = useState('users');
  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900 flex items-center gap-2">
          <Crown className="h-6 w-6 text-amber-500" /> Admin Console
        </h1>
        <p className="text-sm text-slate-500 mt-1">Manage users, departments, and bulk operations.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="users">       <Users className="h-4 w-4 mr-1.5" /> Users</TabsTrigger>
          <TabsTrigger value="departments"> <Building2 className="h-4 w-4 mr-1.5" /> Departments</TabsTrigger>
          <TabsTrigger value="system">      <Crown className="h-4 w-4 mr-1.5" /> System</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="departments"><DepartmentsTab /></TabsContent>
        <TabsContent value="system"><EmailKillSwitch /></TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ─── Users tab ──────────────────────────────────────────────────────────
// Each role keeps its OWN filter state. Switching role tabs preserves what
// you had on each (search term, dept filter, batch filter, page).
type RoleFilters = { search: string; deptCode: string; batchYear: string; page: number };
const blankFilters: RoleFilters = { search: '', deptCode: '', batchYear: '', page: 1 };

function UsersTab() {
  const qc = useQueryClient();
  const [role, setRole] = useState<Role>('Student');
  // Map role → its filters. Initialised lazily.
  const [filtersByRole, setFiltersByRole] = useState<Record<Role, RoleFilters>>(() => ({
    Student:     { ...blankFilters },
    Staff:       { ...blankFilters },
    'Dept Head': { ...blankFilters },
    Admin:       { ...blankFilters },
  }));

  const f = filtersByRole[role];
  const updateF = (patch: Partial<RoleFilters>) => {
    setFiltersByRole(prev => ({ ...prev, [role]: { ...prev[role], ...patch } }));
  };
  const setSearch    = (search: string)     => updateF({ search,    page: 1 });
  const setDeptCode  = (deptCode: string)   => updateF({ deptCode,  page: 1 });
  const setBatchYear = (batchYear: string)  => updateF({ batchYear, page: 1 });
  const setPage      = (page: number)       => updateF({ page });

  const debSearch = useDebouncedValue(f.search, 300);

  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDelOpen, setBulkDelOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [deleting, setDeleting] = useState<AdminUserRow | null>(null);

  const { data: depts = [] } = useQuery({ queryKey: ['departments'], queryFn: commonApi.departments, staleTime: 5 * 60_000 });
  const { data: years = [] } = useQuery({ queryKey: ['batch-years'], queryFn: commonApi.batchYears, staleTime: 5 * 60_000 });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', { role, search: debSearch, deptCode: f.deptCode, batchYear: f.batchYear, page: f.page }],
    queryFn: () => adminApi.listUsers({
      role,
      search: debSearch || undefined,
      dept_code: f.deptCode || undefined,
      batch_year: f.batchYear || undefined,
      page: f.page, limit: PAGE_SIZE,
    }),
  });

  const deleteMut = useMutation({
    mutationFn: ({ email, role }: { email: string; role: Role }) =>
      role === 'Student' ? adminApi.deleteStudentByEmail(email)
      : role === 'Staff'   ? adminApi.deleteStaffByEmail(email)
      : Promise.reject(new Error('Cannot delete from this UI for ' + role)),
    onSuccess: () => {
      toast.success('User deleted');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setDeleting(null);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  const ROLE_BTNS: Array<{ role: Role; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { role: 'Student',   label: 'Students',   icon: GraduationCap },
    { role: 'Staff',     label: 'Staff',      icon: Briefcase },
    { role: 'Dept Head', label: 'Dept Heads', icon: ShieldCheck },
    { role: 'Admin',     label: 'Admins',     icon: Crown },
  ];

  return (
    <>
      {/* Role tabs */}
      <div className="card p-1.5 inline-flex flex-wrap gap-1 mb-4">
        {ROLE_BTNS.map(b => (
          <button
            key={b.role}
            type="button"
            onClick={() => setRole(b.role)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold transition-colors',
              role === b.role ? 'bg-navy-50 text-navy-800' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            <b.icon className="h-4 w-4" /> {b.label}
          </button>
        ))}
      </div>

      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchInput
          value={f.search}
          onChange={setSearch}
          // Search hint differs by role: students have reg_num.
          placeholder={role === 'Student'
            ? 'Search by name, reg num, email…'
            : 'Search by name, email…'}
        />

        {(role === 'Student' || role === 'Staff') && (
          <select
            value={f.deptCode} onChange={(e) => setDeptCode(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            <option value="">All depts</option>
            {depts.map(d => <option key={d.dept_code} value={d.dept_code}>{d.dept_code}</option>)}
          </select>
        )}
        {role === 'Student' && (
          <select
            value={f.batchYear} onChange={(e) => setBatchYear(e.target.value)}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          >
            <option value="">All batches</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}

        <div className="ml-auto flex items-center gap-2">
          {role !== 'Dept Head' && (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setCreateOpen(true)}
            >
              Create {role.toLowerCase()}
            </Button>
          )}
          {(role === 'Student' || role === 'Staff') && (
            <Button
              variant="outline"
              leftIcon={<Upload className="h-4 w-4" />}
              onClick={() => setBulkOpen(true)}
            >
              Bulk import
            </Button>
          )}
          {role === 'Student' && (
            <Button
              variant="outline"
              leftIcon={<Trash2 className="h-4 w-4 text-red-600" />}
              onClick={() => setBulkDelOpen(true)}
            >
              Bulk delete
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : (data?.users?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No users match"
          description="Try clearing filters, or create new users."
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Name</th>
                <th className="text-left px-4 py-3 font-semibold hidden sm:table-cell">Email</th>
                {role === 'Student' && <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Reg / Batch / Dept</th>}
                {role === 'Staff'   && <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Dept · Tutor</th>}
                {role === 'Dept Head' && <th className="text-left px-4 py-3 font-semibold hidden md:table-cell">Dept</th>}
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data!.users.map(u => (
                <tr key={u.user_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-semibold text-navy-900">{u.full_name}</td>
                  <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">{u.email}</td>
                  {role === 'Student' && (
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="font-mono text-xs">{u.reg_num}</span>
                      <span className="text-slate-300 mx-1.5">·</span>
                      <span className="text-xs">{u.batch_year}</span>
                      <span className="text-slate-300 mx-1.5">·</span>
                      <Badge tone="navy" size="sm">{u.dept_code}</Badge>
                    </td>
                  )}
                  {role === 'Staff' && (
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge tone="navy" size="sm">{u.dept_code ?? '—'}</Badge>
                      {u.is_tutor === 1 && (
                        <Badge tone="amber" size="sm" className="ml-1">Tutor · {u.tutor_batch_year ?? '—'}</Badge>
                      )}
                    </td>
                  )}
                  {role === 'Dept Head' && (
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge tone="amber" size="sm">{u.dept_code ?? '—'} · {u.dept_name ?? ''}</Badge>
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {(u.role === 'Student' || u.role === 'Staff') && (
                        <button
                          type="button"
                          onClick={() => setEditing(u)}
                          className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
                          aria-label="Edit"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {(u.role === 'Student' || u.role === 'Staff') && (
                        <button
                          type="button"
                          onClick={() => setDeleting(u)}
                          className="grid h-9 w-9 place-items-center rounded-lg text-red-600 hover:bg-red-50"
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="mt-5">
          <Pagination page={f.page} total={data.total} limit={PAGE_SIZE} onChange={setPage} />
        </div>
      )}

      {/* Dialogs */}
      {role !== 'Dept Head' && (
        <CreateUserDialog
          role={role as 'Student' | 'Staff' | 'Admin'}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
      {(role === 'Student' || role === 'Staff') && (
        <BulkUploadDialog
          kind={role === 'Student' ? 'students' : 'staffs'}
          open={bulkOpen}
          onOpenChange={setBulkOpen}
        />
      )}
      <BulkDeleteStudentsDialog open={bulkDelOpen} onOpenChange={setBulkDelOpen} />
      <EditUserDialog user={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.full_name}"?`}
        description={
          <>
            <p>The {deleting?.role.toLowerCase()} account and all related records will be permanently removed.</p>
            <p className="mt-2 text-xs text-slate-400">{deleting?.email}</p>
          </>
        }
        confirmText="Delete"
        destructive
        loading={deleteMut.isPending}
        onConfirm={() => { if (deleting) deleteMut.mutate({ email: deleting.email, role: deleting.role }); }}
      />
    </>
  );
}

// ─── Departments tab ────────────────────────────────────────────────────
function DepartmentsTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: depts = [], isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: commonApi.departments,
  });

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">All academic departments</p>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
          Create department
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>
      ) : depts.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="No departments yet"
          description="Create the first department to start adding users."
          action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create department</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {depts.map(d => (
            <div key={d.dept_id} className="card p-4 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-navy-50 text-navy-700">
                <Building2 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="font-display font-bold text-navy-900 truncate">{d.dept_name}</div>
                <div className="text-xs text-slate-500">{d.dept_code}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-2xl bg-amber-50 border border-amber-200 p-5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <strong>Heads-up:</strong> creating a department also creates the HOD user automatically with name as
            <span className="font-mono mx-1">HOD_&lt;DEPT_CODE&gt;</span>and emails the credentials to the HOD email you provide.
          </div>
        </div>
      </div>

      <CreateDepartmentDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* Pretend dummy import for export-like UX (kept simple) */}
      <span className="hidden"><DownloadIcon /></span>
    </>
  );
}
