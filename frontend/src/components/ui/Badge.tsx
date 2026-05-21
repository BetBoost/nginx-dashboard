import { cn } from '@/lib/cn';

type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'violet';

const TONES: Record<Tone, string> = {
  gray:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  green:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  amber:  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  red:    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  blue:   'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
};

export function Badge({
  children,
  tone = 'gray',
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={cn('badge', TONES[tone], className)}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    ACTIVE:   { tone: 'green', label: 'Active' },
    PENDING:  { tone: 'amber', label: 'Pending' },
    DISABLED: { tone: 'gray',  label: 'Disabled' },
    ERROR:    { tone: 'red',   label: 'Error' },
    NONE:     { tone: 'gray',  label: 'No SSL' },
    EXPIRING: { tone: 'amber', label: 'SSL expiring' },
    EXPIRED:  { tone: 'red',   label: 'SSL expired' },
  };
  const entry = map[status] ?? { tone: 'gray' as Tone, label: status };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
