import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, ShieldOff, Plus, Trash2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import {
  addFirewallRule,
  disableFirewall,
  enableFirewall,
  fetchFirewallStatus,
  removeFirewallRule,
  type AddFirewallRuleInput,
  type FirewallRule,
} from '@/api/system';

export interface FirewallManagerProps {
  serverId: string;
  onRun: (runId: string, title: string) => void;
}

export function FirewallManager({ serverId, onRun }: FirewallManagerProps) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['system', serverId, 'firewall'],
    queryFn: () => fetchFirewallStatus(serverId),
    refetchInterval: 15_000,
  });

  const enableMutation = useMutation({
    mutationFn: () => enableFirewall(serverId),
    onSuccess: ({ runId }) => {
      onRun(runId, 'Firewall aktivieren');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['system', serverId, 'firewall'] }), 8000);
    },
  });

  const disableMutation = useMutation({
    mutationFn: () => disableFirewall(serverId),
    onSuccess: () => {
      toast.success('Firewall deaktiviert');
      qc.invalidateQueries({ queryKey: ['system', serverId, 'firewall'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (rule: FirewallRule) => removeFirewallRule(serverId, rule.id),
    onSuccess: () => {
      toast.success('Regel entfernt');
      qc.invalidateQueries({ queryKey: ['system', serverId, 'firewall'] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Firewall-Status"
          subtitle={
            status?.backend === 'none'
              ? 'Keine Firewall installiert'
              : `Backend: ${status?.backend ?? '…'}`
          }
          action={
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={() => refetch()}>
                <RefreshCw size={14} />
              </button>
              {status?.backend === 'none' || !status?.active ? (
                <button
                  className="btn-primary"
                  onClick={() => enableMutation.mutate()}
                  disabled={enableMutation.isPending}
                >
                  <Shield size={14} /> Aktivieren
                </button>
              ) : (
                <button
                  className="btn-secondary text-red-600"
                  onClick={() => {
                    if (confirm('Firewall wirklich deaktivieren? Alle Regeln werden ausgesetzt.')) {
                      disableMutation.mutate();
                    }
                  }}
                  disabled={disableMutation.isPending}
                >
                  <ShieldOff size={14} /> Deaktivieren
                </button>
              )}
            </div>
          }
        />
        <div className="mt-3 flex items-center gap-3 text-sm">
          {status?.active ? <Badge tone="green">aktiv</Badge> : <Badge tone="gray">inaktiv</Badge>}
          <span className="text-slate-500">
            {status ? `${status.rules.length} Regeln` : 'Lädt…'}
          </span>
        </div>
        {status?.backend === 'none' && (
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            Auf dem Server ist weder UFW noch firewalld installiert. „Aktivieren" installiert UFW
            automatisch, öffnet zuerst Port 22 (SSH) und aktiviert die Firewall.
          </p>
        )}
      </Card>

      <Card className="p-0">
        <CardHeader
          title="Regeln"
          subtitle="Portfreigaben und Blockierungen"
          className="p-5"
          action={
            <button
              className="btn-primary"
              onClick={() => setAddOpen(true)}
              disabled={status?.backend === 'none'}
            >
              <Plus size={14} /> Regel hinzufügen
            </button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/60">
              <tr>
                <th className="px-4 py-2">Aktion</th>
                <th className="px-4 py-2">Port</th>
                <th className="px-4 py-2">Protokoll</th>
                <th className="px-4 py-2">Quelle</th>
                <th className="px-4 py-2">Kommentar</th>
                <th className="px-4 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Lädt…</td></tr>
              ) : status?.rules?.length ? (
                status.rules.map((r) => (
                  <tr key={r.id} className="table-row-hover">
                    <td className="px-4 py-2">
                      <Badge tone={r.action === 'allow' ? 'green' : 'red'}>{r.action}</Badge>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {r.portRange ? `${r.portRange.from}–${r.portRange.to}` : r.port ?? '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.protocol}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.source ?? 'any'}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{r.comment ?? ''}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        className="btn-ghost p-1 text-red-600"
                        title="Regel löschen"
                        onClick={() => {
                          if (confirm(`Regel ${r.action} ${r.port}/${r.protocol} löschen?`)) {
                            removeMutation.mutate(r);
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Keine Regeln.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {status?.raw && (
        <Card>
          <CardHeader title="Roh-Ausgabe" subtitle={`${status.backend} status`} />
          <pre className="mt-3 max-h-64 overflow-auto rounded bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">
{status.raw}
          </pre>
        </Card>
      )}

      <AddRuleModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (input) => {
          await addFirewallRule(serverId, input);
          toast.success('Regel hinzugefügt');
          qc.invalidateQueries({ queryKey: ['system', serverId, 'firewall'] });
          setAddOpen(false);
        }}
      />
    </div>
  );
}

function AddRuleModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: AddFirewallRuleInput) => Promise<void>;
}) {
  const [port, setPort] = useState<number | ''>('');
  const [protocol, setProtocol] = useState<'tcp' | 'udp'>('tcp');
  const [action, setAction] = useState<'allow' | 'deny'>('allow');
  const [source, setSource] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setPort('');
    setProtocol('tcp');
    setAction('allow');
    setSource('');
    setComment('');
  };

  const handleSubmit = async () => {
    if (typeof port !== 'number' || port < 1 || port > 65535) {
      toast.error('Port muss zwischen 1 und 65535 liegen');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        port,
        protocol,
        action,
        source: source.trim() || undefined,
        comment: comment.trim() || undefined,
      });
      reset();
    } catch {
      /* toast handled by interceptor */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Firewall-Regel hinzufügen"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={submitting}>Abbrechen</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
            Hinzufügen
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Port">
            <input
              className="input w-full"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="z. B. 443"
            />
          </Field>
          <Field label="Protokoll">
            <select
              className="input w-full"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as 'tcp' | 'udp')}
            >
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </Field>
        </div>
        <Field label="Aktion">
          <div className="flex gap-2">
            {(['allow', 'deny'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAction(a)}
                className={`btn-secondary flex-1 ${action === a ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : ''}`}
              >
                {a === 'allow' ? 'Erlauben (allow)' : 'Verweigern (deny)'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Quelle (optional)" hint="Nur diese IPv4-Adresse oder CIDR. Leer = alle.">
          <input
            className="input w-full"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="z. B. 10.0.0.0/24"
          />
        </Field>
        <Field label="Kommentar (optional)">
          <input
            className="input w-full"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={64}
            placeholder="z. B. HTTPS für Webfrontend"
          />
        </Field>
      </div>
    </Modal>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
