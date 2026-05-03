import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, BookOpen, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { subjectsApi } from '@/lib/api/subjects';
import { parseApiError } from '@/lib/api/client';
import type { Subject } from '@/types/api';

interface Props {
  subject: Subject;
}

export const SubjectCardOther = ({ subject }: Props) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requested, setRequested] = useState(false);

  const m = useMutation({
    mutationFn: () => subjectsApi.joinRequest(subject.subject_id),
    onSuccess: () => {
      toast.success(`Join request sent for "${subject.subject_name}"`);
      setRequested(true);
      setConfirmOpen(false);
    },
    onError: (e) => toast.error(parseApiError(e).message),
  });

  return (
    <>
      <div className="card card-hover p-5 flex flex-col h-full">
        <div className="mb-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider">
            Other subject
          </span>
        </div>
        <h3 className="font-display font-bold text-navy-900 text-lg leading-snug line-clamp-2">
          {subject.subject_name}
        </h3>
        <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-4 w-4 text-slate-400" />
            <span className="font-semibold text-navy-800">{subject.topics_count}</span>
            <span className="text-xs text-slate-500">topics</span>
          </span>
          {subject.creator && (
            <>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span className="text-xs text-slate-500">
                by <span className="font-semibold text-navy-700">{subject.creator}</span>
              </span>
            </>
          )}
        </div>
        <div className="mt-auto pt-5 border-t border-slate-100 flex items-center justify-end">
          <Button
            size="sm"
            variant={requested ? 'outline' : 'amber'}
            onClick={() => setConfirmOpen(true)}
            disabled={requested}
            rightIcon={requested ? undefined : <ArrowRight className="h-3.5 w-3.5" />}
            leftIcon={requested ? <Send className="h-3.5 w-3.5" /> : undefined}
          >
            {requested ? 'Request sent' : 'Request access'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen} onOpenChange={setConfirmOpen}
        title={`Request access to "${subject.subject_name}"?`}
        description="The subject owner and Admins will be notified. Once approved, this subject will appear under My Subjects for your whole department."
        confirmText="Send request"
        loading={m.isPending}
        onConfirm={() => m.mutate()}
      />
    </>
  );
};
