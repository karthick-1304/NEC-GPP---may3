import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Lock, Check } from 'lucide-react';

import { Field } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { commonApi } from '@/lib/api/common';
import { cn } from '@/lib/cn';

export interface AssignmentEntry {
  dept_id: number;
  academic_year: string;
  /** Existing assignments on a started test cannot be removed. */
  locked?: boolean;
}

interface Props {
  value: AssignmentEntry[];
  onChange: (next: AssignmentEntry[]) => void;
  /** Existing entries (in edit mode). They appear pre-checked + locked when test has started. */
  lockedEntries?: AssignmentEntry[];
  /**
   * Fired when the user unchecks a locked entry on a NOT-yet-started test —
   * the parent should drop the entry from `lockedEntries` and remember it in
   * its own "to-be-deleted" list so it can send `remove_assignments` to the
   * backend on save. Not invoked when `startedAlready` is true.
   */
  onRemoveLocked?: (entry: AssignmentEntry) => void;
  /**
   * `true` when the test has already started — locked entries cannot be unchecked.
   * `false` when the test hasn't started — locked entries CAN be unchecked,
   * which triggers `onRemoveLocked` so the parent can build the removal list.
   */
  startedAlready?: boolean;
}

/**
 * UX:
 *   1. Pick a batch year (defaults to oldest known).
 *   2. Below: list of all departments. Each row is a click-to-toggle checkbox.
 *      - Already-participating depts (from `lockedEntries`) appear pre-checked.
 *      - On a started test, locked checkboxes can't be unticked.
 *   3. Bucket of all currently-selected (dept × year) pairs is shown grouped.
 */
export const AssignmentsPicker = ({
  value, onChange, lockedEntries = [], onRemoveLocked, startedAlready = false,
}: Props) => {
  const { data: depts = [], isLoading: deptsLoading } = useQuery({
    queryKey: ['departments'], queryFn: commonApi.departments, staleTime: 5 * 60_000,
  });
  const { data: years = [], isLoading: yearsLoading } = useQuery({
    queryKey: ['batch-years'], queryFn: commonApi.batchYears, staleTime: 5 * 60_000,
  });

  // Default to the oldest batch year (smallest string sort works for "YYYY-YYYY" formats).
  const oldestYear = useMemo(() => {
    if (!years.length) return '';
    return [...years].sort()[0]!;
  }, [years]);

  const [activeYear, setActiveYear] = useState<string>('');
  useEffect(() => {
    if (!activeYear && oldestYear) setActiveYear(oldestYear);
  }, [oldestYear, activeYear]);

  // No dept is auto-seeded: the user must tick the depts they want.
  // (We still default the year dropdown to the oldest batch year — see above.)

  // Helpers
  const isLockedFor = (deptId: number, year: string) =>
    !!lockedEntries.find(l => l.dept_id === deptId && l.academic_year === year);
  const isCheckedFor = (deptId: number, year: string) => {
    if (isLockedFor(deptId, year)) return true;
    return !!value.find(v => v.dept_id === deptId && v.academic_year === year);
  };

  const toggle = (deptId: number, year: string) => {
    const locked = isLockedFor(deptId, year);

    if (locked) {
      // Locked entries (existing on the backend) can only be removed when the
      // test hasn't started. Tell the parent — it owns the lockedEntries list
      // and the "pending removal" tracker that gets sent as `remove_assignments`
      // on save.
      if (startedAlready) return; // hard block
      onRemoveLocked?.({ dept_id: deptId, academic_year: year });
      return;
    }

    const checked = isCheckedFor(deptId, year);
    if (checked) {
      // Plain new-addition unchecks remove from the parent's `value` array.
      onChange(value.filter(v => !(v.dept_id === deptId && v.academic_year === year)));
    } else {
      onChange([...value, { dept_id: deptId, academic_year: year }]);
    }
  };

  // Bucket grouped by year (merge value + locked)
  const grouped = useMemo(() => {
    const all: AssignmentEntry[] = [];
    const seen = new Set<string>();
    [...lockedEntries, ...value].forEach(e => {
      const k = `${e.dept_id}|${e.academic_year}`;
      if (seen.has(k)) return;
      seen.add(k);
      all.push(e);
    });
    const m = new Map<string, AssignmentEntry[]>();
    all.forEach(e => {
      const arr = m.get(e.academic_year) ?? [];
      arr.push(e);
      m.set(e.academic_year, arr);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [value, lockedEntries]);

  if (deptsLoading || yearsLoading) {
    return <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Loading…</div>;
  }
  if (years.length === 0) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      No batch years exist yet — create some students first so participation can be assigned.
    </div>;
  }

  return (
    <div className="space-y-4">
      {/* Step 1: pick year */}
      <Field label="Batch year" hint="Pick a batch year to see available departments.">
        <select
          value={activeYear}
          onChange={(e) => setActiveYear(e.target.value)}
          className="h-11 w-full sm:w-72 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </Field>

      {/* Step 2: depts grid for this year */}
      {activeYear && (
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            Departments for batch <span className="text-navy-800 font-bold">{activeYear}</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {depts.map(d => {
              const checked = isCheckedFor(d.dept_id, activeYear);
              const locked  = isLockedFor(d.dept_id, activeYear);
              const lockedAndStarted = locked && startedAlready;
              return (
                <button
                  type="button"
                  key={d.dept_id}
                  onClick={() => toggle(d.dept_id, activeYear)}
                  disabled={lockedAndStarted && checked}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    checked
                      ? lockedAndStarted
                        ? 'bg-amber-50 border-amber-300 text-amber-900 cursor-not-allowed'
                        : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700',
                  )}
                  title={lockedAndStarted ? 'Cannot remove — test has already started' : ''}
                >
                  <span className={cn(
                    'grid h-5 w-5 place-items-center rounded border shrink-0 transition-colors',
                    checked
                      ? lockedAndStarted
                        ? 'bg-amber-400 border-amber-500 text-navy-900'
                        : 'bg-emerald-500 border-emerald-600 text-white'
                      : 'bg-white border-slate-300',
                  )}>
                    {checked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{d.dept_name}</div>
                    <div className="text-[0.7rem] opacity-70">{d.dept_code}</div>
                  </div>
                  {lockedAndStarted && <Lock className="h-3.5 w-3.5 opacity-60 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bucket */}
      {grouped.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-1">All assignments</div>
          {grouped.map(([year, entries]) => (
            <div key={year} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs text-slate-600 mb-1.5">
                <Calendar className="h-3 w-3" /> Batch <span className="font-bold text-navy-800">{year}</span>
                <span className="ml-auto text-[0.7rem] text-slate-400">{entries.length} dept{entries.length === 1 ? '' : 's'}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {entries.map(e => {
                  const dept = depts.find(d => d.dept_id === e.dept_id);
                  const code = dept?.dept_code ?? `Dept #${e.dept_id}`;
                  return (
                    <Badge
                      key={`${e.dept_id}-${e.academic_year}`}
                      tone={e.locked ? 'amber' : 'green'}
                      size="sm"
                    >
                      {code}{e.locked && <Lock className="h-2.5 w-2.5 ml-1 opacity-70" />}
                    </Badge>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
