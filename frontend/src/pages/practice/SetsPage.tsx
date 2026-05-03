import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, ListOrdered, ListChecks } from 'lucide-react';

import { PageContainer } from '@/components/ui/PageContainer';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonGrid } from '@/components/ui/SkeletonCard';

import { setsApi } from '@/lib/api/sets';
import { topicsApi } from '@/lib/api/topics';
import { subjectsApi } from '@/lib/api/subjects';
import { useAuth } from '@/lib/auth/AuthContext';

import { SetCard } from '@/components/practice/SetCard';
import { ReorderSetsDialog } from '@/components/practice/ReorderSetsDialog';

export default function SetsPage() {
  const { subjectId, topicId, level } = useParams<{ subjectId: string; topicId: string; level: string }>();
  const subjId = Number(subjectId);
  const topId  = Number(topicId);
  const lvl    = (level === '2' ? '2' : '1') as '1' | '2';

  const { user } = useAuth();
  const navigate = useNavigate();
  const [reorderOpen, setReorderOpen] = useState(false);

  const { data: subject } = useQuery({
    queryKey: ['subject', subjId],
    queryFn: () => subjectsApi.get(subjId),
    enabled: Number.isFinite(subjId),
  });
  const { data: topicLevels } = useQuery({
    queryKey: ['topic-levels', subjId, topId],
    queryFn: () => topicsApi.levels(subjId, topId),
    enabled: Number.isFinite(subjId) && Number.isFinite(topId),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['sets', subjId, topId, lvl],
    queryFn: () => setsApi.list(subjId, topId, lvl),
    enabled: Number.isFinite(subjId) && Number.isFinite(topId),
  });

  const isAdmin = user?.role === 'Admin';
  const isHOD   = user?.role === 'Dept Head';
  const isCollaborator = isAdmin || isHOD;
  const isSuperAccess  = !!data?.superAccess || isAdmin || (isHOD && subject?.created_by === user?.user_id);
  const canCreate = isCollaborator;

  const goCreate = () => navigate(
    `/practice/subjects/${subjId}/topics/${topId}/levels/${lvl}/sets/new`,
  );

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: 'Practice', to: '/practice' },
          { label: subject?.subject_name ?? 'Subject', to: `/practice/subjects/${subjId}/topics` },
          { label: topicLevels?.topic?.topic_name ?? 'Topic',
            to: `/practice/subjects/${subjId}/topics/${topId}/levels` },
          { label: lvl === '1' ? 'Level 1 — Intermediate' : 'Level 2 — Advanced' },
        ]}
        className="mb-5"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">
            Level {lvl} <span className={lvl === '1' ? 'text-sky-600' : 'text-violet-600'}>
              · {lvl === '1' ? 'Intermediate' : 'Advanced'}
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {(data?.sets?.length ?? 0)} set{(data?.sets?.length ?? 0) === 1 ? '' : 's'} in this level
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              leftIcon={<ListOrdered className="h-4 w-4" />}
              onClick={() => setReorderOpen(true)}
              disabled={(data?.sets?.length ?? 0) < 2}
            >
              Reorder
            </Button>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={goCreate}>
              Create Set
            </Button>
          </div>
        )}
      </div>

      {isLoading ? <SkeletonGrid count={6} /> : (
        (data?.sets?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-6 w-6" />}
            title="No sets at this level yet"
            description={canCreate
              ? 'Create the first practice set so students can start grinding.'
              : 'A collaborator will add practice sets here soon.'}
            action={canCreate
              ? <Button leftIcon={<Plus className="h-4 w-4" />} onClick={goCreate}>Create Set</Button>
              : undefined}
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data!.sets.map(s => (
              <SetCard
                key={s.set_id}
                set={s}
                isCollaborator={isCollaborator}
                isSuperAccess={isSuperAccess}
              />
            ))}
          </div>
        )
      )}

      {canCreate && (
        <ReorderSetsDialog
          open={reorderOpen} onOpenChange={setReorderOpen}
          subjectId={subjId} topicId={topId} level={lvl}
        />
      )}
    </PageContainer>
  );
}
