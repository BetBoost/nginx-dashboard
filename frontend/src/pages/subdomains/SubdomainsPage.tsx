import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Globe,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SubdomainForm } from '@/components/forms/SubdomainForm';

import {
  deleteSubdomain,
  disableSubdomain,
  enableSubdomain,
  listServers,
  listSubdomains,
  renewSubdomainSsl,
} from '@/api/queries';
import type { Paginated, Subdomain, SubdomainRemoveSummary } from '@/types';

export function SubdomainsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [serverId, setServerId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [openCreate, setOpenCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Subdomain | null>(null);

  const listKey = ['subdomains', { page, q, serverId, status }] as const;

  const { data: servers } = useQuery({
    queryKey: ['servers', { all: true }],
    queryFn: () => listServers({ pageSize: 200 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: () =>
      listSubdomains({
        page,
        pageSize: 20,
        q: q || undefined,
        serverId: serverId || undefined,
        status: status || undefined,
      }),
  });

  const enableMutation = useMutation({
    mutationFn: (id: string) => enableSubdomain(id),
    onSuccess: () => {
      toast.success('Enabled');
      qc.invalidateQueries({ queryKey: ['subdomains'] });
    },
  });
  const disableMutation = useMutation({
    mutationFn: (id: string) => disableSubdomain(id),
    onSuccess: () => {
      toast.success('Disabled');
      qc.invalidateQueries({ queryKey: ['subdomains'] });
    },
  });
  const renewMutation = useMutation({
    mutationFn: (id: string) => renewSubdomainSsl(id),
    onSuccess: () => {
      toast.success('SSL renewed');
      qc.invalidateQueries({ queryKey: ['subdomains'] });
    },
  });

  // ── delete: optimistic, with rollback ────────────────────────────────
  type DeleteCtx = { previous: Array<[QueryKey, Paginated<Subdomain> | undefined]> };
  const deleteMutation = useMutation<SubdomainRemoveSummary, Error, Subdomain, DeleteCtx>({
    mutationFn: (sub) => deleteSubdomain(sub.id),
    onMutate: async (sub) => {
      // Snapshot every cached subdomain list so we can roll back on error.
      await qc.cancelQueries({ queryKey: ['subdomains'] });
      const previous = qc.getQueriesData<Paginated<Subdomain>>({ queryKey: ['subdomains'] });
      qc.setQueriesData<Paginated<Subdomain>>({ queryKey: ['subdomains'] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((x) => x.id !== sub.id),
          total: Math.max(0, old.total - 1),
        };
      });
      return { previous };
    },
    onError: (_err, _sub, ctx) => {
      // Restore the previous cache. The axios interceptor already toasts the
      // user-facing error message; no need to duplicate it.
      ctx?.previous.forEach(([key, value]) => qc.setQueryData(key, value));
    },
    onSuccess: (summary) => {
      if (summary.warnings.length) {
        toast(
          `Deleted ${summary.name} with warnings:\n` +
            summary.warnings.slice(0, 3).join('\n'),
          { icon: '⚠️', duration: 6000 },
        );
      } else {
        toast.success(`Deleted ${summary.name}`);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['subdomains'] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Subdomains"
        description="Create and manage nginx vhosts across all your servers."
        actions={
          <button className="btn-primary" onClick={() => setOpenCreate(true)}>
            <Plus size={16} /> New subdomain
          </button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search by name or upstream…"
            className="input pl-9"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="input w-auto"
          value={serverId}
          onChange={(e) => { setServerId(e.target.value); setPage(1); }}
        >
          <option value="">All servers</option>
          {servers?.items?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
          <option value="ERROR">Error</option>
          <option value="PENDING">Pending</option>
        </select>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : !data?.items?.length ? (
          <EmptyState
            icon={<Globe size={24} />}
            title="No subdomains"
            description="Create your first subdomain to start routing traffic."
            action={
              <button className="btn-primary" onClick={() => setOpenCreate(true)}>
                <Plus size={16} /> New subdomain
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/40">
                <tr>
                  <th className="px-4 py-2">Domain</th>
                  <th className="px-4 py-2">Server</th>
                  <th className="px-4 py-2">Upstream</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">SSL</th>
                  <th className="px-4 py-2">Updated</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.items.map((s) => {
                  const isDeleting =
                    deleteMutation.isPending && deleteMutation.variables?.id === s.id;
                  return (
                    <tr
                      key={s.id}
                      className={`table-row-hover ${isDeleting ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link to={`/subdomains/${s.id}`} className="hover:text-brand-600">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">{s.server?.name ?? '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {s.upstreamScheme}://{s.upstreamHost}:{s.upstreamPort}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          {s.sslExpiresAt && (
                            <span className="mt-1 text-xs text-slate-400">
                              {format(new Date(s.sslExpiresAt), 'PP')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {format(new Date(s.updatedAt), 'PP p')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {s.status === 'ACTIVE' ? (
                            <button
                              className="btn-ghost p-1"
                              title="Disable"
                              disabled={isDeleting || disableMutation.isPending}
                              onClick={() => disableMutation.mutate(s.id)}
                            >
                              <PauseCircle size={16} />
                            </button>
                          ) : (
                            <button
                              className="btn-ghost p-1"
                              title="Enable"
                              disabled={isDeleting || enableMutation.isPending}
                              onClick={() => enableMutation.mutate(s.id)}
                            >
                              <PlayCircle size={16} />
                            </button>
                          )}
                          <button
                            className="btn-ghost p-1"
                            title="Renew SSL"
                            disabled={isDeleting || renewMutation.isPending}
                            onClick={() => renewMutation.mutate(s.id)}
                          >
                            {renewMutation.isPending && renewMutation.variables === s.id
                              ? <Loader2 className="animate-spin" size={16} />
                              : <RefreshCw size={16} />}
                          </button>
                          <button
                            className="btn-ghost p-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                            title="Delete"
                            disabled={isDeleting}
                            onClick={() => setDeleteTarget(s)}
                          >
                            {isDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />

      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Create subdomain"
        size="lg"
      >
        <SubdomainForm
          onSuccess={() => {
            setOpenCreate(false);
            qc.invalidateQueries({ queryKey: ['subdomains'] });
          }}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete subdomain"
        description={
          deleteTarget && (
            <div className="space-y-2">
              <p>
                This will remove the nginx vhost, the sites-enabled symlink, the SSL
                certificate, and the certbot renewal config on{' '}
                <span className="font-mono">{deleteTarget.server?.name ?? 'the remote server'}</span>,
                then delete the database row.
              </p>
              <p className="text-xs text-slate-500">This action cannot be undone.</p>
            </div>
          )
        }
        typeToConfirm={deleteTarget?.name}
        confirmLabel="Delete subdomain"
        tone="danger"
        pending={deleteMutation.isPending}
        onClose={() => {
          if (deleteMutation.isPending) return;
          setDeleteTarget(null);
        }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const target = deleteTarget;
          try {
            await deleteMutation.mutateAsync(target);
          } finally {
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
