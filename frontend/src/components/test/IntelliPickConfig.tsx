import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, BookOpen } from 'lucide-react';

import { Field } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { subjectsApi } from '@/lib/api/subjects';
import { topicsApi } from '@/lib/api/topics';
import { cn } from '@/lib/cn';

export interface IntelliState {
  subject_id: number | null;
  level: '1' | '2';
  /** topic_id → count (0 = excluded). Topics not in the map are excluded. */
  topicCounts: Map<number, number>;
}

interface Props {
  state: IntelliState;
  onChange: (next: IntelliState) => void;
}

const DEFAULT_COUNT = 3;

export const IntelliPickConfig = ({ state, onChange }: Props) => {
  // ─── Subjects accessible to the current user ───────────────────────
  const { data: subjects, isLoading: loadingSubjects } = useQuery({
    queryKey: ['subjects', 'my', { search: undefined, page: 1, limit: 1000, _intelliPick: true }],
    queryFn: () => subjectsApi.list({ page: 1, limit: 1000 }),
    staleTime: 30_000,
  });

  // ─── Topics in the picked subject ──────────────────────────────────
  const { data: topicsResp, isLoading: loadingTopics } = useQuery({
    queryKey: ['topics', state.subject_id, 'all-for-intelli'],
    queryFn: () => topicsApi.list(state.subject_id!, { page: 1, limit: 1000 }),
    enabled: !!state.subject_id,
  });
  const topics = topicsResp?.topics ?? [];

  // No auto-pick — start every subject with zero topics selected. The user
  // ticks the topics they want manually.

  const selectedSubject = useMemo(
    () => subjects?.subjects?.find(s => s.subject_id === state.subject_id) ?? null,
    [subjects, state.subject_id],
  );

  const totalQuestions = useMemo(() => {
    let n = 0;
    state.topicCounts.forEach(c => { n += c; });
    return n;
  }, [state.topicCounts]);

  const setSubject = (subjectId: number | null) => {
    onChange({ ...state, subject_id: subjectId, topicCounts: new Map() });
  };
  const setLevel = (level: '1' | '2') => {
    onChange({ ...state, level });
  };
  // We allow `0` to live in the map briefly while the user is typing.
  // The save-side checks for it and refuses to submit if a checked topic has 0.
  // Only an unchecked topic is removed from the map.
  const setTopicCount = (topicId: number, count: number) => {
    if (!state.topicCounts.has(topicId)) return; // input disabled when un-ticked
    const m = new Map(state.topicCounts);
    const clamped = Math.min(50, Math.max(0, Math.round(count) || 0));
    m.set(topicId, clamped);
    onChange({ ...state, topicCounts: m });
  };
  const toggleTopic = (topicId: number, on: boolean) => {
    const m = new Map(state.topicCounts);
    if (on) m.set(topicId, DEFAULT_COUNT);
    else m.delete(topicId);
    onChange({ ...state, topicCounts: m });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex gap-2 text-amber-800 text-xs">
        <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          Intelli-Pick auto-pulls the requested number of questions from each chosen topic at test creation time. Picked questions cannot be edited later — but the test schedule and assignments still can.
        </span>
      </div>

      <Field label="Subject" required>
        {loadingSubjects ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm"><Spinner /> Loading subjects…</div>
        ) : (subjects?.subjects?.length ?? 0) === 0 ? (
          <p className="text-sm text-slate-500">No subjects accessible to you. Create or join a subject first.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {subjects!.subjects.map(s => (
              <button
                type="button"
                key={s.subject_id}
                onClick={() => setSubject(s.subject_id)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  state.subject_id === s.subject_id
                    ? 'bg-navy-50 border-navy-400 ring-1 ring-navy-200'
                    : 'bg-white border-slate-200 hover:bg-slate-50',
                )}
              >
                <BookOpen className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-navy-900 truncate text-sm">{s.subject_name}</div>
                  <div className="text-[0.7rem] text-slate-500">{s.topics_count} topics · by {s.creator}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Field>

      {state.subject_id && (
        <Field label="Level" required hint="Pick the difficulty pool to draw from.">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {(['1', '2'] as const).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={cn(
                  'px-4 h-9 text-sm font-semibold rounded-lg transition-colors',
                  state.level === l ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-600 hover:text-navy-800',
                )}
              >
                Level {l} {l === '1' ? '— Intermediate' : '— Advanced'}
              </button>
            ))}
          </div>
        </Field>
      )}

      {state.subject_id && (
        <Field label="Topics & per-topic question counts" hint="Tick topics to include; default count is 3 (max 50).">
          {loadingTopics ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm"><Spinner /> Loading topics…</div>
          ) : topics.length === 0 ? (
            <p className="text-sm text-slate-500">{selectedSubject?.subject_name} has no topics yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {topics.map(t => {
                const checked = state.topicCounts.has(t.topic_id);
                const count = state.topicCounts.get(t.topic_id) ?? DEFAULT_COUNT;
                return (
                  <div key={t.topic_id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleTopic(t.topic_id, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-navy-700 focus:ring-amber-400"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-navy-900 text-sm truncate">{t.topic_name}</div>
                      <div className="text-[0.7rem] text-slate-500">
                        Sets — L1: {t.sets_level1 ?? 0} · L2: {t.sets_level2 ?? 0}
                      </div>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={checked ? (count || '') : ''}
                      disabled={!checked}
                      placeholder={checked ? 'count' : ''}
                      onChange={(e) => {
                        // Letting the field clear to '' means count = 0 in the
                        // map (still selected). The save guard catches it.
                        const raw = e.target.value;
                        const n = raw === '' ? 0 : Number(raw);
                        setTopicCount(t.topic_id, Number.isFinite(n) ? n : 0);
                      }}
                      className={cn(
                        'h-9 w-20 rounded-lg border bg-white px-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/40 disabled:bg-slate-50 disabled:text-slate-400',
                        checked && (!count || count <= 0)
                          ? 'border-red-400 ring-1 ring-red-200'
                          : 'border-slate-300',
                      )}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </Field>
      )}

      {state.subject_id && totalQuestions > 0 && (
        <div className="rounded-xl bg-navy-50 border border-navy-100 px-4 py-3 text-sm text-navy-800">
          Test will be created with <span className="font-bold">{totalQuestions}</span> questions
          across <span className="font-bold">{state.topicCounts.size}</span> topic{state.topicCounts.size === 1 ? '' : 's'}
          {' '}at Level <span className="font-bold">{state.level}</span>.
        </div>
      )}
    </div>
  );
};
