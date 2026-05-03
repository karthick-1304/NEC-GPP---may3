import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus, Search as SearchIcon } from 'lucide-react';

import { PageContainer } from '@/components/ui/PageContainer';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGrid } from '@/components/ui/SkeletonCard';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { testsApi } from '@/lib/api/tests';
import { useAuth } from '@/lib/auth/AuthContext';

import { TestCard } from '@/components/test/TestCard';
import { ParticipationDialog } from '@/components/test/ParticipationDialog';

const PAGE_SIZE = 6;

export default function TestsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debSearch = useDebouncedValue(search, 300);
  const [participationFor, setParticipationFor] = useState<number | null>(null);

  useEffect(() => { setPage(1); }, [debSearch]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['tests', { search: debSearch }],
    queryFn: () => testsApi.list(debSearch || undefined),
    refetchInterval: 30_000, // keep statuses fresh while window is open
  });

  const canCreate = user?.role === 'Admin' || user?.role === 'Dept Head';

  // Slice client-side for the 6-per-page UI (backend currently returns the full list)
  const all = data?.tests ?? [];
  const start = (page - 1) * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">Tests</h1>
          <p className="text-sm text-slate-500 mt-1">
            {user?.role === 'Student'
              ? 'Tests assigned to your batch and department.'
              : 'All tests on the platform with their participation.'}
          </p>
        </div>
        {canCreate && (
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/tests/new')}>
            Create Test
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search tests by name…" />
      </div>

      {isLoading ? <SkeletonGrid count={PAGE_SIZE} /> : (
        all.length === 0 ? (
          <EmptyState
            icon={debSearch ? <SearchIcon className="h-6 w-6" /> : <ClipboardList className="h-6 w-6" />}
            title={debSearch ? 'No tests match your search' : 'No tests yet'}
            description={debSearch
              ? 'Try a different keyword or clear the search.'
              : canCreate
                ? 'Schedule the first test to get students moving.'
                : 'Tests assigned to you will appear here.'}
            action={!debSearch && canCreate
              ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => navigate('/tests/new')}>Create Test</Button>
              : undefined}
          />
        ) : (
          <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${isFetching ? 'opacity-90' : ''}`}>
            {slice.map(t => (
              <TestCard
                key={t.test_id}
                test={t}
                onShowParticipation={setParticipationFor}
              />
            ))}
          </div>
        )
      )}

      {all.length > PAGE_SIZE && (
        <div className="mt-7">
          <Pagination page={page} total={all.length} limit={PAGE_SIZE} onChange={setPage} />
        </div>
      )}

      <ParticipationDialog testId={participationFor} onOpenChange={(o) => !o && setParticipationFor(null)} />
    </PageContainer>
  );
}
