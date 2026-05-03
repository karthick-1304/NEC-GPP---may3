import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  MoreVertical, Pencil, Trash2, Users,
  Clock, ListChecks, Award, Calendar, AlertTriangle,
  Play, Eye, CheckCircle2, Hourglass,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/Dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/Dropdown';

import { testsApi } from '@/lib/api/tests';
import { parseApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { formatDateTime, formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { TestRecord } from '@/types/api';

interface Props {
  test: TestRecord;
  onShowParticipation: (testId: number) => void;
}

export const TestCard = ({ test, onShowParticipation }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [confirmDelete, setConfirmDelete] = useState(false);

  const isStudent = user?.role === 'Student';
  const isAdmin   = user?.role === 'Admin';
  const isCreator = user?.user_id === test.created_by;
  const canEdit   = isAdmin || isCreator;

  const removeMut = useMutation({
    mutationFn: () => testsApi.remove(test.test_id),
    onSuccess: () => {
      toast.success(`"${test.test_name}" deleted`);
      qc.invalidateQueries({ queryKey: ['tests'] });
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  // Pass the test name via location.state so the pre-flight screen can show
  // "<Test name> — ready?" without making an extra API call before /start.
  // If a student loads the URL directly the state will be missing and the
  // pre-flight falls back to "Test #<id> — ready?".
  const goAttempt = () => navigate(`/tests/${test.test_id}/attempt`, { state: { test_name: test.test_name } });
  const goEdit    = () => navigate(`/tests/${test.test_id}/edit`);

  const status = test.status;
  const ui = test.attempt_ui_label ?? (status === 'ongoing' ? 'Start Test' : status === 'upcoming' ? 'Upcoming' : 'Ended');

  return (
    <>
      <div className={cn(
        'card card-hover p-5 flex flex-col h-full relative',
        status === 'ongoing'  && 'ring-1 ring-emerald-200',
        status === 'upcoming' && 'ring-1 ring-amber-200',
      )}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={status} />
            {!!test.negative_marking && (
              <Badge tone="amber" size="sm" icon={<AlertTriangle className="h-3 w-3" />}>Neg marking</Badge>
            )}
            {!isStudent && test.dept_participating && (
              <Badge tone="green" size="sm" icon={<Users className="h-3 w-3" />}>Your dept</Badge>
            )}
          </div>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-navy-800 -mr-1 -mt-1"
                  aria-label="Test actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Test actions</DropdownMenuLabel>
                {!isStudent && (
                  <DropdownMenuItem icon={<Eye className="h-4 w-4" />} onSelect={() => onShowParticipation(test.test_id)}>
                    View participation
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem icon={<Pencil className="h-4 w-4" />} onSelect={goEdit}>
                  Edit test
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger icon={<Trash2 className="h-4 w-4" />} onSelect={() => setConfirmDelete(true)}>
                  Delete test
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <h3 className="font-display font-bold text-navy-900 text-lg leading-snug line-clamp-2">
          {test.test_name}
        </h3>

        {!isStudent && test.creator_dept_code && (
          <p className="text-xs text-slate-500 mt-1">
            Created by <span className="font-semibold text-navy-700">{test.creator_dept_code}</span>
          </p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat icon={<ListChecks className="h-3 w-3" />} label="Questions" value={test.total_questions} />
          <Stat icon={<Award className="h-3 w-3" />}      label="Marks"     value={test.total_marks} />
          <Stat icon={<Clock className="h-3 w-3" />}      label="Duration"  value={formatDuration(test.duration_minutes)} />
        </div>

        <div className="mt-3 space-y-1 text-xs text-slate-600">
          <Row icon={<Calendar className="h-3 w-3" />} label="Starts" value={formatDateTime(test.start_time)} />
          <Row icon={<Hourglass className="h-3 w-3" />} label="Ends"   value={formatDateTime(test.end_time)} />
          <p className="text-[0.7rem] text-slate-800 italic mt-1">
            Auto-evaluated ~5 min after End time; results emailed to creator + Admins. Test will get deleted after end time automatically.
          </p>
        </div>

        {isStudent && (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
            <span className="text-slate-500 inline-flex items-center gap-1.5">
              Attempts
              <AttemptDots count={test.attempt_count ?? 0} max={3} />
              <span className="font-semibold text-navy-800">{test.attempt_count ?? 0}/3</span>
            </span>
            {test.attempt_status === 'Submitted' && (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                <CheckCircle2 className="h-3 w-3" />Submitted
              </span>
            )}
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-end">
          {isStudent ? (
            <Button
              size="sm"
              variant={ui === 'Finished' || status !== 'ongoing' ? 'outline' : 'amber'}
              disabled={ui === 'Finished' || status !== 'ongoing'}
              leftIcon={<Play className="h-3.5 w-3.5" />}
              onClick={goAttempt}
            >
              {ui === 'Finished' ? 'Finished' : ui === 'Resume Test' ? 'Resume' : (status === 'upcoming' ? 'Upcoming' : 'Start')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Eye className="h-3.5 w-3.5" />}
              onClick={() => onShowParticipation(test.test_id)}
            >
              View participation
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete} onOpenChange={setConfirmDelete}
        title={`Delete "${test.test_name}"?`}
        description="The test, its questions (where unique to this test), and all student attempts will be permanently deleted."
        confirmText="Delete test"
        destructive
        loading={removeMut.isPending}
        onConfirm={() => removeMut.mutate()}
      />
    </>
  );
};

function AttemptDots({ count, max }: { count: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${count} of ${max} attempts used`}>
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 w-2.5 rounded-full border',
            i < count
              ? 'bg-amber-400 border-amber-500'
              : 'bg-white border-slate-300',
          )}
        />
      ))}
    </span>
  );
}

function StatusBadge({ status }: { status: TestRecord['status'] }) {
  if (status === 'ongoing')  return <Badge tone="green" size="sm" icon={<Play className="h-3 w-3" />}>Ongoing</Badge>;
  if (status === 'upcoming') return <Badge tone="amber" size="sm" icon={<Hourglass className="h-3 w-3" />}>Upcoming</Badge>;
  return <Badge tone="slate" size="sm" icon={<CheckCircle2 className="h-3 w-3" />}>Ended</Badge>;
}

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
    <div className="text-[0.65rem] uppercase tracking-wider text-slate-500 font-semibold flex items-center gap-1">
      {icon}{label}
    </div>
    <div className="text-base font-bold text-navy-900 leading-tight mt-0.5">{value}</div>
  </div>
);

const Row = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-slate-400">{icon}</span>
    <span className="text-slate-500">{label}:</span>
    <span className="font-medium text-slate-700">{value}</span>
  </div>
);
