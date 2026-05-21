import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CheckCircle,
  Pencil,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { ServerForm } from '@/components/forms/ServerForm';
import { Modal } from '@/components/ui/Modal';

import { deleteServer, listServers, testServer } from '@/api/queries';
import type { Server as ServerType } from '@/types';

export function ServersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<ServerType | null>(null);
  const [deleting, setDeleting] = useState<ServerType | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['servers', { page, q }],
    queryFn: () => listServers({ page, pageSize: 20, q: q || undefined }),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => testServer(id),
    onSuccess: (res) => {
      if (res.ok) toast.success(`Reachable — ${res.uname?.split('\n')[0] ?? ''}`);
      else toast.error(`Unreachable: ${res.error ?? 'unknown error'}`);
      qc.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteServer(id),
    onSuccess: () => {
      toast.success('Server deleted');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Servers"
        description="Register and manage the Linux servers that run your nginx instances."
        actions={
          <button className="btn-primary" onClick={() => setOpenCreate(true)}>
            <Plus size={16} /> Add server
          </button>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Search by name or host…"
            className="input pl-9"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : !data?.items?.length ? (
          <EmptyState
            icon={<Server size={24} />}
            title="No servers yet"
            description="Add your first server to start managing nginx remotely."
            action={
              <button className="btn-primary" onClick={() => setOpenCreate(true)}>
                <Plus size={16} /> Add server
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/40">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Host</th>
                  <th className="px-4 py-2">Auth</th>
                  <th className="px-4 py-2">Subdomains</th>
                  <th className="px-4 py-2">Certbot</th>
                  <th className="px-4 py-2">Last seen</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.items.map((s) => {
                  const seen = s.lastSeenAt ? new Date(s.lastSeenAt) : null;
                  const fresh = seen ? Date.now() - seen.getTime() < 30 * 60_000 : false;
                  return (
                    <tr key={s.id} className="table-row-hover">
                      <td className="px-4 py-3 font-medium">
                        <Link to={`/servers/${s.id}`} className="hover:text-brand-600">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {s.username}@{s.host}:{s.port}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={s.authMethod === 'key' ? 'blue' : 'amber'}>
                          {s.authMethod === 'key' ? 'SSH key' : 'password'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="blue">{s._count?.subdomains ?? 0}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {s.certbotEnabled ? (
                          <Badge tone="green">
                            <ShieldCheck size={12} /> enabled
                          </Badge>
                        ) : (
                          <Badge>disabled</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          {fresh ? <Wifi size={12} className="text-emerald-500" /> : <WifiOff size={12} className="text-slate-400" />}
                          {seen ? format(seen, 'PP p') : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            className="btn-secondary py-1 px-2 text-xs"
                            onClick={() => testMutation.mutate(s.id)}
                            disabled={testMutation.isPending && testMutation.variables === s.id}
                          >
                            <CheckCircle size={14} /> Test
                          </button>
                          <button
                            className="btn-secondary py-1 px-2 text-xs"
                            onClick={() => setEditing(s)}
                            aria-label={`Edit ${s.name}`}
                          >
                            <Pencil size={14} /> Edit
                          </button>
                          <button
                            className="btn-secondary py-1 px-2 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => setDeleting(s)}
                            aria-label={`Delete ${s.name}`}
                          >
                            <Trash2 size={14} /> Delete
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

      <Pagination
        page={page}
        totalPages={data?.totalPages ?? 1}
        onChange={setPage}
      />

      <Modal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Register a new server"
        size="lg"
      >
        <ServerForm
          onSuccess={() => {
            setOpenCreate(false);
            qc.invalidateQueries({ queryKey: ['servers'] });
          }}
        />
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : 'Edit server'}
        size="lg"
      >
        {editing && (
          <ServerForm
            server={editing}
            onSuccess={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ['servers'] });
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => (deleteMutation.isPending ? undefined : setDeleting(null))}
        title="Delete server?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="btn-secondary"
              onClick={() => setDeleting(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </button>
            <button
              className="btn-primary bg-red-600 hover:bg-red-700"
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </button>
          </div>
        }
      >
        {deleting && (
          <p className="text-sm">
            This permanently removes <span className="font-medium">{deleting.name}</span>{' '}
            ({deleting.host}). All subdomains and backups for this server will also be deleted.
          </p>
        )}
      </Modal>
    </div>
  );
}
