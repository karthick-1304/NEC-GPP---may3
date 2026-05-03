import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  MoreVertical, Lock, Unlock, EyeOff, Eye,
  Pencil, Trash2, Users, LogOut, Download,
  ArrowRight, ShieldCheck, BookOpen,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/Dropdown';
import { useAuth } from '@/lib/auth/AuthContext';
import { subjectsApi } from '@/lib/api/subjects';
import { parseApiError } from '@/lib/api/client';
import { downloadBlob, downloadCoreAndAttempts } from '@/lib/download';
import type { Subject } from '@/types/api';
import { cn } from '@/lib/cn';

import { CollaboratorsListDialog }   from './CollaboratorsListDialog';
import { ManageCollaboratorsDialog } from './ManageCollaboratorsDialog';
import { EditSubjectNameDialog }     from './EditSubjectNameDialog';

interface Props {
  subject: Subject;
  /**
   * When true the user is at least a collaborator (Admin / Dept Head whose dept is in subject_access_dept).
   * Computed by parent based on which list the subject came from.
   */
  isCollaborator: boolean;
  isSuperAccess: boolean;
}

export const SubjectCard = ({ subject, isCollaborator, isSuperAccess }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [confirm, setConfirm] = useState<null | 'lock' | 'deptLock' | 'leave' | 'delete'>(null);
  const [collabsOpen, setCollabsOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const isAdmin = user?.role === 'Admin';
  const subjectLocked = subject.locked === 1;
  const deptLock      = subject.dept_sub_lock === 1;
  const blockedForStudentStaff = (user?.role === 'Student' || user?.role === 'Staff') && deptLock;
  const blockedForNonSuper     = subjectLocked && !isSuperAccess;
  const cardBlocked            = blockedForStudentStaff || blockedForNonSuper;

  // ─── Mutations ───────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['subjects', 'my'] });
    qc.invalidateQueries({ queryKey: ['subjects', 'other'] });
  };
  const lockMut = useMutation({
    mutationFn: () => subjectsApi.toggleLock(subject.subject_id),
    onSuccess: (r) => { toast.success(r.locked ? 'Subject locked' : 'Subject unlocked'); invalidate(); setConfirm(null); },
    onError:   (e) => toast.error(parseApiError(e).message),
  });
  const deptLockMut = useMutation({
    mutationFn: () => subjectsApi.toggleDeptLock(subject.subject_id),
    onSuccess: (r) => { toast.success(r.dept_sub_lock ? 'Hidden from your department' : 'Visible to your department'); invalidate(); setConfirm(null); },
    onError:   (e) => toast.error(parseApiError(e).message),
  });
  const leaveMut = useMutation({
    mutationFn: () => subjectsApi.leave(subject.subject_id),
    onSuccess: () => { toast.success('Left subject'); invalidate(); setConfirm(null); },
    onError:   (e) => toast.error(parseApiError(e).message),
  });
  // Two-stage delete: first download both exports locally (so the user
  // performing the action keeps a copy on their device), THEN fire the
  // DELETE. If the download step fails the delete is aborted entirely.
  const deleteMut = useMutation({
    mutationFn: async () => {
      await downloadCoreAndAttempts(subject.subject_name, (type) =>
        subjectsApi.exportBlob(subject.subject_id, type),
      );
      return subjectsApi.remove(subject.subject_id);
    },
    onSuccess: () => { toast.success(`"${subject.subject_name}" deleted. Local copy downloaded; collaborators emailed.`); invalidate(); setConfirm(null); },
    onError:   (e) => toast.error(parseApiError(e).message || 'Could not export — deletion cancelled.'),
  });

  const onExport = async (type: 'core' | 'attempts') => {
    try {
      const blob = await subjectsApi.exportBlob(subject.subject_id, type);
      const safe = subject.subject_name.replace(/\s+/g, '_');
      downloadBlob(blob, `${safe}_${type}_${Date.now()}.xlsx`);
      toast.success(`Export ready — ${type}`);
    } catch (e) {
      toast.error(parseApiError(e).message);
    }
  };

  const navigateIn = () => {
    if (cardBlocked) return;
    navigate(`/practice/subjects/${subject.subject_id}/topics`);
  };

  return (
    <>
      <div
        className={cn(
          'card card-hover p-5 flex flex-col h-full relative',
          cardBlocked && 'opacity-95 ring-1 ring-amber-200',
        )}
      >
        {/* Top row: super-access badge + 3-dot */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {isSuperAccess && (
              <Badge tone="amber" icon={<ShieldCheck className="h-3 w-3" />} size="sm">Super Access</Badge>
            )}
            {subjectLocked && (
              <Badge tone="red" icon={<Lock className="h-3 w-3" />} size="sm">Subject locked</Badge>
            )}
            {!isAdmin && deptLock && (
              <Badge tone="amber" icon={<EyeOff className="h-3 w-3" />} size="sm">Dept hidden</Badge>
            )}
          </div>

          {isCollaborator && (subjectLocked && !isSuperAccess) ? (
            // Subject is locked and current user has no super-access → backend
            // would 403 on every menu action. Show the icon disabled instead of
            // letting the user click into a guaranteed error.
            <button
              type="button"
              disabled
              title="Subject is locked. Only the owner / Admin can act on it."
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 cursor-not-allowed -mr-1 -mt-1"
              aria-label="Actions disabled — subject locked"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          ) : isCollaborator && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-navy-800 -mr-1 -mt-1"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Subject actions</DropdownMenuLabel>
                <DropdownMenuItem icon={<Users className="h-4 w-4" />} onSelect={() => setCollabsOpen(true)}>
                  View collaborators
                </DropdownMenuItem>

                {isSuperAccess && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={<Users className="h-4 w-4" />} onSelect={() => setManageOpen(true)}>
                      Manage collaborators
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<Pencil className="h-4 w-4" />} onSelect={() => setEditOpen(true)}>
                      Edit subject name
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      icon={subjectLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      onSelect={() => setConfirm('lock')}
                    >
                      {subjectLocked ? 'Unlock subject' : 'Lock subject'}
                    </DropdownMenuItem>
                  </>
                )}

                {/* Dept view lock — collaborators only, not Admin */}
                {!isAdmin && isCollaborator && (
                  <DropdownMenuItem
                    icon={deptLock ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    onSelect={() => setConfirm('deptLock')}
                  >
                    {deptLock ? 'Show to my dept' : 'Hide from my dept'}
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<Download className="h-4 w-4" />} onSelect={() => onExport('core')}>
                  Export — core
                </DropdownMenuItem>
                <DropdownMenuItem icon={<Download className="h-4 w-4" />} onSelect={() => onExport('attempts')}>
                  Export — attempts
                </DropdownMenuItem>

                {/* Leave (not super, and not Admin) */}
                {!isSuperAccess && !isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem icon={<LogOut className="h-4 w-4" />} onSelect={() => setConfirm('leave')}>
                      Leave subject
                    </DropdownMenuItem>
                  </>
                )}

                {isSuperAccess && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem danger icon={<Trash2 className="h-4 w-4" />} onSelect={() => setConfirm('delete')}>
                      Delete subject
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Body */}
        <button
          type="button"
          onClick={navigateIn}
          disabled={cardBlocked}
          className="text-left flex-1 group"
        >
          <h3 className={cn(
            'font-display font-bold text-navy-900 text-lg leading-snug line-clamp-2 transition-colors',
            !cardBlocked && 'group-hover:text-navy-700',
          )}>
            {subject.subject_name}
          </h3>
          <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-4 w-4 text-slate-400" />
              <span className="font-semibold text-navy-800">{subject.topics_count}</span>
              <span className="text-xs text-slate-500">topics</span>
            </span>
            {isCollaborator && subject.creator && (
              <>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span className="text-xs text-slate-500">
                  creator: <span className="font-semibold text-navy-700">{subject.creator}</span>
                </span>
              </>
            )}
          </div>
        </button>

        {/* CTA */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
          {cardBlocked ? (
            <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" />
              {subjectLocked ? 'Locked by owner' : 'Hidden by your dept'}
            </p>
          ) : (
            <span className="text-xs text-slate-400">Tap to open topics</span>
          )}
          <Button
            size="sm"
            variant={cardBlocked ? 'outline' : 'primary'}
            disabled={cardBlocked}
            onClick={navigateIn}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
          >
            View topics
          </Button>
        </div>
      </div>

      {/* ─── Confirm dialogs ───────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirm === 'lock'} onOpenChange={(o) => !o && setConfirm(null)}
        title={subjectLocked ? 'Unlock subject?' : 'Lock subject?'}
        description={subjectLocked
          ? 'Collaborators will regain access to topics, sets, and practice.'
          : 'All collaborators will be blocked from entering this subject. Only the owner and Admin can edit while locked.'}
        confirmText={subjectLocked ? 'Unlock' : 'Lock'}
        destructive={!subjectLocked}
        loading={lockMut.isPending}
        onConfirm={() => lockMut.mutate()}
      />
      <ConfirmDialog
        open={confirm === 'deptLock'} onOpenChange={(o) => !o && setConfirm(null)}
        title={deptLock ? 'Show subject to your department?' : 'Hide subject from your department?'}
        description={deptLock
          ? 'Students and staff in your department will see this subject again.'
          : 'Students and staff in your department will no longer see this subject. Other collaborating departments are not affected.'}
        confirmText={deptLock ? 'Show' : 'Hide'}
        destructive={!deptLock}
        loading={deptLockMut.isPending}
        onConfirm={() => deptLockMut.mutate()}
      />
      <ConfirmDialog
        open={confirm === 'leave'} onOpenChange={(o) => !o && setConfirm(null)}
        title="Leave this subject?"
        description="Your department will no longer collaborate on this subject. You can request to rejoin later."
        confirmText="Leave"
        destructive
        loading={leaveMut.isPending}
        onConfirm={() => leaveMut.mutate()}
      />
      <ConfirmDialog
        open={confirm === 'delete'} onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete "${subject.subject_name}"?`}
        description="All topics, sets, and practice attempts under this subject will be permanently deleted. A full export is emailed to collaborators automatically."
        confirmText="Delete subject"
        destructive
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
      />

      {/* ─── Heavy dialogs ─────────────────────────────────────────────── */}
      <CollaboratorsListDialog
        open={collabsOpen} onOpenChange={setCollabsOpen}
        subject={subject}
      />
      {isSuperAccess && (
        <ManageCollaboratorsDialog
          open={manageOpen} onOpenChange={setManageOpen}
          subject={subject}
        />
      )}
      {isSuperAccess && (
        <EditSubjectNameDialog
          open={editOpen} onOpenChange={setEditOpen}
          subject={subject}
        />
      )}
    </>
  );
};
