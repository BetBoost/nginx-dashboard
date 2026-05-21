import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { Badge } from '@/components/ui/Badge';
import { listAudit } from '@/api/queries';

const ACTIONS = [
  '', 'USER_LOGIN', 'USER_LOGOUT', 'SERVER_CREATED', 'SERVER_UPDATED', 'SERVER_DELETED',
  'SUBDOMAIN_CREATED', 'SUBDOMAIN_UPDATED', 'SUBDOMAIN_DELETED', 'SUBDOMAIN_ENABLED',
  'SUBDOMAIN_DISABLED', 'SSL_ISSUED', 'SSL_RENEWED', 'NGINX_RELOADED',
];

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit', { page, q, action }],
    queryFn: () => listAudit({ page, pageSize: 50, q: q || undefined, action: action || undefined }),
  });

  return (
    <div>
      <PageHeader title="Audit log" description="Every privileged action is recorded here." />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search messages…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <select
          className="input w-auto"
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
        >
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{a || 'Any action'}</option>
          ))}
        </select>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/40">
                <tr>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Actor</th>
                  <th className="px-4 py-2">Message</th>
                  <th className="px-4 py-2">IP</th>
                  <th className="px-4 py-2">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {data?.items?.length ? (
                  data.items.map((row) => (
                    <tr key={row.id} className="table-row-hover">
                      <td className="px-4 py-3">
                        <Badge tone="blue">{row.action.replace(/_/g, ' ').toLowerCase()}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">{row.actor?.email ?? 'system'}</td>
                      <td className="px-4 py-3">{row.message ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.ip ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {format(new Date(row.createdAt), 'PPpp')}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No entries.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />
    </div>
  );
}
