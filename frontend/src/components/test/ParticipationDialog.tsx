import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { testsApi } from '@/lib/api/tests';

interface Props {
  testId: number | null;
  onOpenChange: (o: boolean) => void;
}

export const ParticipationDialog = ({ testId, onOpenChange }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ['test-participation', testId],
    queryFn: () => testsApi.participation(testId!),
    enabled: testId != null,
  });

  // Group by academic year
  const groups = (data ?? []).reduce<Record<string, Array<{ dept_id: number; dept_name: string; dept_code: string }>>>((acc, a) => {
    (acc[a.academic_year] ||= []).push({ dept_id: a.dept_id, dept_name: a.dept_name, dept_code: a.dept_code });
    return acc;
  }, {});

  return (
    <Dialog open={testId != null} onOpenChange={onOpenChange} title="Test participation" size="md">
      <div className="flex items-center gap-2 mb-4 text-sm text-slate-500">
        <Users className="h-4 w-4" /> Academic years and departments assigned to this test
      </div>
      {isLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>}
      {!isLoading && Object.keys(groups).length === 0 && (
        <p className="text-sm text-slate-500">No departments assigned.</p>
      )}
      <div className="space-y-3">
        {Object.entries(groups).map(([year, depts]) => (
          <div key={year} className="rounded-xl border border-slate-200 px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Batch {year}</div>
            <div className="flex flex-wrap gap-2">
              {depts.map(d => (
                <Badge key={d.dept_id} tone="navy">
                  {d.dept_name} <span className="text-navy-500 ml-1">· {d.dept_code}</span>
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
};
