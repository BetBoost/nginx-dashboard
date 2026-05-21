import { cn } from '@/lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card p-5', className)} {...props} />;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div>
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
