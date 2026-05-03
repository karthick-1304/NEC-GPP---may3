import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { BookOpen, Plus, Compass, Search as SearchIcon } from 'lucide-react';

import { PageContainer } from '@/components/ui/PageContainer';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGrid } from '@/components/ui/SkeletonCard';

import { useAuth } from '@/lib/auth/AuthContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { subjectsApi } from '@/lib/api/subjects';

import { SubjectCard } from '@/components/practice/SubjectCard';
import { SubjectCardOther } from '@/components/practice/SubjectCardOther';
import { CreateSubjectDialog } from '@/components/practice/CreateSubjectDialog';

import type { Subject } from '@/types/api';

const PAGE_SIZE = 6;

export default function SubjectsPage() {
  const { user } = useAuth();
  const isHOD = user?.role === 'Dept Head';
  const canCreate = user?.role === 'Admin' || user?.role === 'Dept Head';

  const [tab, setTab] = useState<'my' | 'other'>('my');
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <PageContainer>
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Practice</h1>
          <p className="text-sm text-slate-500 mt-1">
            {user?.role === 'Student'
              ? 'Pick a subject to continue your practice path.'
              : isHOD
                ? 'Subjects your department collaborates on, and others you can join.'
                : 'All subjects across the platform.'}
          </p>
        </div>
        {canCreate && (
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Create Subject
          </Button>
        )}
      </div>

      {isHOD ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'my' | 'other')}>
          <TabsList>
            <TabsTrigger value="my">
              <BookOpen className="h-4 w-4 mr-1.5" />
              My Subjects
            </TabsTrigger>
            <TabsTrigger value="other">
              <Compass className="h-4 w-4 mr-1.5" />
              Other Subjects
            </TabsTrigger>
          </TabsList>
          <TabsContent value="my"><MySubjects /></TabsContent>
          <TabsContent value="other"><OtherSubjects /></TabsContent>
        </Tabs>
      ) : (
        <MySubjects />
      )}

      {canCreate && (
        <CreateSubjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </PageContainer>
  );
}

// ─── My subjects ─────────────────────────────────────────────────────────
function MySubjects() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debSearch = useDebouncedValue(search, 300);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['subjects', 'my', { search: debSearch, page }],
    queryFn: () => subjectsApi.list({ search: debSearch || undefined, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  // Reset to page 1 on search change
  useMemoResetPage(debSearch, setPage);

  const isAdmin = user?.role === 'Admin';
  const isHOD   = user?.role === 'Dept Head';

  const computeAccess = (s: Subject) => ({
    isCollaborator: !!s.collaboratorAccess || isAdmin || (isHOD && true),
    isSuperAccess:  !!s.superAccess
                    || isAdmin
                    || (isHOD && s.created_by === user?.user_id),
  });

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search My Subjects by name or id…" />
      </div>

      {isLoading ? <SkeletonGrid count={PAGE_SIZE} /> : (
        (data?.subjects?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<SearchIcon className="h-6 w-6" />}
            title={debSearch ? 'No subjects match your search' : 'No subjects yet'}
            description={debSearch
              ? 'Try a different keyword or clear the search.'
              : 'When subjects are created, they will appear here.'}
          />
        ) : (
          <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${isFetching ? 'opacity-80' : ''}`}>
            {data!.subjects.map(s => {
              const access = computeAccess(s);
              return (
                <SubjectCard
                  key={s.subject_id}
                  subject={s}
                  isCollaborator={access.isCollaborator}
                  isSuperAccess={access.isSuperAccess}
                />
              );
            })}
          </div>
        )
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="mt-7">
          <Pagination page={page} total={data.total} limit={PAGE_SIZE} onChange={setPage} />
        </div>
      )}
    </>
  );
}

// ─── Other subjects (HOD only) ───────────────────────────────────────────
function OtherSubjects() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debSearch = useDebouncedValue(search, 300);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['subjects', 'other', { search: debSearch, page }],
    queryFn: () => subjectsApi.listOther({ search: debSearch || undefined, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  useMemoResetPage(debSearch, setPage);

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search subjects to request access…" />
      </div>

      {isLoading ? <SkeletonGrid count={PAGE_SIZE} /> : (
        (data?.subjects?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Compass className="h-6 w-6" />}
            title={debSearch ? 'No matching subjects' : 'You collaborate on every subject already'}
            description={debSearch
              ? 'No other subjects match this search.'
              : 'Once new subjects are created by other departments, they will show up here.'}
          />
        ) : (
          <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${isFetching ? 'opacity-80' : ''}`}>
            {data!.subjects.map(s => <SubjectCardOther key={s.subject_id} subject={s} />)}
          </div>
        )
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="mt-7">
          <Pagination page={page} total={data.total} limit={PAGE_SIZE} onChange={setPage} />
        </div>
      )}
    </>
  );
}

// Reset page → 1 when search changes
function useMemoResetPage(search: string, setPage: (p: number) => void) {
  useEffect(() => { setPage(1); /* eslint-disable-line */ }, [search]);
}
