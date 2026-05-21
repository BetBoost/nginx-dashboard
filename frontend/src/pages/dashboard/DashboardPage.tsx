import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Globe, ServerCog, ShieldAlert } from 'lucide-react';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { listAudit, overview } from '@/api/queries';
import { Badge } from '@/components/ui/Badge';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export function DashboardPage() {
  const { data: stats } = useQuery({ queryKey: ['overview'], queryFn: overview });
  const { data: audit } = useQuery({
    queryKey: ['audit', { page: 1, pageSize: 8 }],
    queryFn: () => listAudit({ page: 1, pageSize: 8 }),
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Overview of your servers, subdomains and recent activity."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<ServerCog className="text-brand-500" />}
          label="Servers"
          value={stats?.serverCount ?? '—'}
          to="/servers"
        />
        <StatCard
          icon={<Globe className="text-emerald-500" />}
          label="Subdomains"
          value={stats?.subdomainCount ?? '—'}
          to="/subdomains"
        />
        <StatCard
          icon={<CheckCircle2 className="text-emerald-500" />}
          label="Active"
          value={stats?.activeSubdomains ?? '—'}
        />
        <StatCard
          icon={<ShieldAlert className="text-amber-500" />}
          label="Errors / expiring soon"
          value={`${stats?.errorSubdomains ?? 0} / ${stats?.expiringSoon ?? 0}`}
        />
      </div>

      <Card>
        <CardHeader title="Recent activity" subtitle="Last 8 audit events" />
        <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
          {audit?.items?.length ? (
            audit.items.map((row) => (
              <div key={row.id} className="flex items-center justify-between py-3 text-sm">
                <div className="flex items-center gap-3">
                  <Badge tone="blue">{row.action.replace(/_/g, ' ').toLowerCase()}</Badge>
                  <span className="text-slate-700 dark:text-slate-300">
                    {row.message ?? `${row.targetType ?? ''} ${row.targetId ?? ''}`}
                  </span>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>{row.actor?.email ?? 'system'}</div>
                  <div>{format(new Date(row.createdAt), 'PPp')}</div>
                </div>
              </div>
            ))
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No activity yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  to?: string;
}) {
  const inner = (
    <Card className="flex items-center gap-4">
      <div className="grid h-11 w-11 place-items-center rounded-lg bg-slate-100 dark:bg-slate-800">
        {icon}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
      </div>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}
