import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { PageContainer } from '@/components/ui/PageContainer';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Spinner } from '@/components/ui/Spinner';

import { topicsApi } from '@/lib/api/topics';
import { subjectsApi } from '@/lib/api/subjects';
import { useAuth } from '@/lib/auth/AuthContext';

import { LevelCard } from '@/components/practice/LevelCard';

export default function LevelsPage() {
  const { subjectId, topicId } = useParams<{ subjectId: string; topicId: string }>();
  const subjId = Number(subjectId);
  const topId  = Number(topicId);
  const { user } = useAuth();

  const { data: subject } = useQuery({
    queryKey: ['subject', subjId],
    queryFn: () => subjectsApi.get(subjId),
    enabled: Number.isFinite(subjId),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['topic-levels', subjId, topId],
    queryFn: () => topicsApi.levels(subjId, topId),
    enabled: Number.isFinite(subjId) && Number.isFinite(topId),
  });

  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { label: 'Practice', to: '/practice' },
          { label: subject?.subject_name ?? 'Subject', to: `/practice/subjects/${subjId}/topics` },
          { label: data?.topic?.topic_name ?? 'Topic' },
        ]}
        className="mb-5"
      />

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-navy-900">
          {data?.topic?.topic_name ?? 'Levels'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Progress from Intermediate to Advanced. Level 2 unlocks once Level 1 is fully cleared.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Loading levels…
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {data?.levels?.map(l => (
            <LevelCard key={l.level} level={l} isStudent={user?.role === 'Student'} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
