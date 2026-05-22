import { Info, Mail, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Tone = 'info' | 'mail' | 'warn' | 'success';

interface Props {
  /** Visual tone — drives both the colour palette and the leading icon. */
  tone?: Tone;
  /** Override the default icon for the chosen tone. */
  icon?: React.ReactNode;
  /** Optional extra classes appended after the tone classes. */
  className?: string;
  children: React.ReactNode;
}

const tonePalette: Record<Tone, { wrap: string; icon: string; text: string }> = {
  info: {
    wrap: 'bg-sky-50 border-sky-200',
    icon: 'text-sky-600',
    text: 'text-sky-900',
  },
  // `mail` is what we use for "this action notifies collaborators" messages —
  // the envelope icon makes the *what* (an email) immediately obvious without
  // making the strip feel alarming.
  mail: {
    wrap: 'bg-amber-50 border-amber-200',
    icon: 'text-amber-600',
    text: 'text-amber-900',
  },
  warn: {
    wrap: 'bg-amber-50 border-amber-300',
    icon: 'text-amber-700',
    text: 'text-amber-900',
  },
  success: {
    wrap: 'bg-emerald-50 border-emerald-200',
    icon: 'text-emerald-700',
    text: 'text-emerald-900',
  },
};

const defaultIconFor: Record<Tone, React.ReactNode> = {
  info:    <Info          className="h-4 w-4 shrink-0 mt-0.5" />,
  mail:    <Mail          className="h-4 w-4 shrink-0 mt-0.5" />,
  warn:    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />,
  success: <CheckCircle2  className="h-4 w-4 shrink-0 mt-0.5" />,
};

/**
 * Small inline note used inside dialogs and forms to explain side-effects
 * of an action (e.g. "this will email all collaborators"). Designed to be
 * unobtrusive — it sits inline with form content, not blocking it.
 */
export const InfoNote = ({ tone = 'info', icon, className, children }: Props) => {
  const t = tonePalette[tone];
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed',
        t.wrap, t.text, className,
      )}
    >
      <span className={t.icon}>{icon ?? defaultIconFor[tone]}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
};
