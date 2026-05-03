import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GripVertical, ListOrdered, Save } from 'lucide-react';

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
import { topicsApi } from '@/lib/api/topics';
import { parseApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import type { Topic } from '@/types/api';

interface Props {
  subjectId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export const ReorderTopicsDialog = ({ subjectId, open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['topics', subjectId, 'all-for-reorder'],
    queryFn: () => topicsApi.list(subjectId, { page: 1, limit: 1000 }),
    enabled: open,
  });
  const [order, setOrder] = useState<Topic[]>([]);

  useEffect(() => {
    if (data?.topics) setOrder(data.topics);
  }, [data?.topics]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const oldIdx = prev.findIndex(t => t.topic_id === active.id);
      const newIdx = prev.findIndex(t => t.topic_id === over.id);
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const m = useMutation({
    mutationFn: () => topicsApi.reorder(
      subjectId,
      order.map((t, i) => ({ topic_id: t.topic_id, display_order: i + 1 })),
    ),
    onSuccess: () => {
      toast.success('Topic order saved');
      qc.invalidateQueries({ queryKey: ['topics', subjectId] });
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
          <h2 className="font-display font-bold text-navy-900 text-lg">Reorder topics</h2>
          <p className="text-sm text-slate-500">Drag to rearrange. Click Save to commit.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12" />)}
        </div>
      ) : order.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">No topics to reorder yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order.map(t => t.topic_id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {order.map((t, idx) => (
                <SortableRow key={t.topic_id} id={t.topic_id} index={idx + 1} name={t.topic_name} />
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

function SortableRow({ id, index, name }: { id: number; index: number; name: string }) {
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
        aria-label={`Drag ${name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="grid h-7 w-7 place-items-center rounded-full bg-navy-800 text-white text-xs font-bold shrink-0">
        {index}
      </span>
      <span className="font-semibold text-navy-900 text-sm truncate flex-1">{name}</span>
    </li>
  );
}
