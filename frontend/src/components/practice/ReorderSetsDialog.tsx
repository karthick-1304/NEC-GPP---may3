import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GripVertical, ListOrdered, Save, AlertTriangle } from 'lucide-react';

import {
  DndContext, type DragEndEvent, PointerSensor, KeyboardSensor,
  closestCenter, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, useSortable,
  verticalListSortingStrategy, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { setsApi } from '@/lib/api/sets';
import { parseApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import type { PracticeSet } from '@/types/api';

interface Props {
  subjectId: number;
  topicId: number;
  level: '1' | '2';
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/**
 * Set reorder UX:
 *   We preserve each set's ORIGINAL "Set N" label throughout the drag, so the
 *   user can keep track of which set is which while planning the new order.
 *   Only after Save Order does the backend commit the new display_order, and
 *   the labels become contiguous again on next render.
 *
 *   Example: original list [Set 1, Set 2, Set 3, Set 4, Set 5].
 *   User drags Set 5 to position 2 →
 *     in-flight view: [Set 1, Set 5, Set 2, Set 3, Set 4]
 *     on save + refetch: [Set 1, Set 2, Set 3, Set 4, Set 5] (new physical order)
 */
export const ReorderSetsDialog = ({ subjectId, topicId, level, open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['sets', subjectId, topicId, level, 'all-for-reorder'],
    queryFn: () => setsApi.list(subjectId, topicId, level),
    enabled: open,
  });
  const [order, setOrder] = useState<PracticeSet[]>([]);
  // Snapshot of the ORIGINAL "Set N" labels per set_id, taken once when the
  // dialog opens. Stays constant through the drag so labels don't shuffle.
  const [originalLabel, setOriginalLabel] = useState<Record<number, string>>({});

  useEffect(() => {
    if (data?.sets) {
      setOrder(data.sets);
      const map: Record<number, string> = {};
      data.sets.forEach((s, i) => {
        map[s.set_id] = s.set_name ?? `Set ${i + 1}`;
      });
      setOriginalLabel(map);
    }
  }, [data?.sets]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const oldIdx = prev.findIndex(s => s.set_id === active.id);
      const newIdx = prev.findIndex(s => s.set_id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const m = useMutation({
    mutationFn: () => setsApi.reorder(
      subjectId, topicId,
      order.map((s, i) => ({ set_id: s.set_id, display_order: i + 1 })),
    ),
    onSuccess: () => {
      toast.success('Set order saved');
      qc.invalidateQueries({ queryKey: ['sets', subjectId, topicId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="md">
      <div className="flex items-center gap-3 -mt-2 mb-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy-700">
          <ListOrdered className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display font-bold text-navy-900 text-lg">Reorder sets — Level {level}</h2>
          <p className="text-sm text-slate-500">Drag to rearrange. Click Save to commit.</p>
        </div>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4 flex gap-2 text-amber-800 text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>Reordering changes the unlock path to the students. Be careful while reordering.</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12" />)}
        </div>
      ) : order.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">No sets to reorder yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order.map(s => s.set_id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {order.map((s, idx) => (
                <SortableSetRow
                  key={s.set_id}
                  id={s.set_id}
                  position={idx + 1}
                  label={originalLabel[s.set_id] ?? `Set ${idx + 1}`}
                  total={s.total_questions}
                  marks={s.total_marks}
                  threshold={s.threshold_percentage}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex justify-end gap-2 pt-5 mt-4 border-t border-slate-100">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={() => m.mutate()} loading={m.isPending} leftIcon={<Save className="h-4 w-4" />}>
          Save order
        </Button>
      </div>
    </Dialog>
  );
};

function SortableSetRow({ id, position, label, total, marks, threshold }: {
  id: number; position: number; label: string;
  total: number; marks: number; threshold: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5',
        isDragging ? 'border-amber-400 shadow-card-hover bg-amber-50/30 ring-2 ring-amber-200/40' : 'border-slate-200',
      )}
    >
      <button
        type="button"
        className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 cursor-grab active:cursor-grabbing"
        aria-label={`Drag ${label}`}
        {...attributes} {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {/* Position badge tracks current row index (so the user sees where the
          set will land), while the label stays the ORIGINAL Set N. */}
      <span className="grid h-7 w-7 place-items-center rounded-full bg-navy-800 text-white text-xs font-bold shrink-0">
        {position}
      </span>
      <span className="font-semibold text-navy-900 text-sm flex-1">{label}</span>
      <span className="text-xs text-slate-500">{total} q · {marks} m · {threshold}%</span>
    </li>
  );
}
