import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { CheckCircle2, ExternalLink, Globe, Loader2, PauseCircle, Pencil, PlayCircle, RefreshCw, ShieldOff, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SubdomainForm } from '@/components/forms/SubdomainForm';
import {
  getSubdomain,
  previewSubdomainConfig,
  probeSubdomain,
  enableSubdomain,
  disableSubdomain,
  renewSubdomainSsl,
  deleteSubdomain,
} from '@/api/queries';
import { useNavigate } from 'react-router-dom';

export function SubdomainDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: sub } = useQuery({ queryKey: ['subdomain', id], queryFn: () => getSubdomain(id) });
  const { data: cfg } = useQuery({
    queryKey: ['subdomain-config', id],
    queryFn: () => previewSubdomainConfig(id),
  });
  const { data: probe, refetch: reprobe, isFetching: probing } = useQuery({
    queryKey: ['subdomain-probe', id],
    queryFn: () => probeSubdomain(id),
    enabled: false,
  });

  const enableMutation = useMutation({
    mutationFn: () => enableSubdomain(id),
    onSuccess: () => {
      toast.success('Enabled');
      qc.invalidateQueries({ queryKey: ['subdomain', id] });
      qc.invalidateQueries({ queryKey: ['subdomains'] });
    },
  });
  const disableMutation = useMutation({
    mutationFn: () => disableSubdomain(id),
    onSuccess: () => {
      toast.success('Disabled');
      qc.invalidateQueries({ queryKey: ['subdomain', id] });
      qc.invalidateQueries({ queryKey: ['subdomains'] });
    },
  });
  const renewMutation = useMutation({
    mutationFn: () => renewSubdomainSsl(id),
    onSuccess: () => {
      toast.success('SSL renewed');
      qc.invalidateQueries({ queryKey: ['subdomain', id] });
      qc.invalidateQueries({ queryKey: ['subdomains'] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteSubdomain(id),
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
      qc.invalidateQueries({ queryKey: ['subdomains'] });
      qc.removeQueries({ queryKey: ['subdomain', id] });
      navigate('/subdomains');
    },
  });

  if (!sub) return <p className="text-sm text-slate-500">Loading…</p>;
  const liveUrl = `${sub.sslStatus === 'ACTIVE' ? 'https' : 'http'}://${sub.name}`;

  return (
    <div>
      <PageHeader
        title={sub.name}
        description={`Routes to ${sub.upstreamScheme}://${sub.upstreamHost}:${sub.upstreamPort}`}
        actions={
          <div className="flex items-center gap-2">
            <a href={liveUrl} target="_blank" rel="noreferrer" className="btn-secondary">
              <ExternalLink size={14} /> Open
            </a>
            <button className="btn-secondary" onClick={() => setEditOpen(true)}>
              <Pencil size={14} /> Edit
            </button>
            {sub.status === 'ACTIVE' ? (
              <button className="btn-secondary" onClick={() => disableMutation.mutate()}>
                <PauseCircle size={14} /> Disable
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => enableMutation.mutate()}>
                <PlayCircle size={14} /> Enable
              </button>
            )}
            <button className="btn-secondary" onClick={() => renewMutation.mutate()} disabled={renewMutation.isPending}>
              {renewMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
              Renew SSL
            </button>
            <button
              className="btn-danger"
              onClick={() => setDeleteOpen(true)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? <Loader2 className="animate-spin" size={14} />
                : <Trash2 size={14} />}
              Delete
            </button>
          </div>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Status" />
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Subdomain"><StatusBadge status={sub.status} /></Row>
            <Row label="SSL"><StatusBadge status={sub.sslStatus} /></Row>
            <Row label="SSL expires">{sub.sslExpiresAt ? format(new Date(sub.sslExpiresAt), 'PPp') : '—'}</Row>
            <Row label="Last reload">{sub.lastReloadOk ? 'ok' : sub.lastReloadOk === false ? 'failed' : '—'}</Row>
          </div>
        </Card>
        <Card>
          <CardHeader title="Upstream" />
          <div className="mt-3 space-y-2 font-mono text-xs">
            <Row label="Scheme">{sub.upstreamScheme}</Row>
            <Row label="Host">{sub.upstreamHost}</Row>
            <Row label="Port">{sub.upstreamPort}</Row>
            <Row label="WebSocket">{sub.websocket ? 'yes' : 'no'}</Row>
            <Row label="Force HTTPS">{sub.forceHttps ? 'yes' : 'no'}</Row>
          </div>
        </Card>
        <Card>
          <CardHeader
            title="Live probe"
            action={
              <button className="btn-secondary py-1 px-2 text-xs" onClick={() => reprobe()}>
                {probing ? <Loader2 className="animate-spin" size={14} /> : <Globe size={14} />} Probe
              </button>
            }
          />
          <div className="mt-3 space-y-2 text-sm">
            <Row label="Reachable">
              {probe
                ? probe.reachable
                  ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 size={14} /> yes</span>
                  : <span className="inline-flex items-center gap-1 text-red-600"><ShieldOff size={14} /> no</span>
                : '—'}
            </Row>
            <Row label="HTTP status">{probe?.httpStatus ?? '—'}</Row>
            <Row label="Latency">{probe?.responseMs ? `${probe.responseMs} ms` : '—'}</Row>
            {probe?.error && <Row label="Error"><span className="text-red-500">{probe.error}</span></Row>}
          </div>
        </Card>
      </div>

      <Card className="p-0">
        <CardHeader title="Rendered nginx config" subtitle="Read-only preview" className="p-5" />
        <pre className="overflow-x-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
          {cfg?.config ?? '…'}
        </pre>
      </Card>

      {sub.lastError && (
        <Card className="mt-4 border-red-300 dark:border-red-700">
          <CardHeader title="Last error" />
          <pre className="mt-3 overflow-x-auto text-xs text-red-600 dark:text-red-300">{sub.lastError}</pre>
        </Card>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${sub.name}`}
        size="lg"
      >
        <SubdomainForm
          subdomain={sub}
          onSuccess={() => {
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ['subdomain', id] });
            qc.invalidateQueries({ queryKey: ['subdomain-config', id] });
            qc.invalidateQueries({ queryKey: ['subdomains'] });
          }}
        />
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete subdomain"
        description={
          <div className="space-y-2">
            <p>
              This will remove the nginx vhost, the sites-enabled symlink, the
              SSL certificate, and the certbot renewal config on the remote
              server, then delete the database row.
            </p>
            <p className="text-xs text-slate-500">This action cannot be undone.</p>
          </div>
        }
        typeToConfirm={sub.name}
        confirmLabel="Delete subdomain"
        tone="danger"
        pending={deleteMutation.isPending}
        onClose={() => {
          if (deleteMutation.isPending) return;
          setDeleteOpen(false);
        }}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
