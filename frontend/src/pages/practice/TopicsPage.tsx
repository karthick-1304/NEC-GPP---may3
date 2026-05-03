import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Plus, ListOrdered, Layers as LayersIcon, Search as SearchIcon } from 'lucide-react';

import { PageContainer } from '@/components/ui/PageContainer';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGrid } from '@/components/ui/SkeletonCard';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { topicsApi } from '@/lib/api/topics';
import { subjectsApi } from '@/lib/api/subjects';
import { useAuth } from '@/lib/auth/AuthContext';

import { TopicCard } from '@/components/practice/TopicCard';
import { CreateTopicDialog } from '@/components/practice/CreateTopicDialog';
import { ReorderTopicsDialog } from '@/components/practice/ReorderTopicsDialog';

const PAGE_SIZE = 6;

export default function TopicsPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const subjId = Number(subjectId);
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const debSearch = useDebouncedValue(search, 300);

  useEffect(() => { setPage(1); }, [debSearch]);

  const { data: subject } = useQuery({
    queryKey: ['subject', subjId],
    queryFn: () => subjectsApi.get(subjId),
    enabled: Number.isFinite(subjId),
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['topics', subjId, { search: debSearch, page }],
    queryFn: () => topicsApi.list(subjId, { search: debSearch || undefined, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
    enabled: Number.isFinite(subjId),
  });

  // Access flags — derived from backend `superAccess` flag and user role
  const isAdmin = user?.role === 'Admin';
  const isHOD   = user?.role === 'Dept Head';
  const isSuperAccess  = !!data?.superAccess || isAdmin || (isHOD && subject?.created_by === user?.user_id);
  const isCollaborator = isAdmin || isHOD;
  const canCreate      = isCollaborator;

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: 'Practice', to: '/practice' },
          { label: subject?.subject_name ?? 'Subject' },
        ]}
        className="mb-5"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">
            {subject?.subject_name ?? 'Topics'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {(data?.total ?? 0)} topic{(data?.total ?? 0) === 1 ? '' : 's'} in this subject
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Button variant="outline" leftIcon={<ListOrdered className="h-4 w-4" />} onClick={() => setReorderOpen(true)}>
              Reorder
            </Button>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Create Topic
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-5">
        <SearchInput value={search} onChange={setSearch} placeholder="Search topics by name or id…" />
      </div>

      {isLoading ? <SkeletonGrid count={PAGE_SIZE} /> : (
        (data?.topics?.length ?? 0) === 0 ? (
          <EmptyState
            icon={debSearch ? <SearchIcon className="h-6 w-6" /> : <LayersIcon className="h-6 w-6" />}
            title={debSearch ? 'No topics match your search' : 'No topics yet'}
            description={debSearch
              ? 'Try a different keyword or clear the search.'
              : canCreate
                ? 'Create your first topic to start adding practice sets.'
                : 'A collaborator will create topics here soon.'}
            action={!debSearch && canCreate
              ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create Topic</Button>
              : undefined}
          />
        ) : (
          <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-4 ${isFetching ? 'opacity-80' : ''}`}>
            {data!.topics.map(t => (
              <TopicCard
                key={t.topic_id}
                topic={t}
                isCollaborator={isCollaborator}
                isSuperAccess={isSuperAccess}
              />
            ))}
          </div>
        )
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="mt-7">
          <Pagination page={page} total={data.total} limit={PAGE_SIZE} onChange={setPage} />
        </div>
      )}

      {canCreate && (
        <>
          <CreateTopicDialog open={createOpen} onOpenChange={setCreateOpen} subjectId={subjId} />
          <ReorderTopicsDialog open={reorderOpen} onOpenChange={setReorderOpen} subjectId={subjId} />
        </>
      )}
    </PageContainer>
  );
}
