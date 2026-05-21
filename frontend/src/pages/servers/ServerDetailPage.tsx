import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ServerForm } from '@/components/forms/ServerForm';
import { deleteServer, getServer, serverStatus, listSubdomains } from '@/api/queries';

export function ServerDetailPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: server } = useQuery({ queryKey: ['server', id], queryFn: () => getServer(id) });
  const { data: status } = useQuery({
    queryKey: ['server-status', id],
    queryFn: () => serverStatus(id),
    refetchInterval: 30_000,
  });
  const { data: subs } = useQuery({
    queryKey: ['subdomains', { serverId: id }],
    queryFn: () => listSubdomains({ page: 1, pageSize: 50, serverId: id }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteServer(id),
    onSuccess: () => {
      toast.success('Server deleted');
      qc.invalidateQueries({ queryKey: ['servers'] });
      navigate('/servers');
    },
  });

  if (!server) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div>
      <PageHeader
        title={server.name}
        description={`${server.username}@${server.host}:${server.port}`}
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={16} /> Edit
            </button>
            <button
              className="btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Nginx process" />
          <div className="mt-3 space-y-1 text-sm">
            <Row label="Running">
              {status?.running ? <Badge tone="green">running</Badge> : <Badge tone="red">stopped</Badge>}
            </Row>
            <Row label="Version">{status?.version ?? '—'}</Row>
            <Row label="Workers">{status?.workerCount ?? '—'}</Row>
            <Row label="Uptime">{status?.uptimeSeconds ? `${Math.floor(status.uptimeSeconds / 3600)}h` : '—'}</Row>
          </div>
        </Card>

        <Card>
          <CardHeader title="Paths" />
          <div className="mt-3 space-y-1 font-mono text-xs">
            <Row label="sites-available">{server.sitesAvailable}</Row>
            <Row label="sites-enabled">{server.sitesEnabled}</Row>
            <Row label="reload">{server.reloadCommand}</Row>
            <Row label="test">{server.testCommand}</Row>
          </div>
        </Card>

        <Card>
          <CardHeader title="Meta" />
          <div className="mt-3 space-y-1 text-sm">
            <Row label="Auth">
              <Badge tone={server.authMethod === 'key' ? 'blue' : 'amber'}>
                {server.authMethod === 'key' ? 'SSH key' : 'password'}
              </Badge>
            </Row>
            <Row label="Certbot">
              {server.certbotEnabled ? <Badge tone="green">enabled</Badge> : <Badge>disabled</Badge>}
            </Row>
            <Row label="Last seen">
              {server.lastSeenAt ? format(new Date(server.lastSeenAt), 'PPp') : '—'}
            </Row>
            <Row label="Created">{format(new Date(server.createdAt), 'PP')}</Row>
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <CardHeader
          title="Subdomains on this server"
          subtitle={`${subs?.total ?? 0} total`}
          className="p-5"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/40">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Upstream</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">SSL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {subs?.items?.length ? (
                subs.items.map((s) => (
                  <tr key={s.id} className="table-row-hover">
                    <td className="px-4 py-3 font-medium">
                      <Link to={`/subdomains/${s.id}`} className="hover:text-brand-600">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {s.upstreamScheme}://{s.upstreamHost}:{s.upstreamPort}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3"><StatusBadge status={s.sslStatus} /></td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No subdomains yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${server.name}`}
        size="lg"
      >
        <ServerForm
          server={server}
          onSuccess={() => {
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ['server', id] });
            qc.invalidateQueries({ queryKey: ['servers'] });
          }}
        />
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => (deleteMutation.isPending ? undefined : setDeleteOpen(false))}
        title="Delete server?"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              className="btn-secondary"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </button>
            <button
              className="btn-primary bg-red-600 hover:bg-red-700"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              Delete
            </button>
          </div>
        }
      >
        <p className="text-sm">
          This permanently removes <span className="font-medium">{server.name}</span>{' '}
          ({server.host}). All subdomains and backups for this server will also be deleted.
        </p>
      </Modal>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
