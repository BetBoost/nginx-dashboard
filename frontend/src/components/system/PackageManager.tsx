import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Trash2, RefreshCw, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  fetchCurated,
  fetchInstalledPackages,
  installPackages,
  removePackages,
  upgradePackages,
} from '@/api/system';

export interface PackageManagerProps {
  serverId: string;
  onRun: (runId: string, title: string) => void;
}

export function PackageManager({ serverId, onRun }: PackageManagerProps) {
  const qc = useQueryClient();
  const [customInput, setCustomInput] = useState('');
  const [search, setSearch] = useState('');

  const { data: curated } = useQuery({
    queryKey: ['system', serverId, 'curated'],
    queryFn: () => fetchCurated(serverId),
    staleTime: 60 * 60_000,
  });

  const { data: installed, isLoading, refetch } = useQuery({
    queryKey: ['system', serverId, 'installed', search],
    queryFn: () => fetchInstalledPackages(serverId, search || undefined),
  });

  const installMutation = useMutation({
    mutationFn: ({ packages, label }: { packages: string[]; label: string }) =>
      installPackages(serverId, packages).then((r) => ({ ...r, label })),
    onSuccess: ({ runId, label }) => {
      onRun(runId, `Installiere: ${label}`);
    },
    onError: () => undefined,
  });

  const removeMutation = useMutation({
    mutationFn: ({ pkg, purge }: { pkg: string; purge: boolean }) =>
      removePackages(serverId, [pkg], purge).then((r) => ({ ...r, pkg, purge })),
    onSuccess: ({ runId, pkg, purge }) => {
      onRun(runId, `${purge ? 'Purge' : 'Entferne'}: ${pkg}`);
      setTimeout(() => qc.invalidateQueries({ queryKey: ['system', serverId, 'installed'] }), 5000);
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: () => upgradePackages(serverId),
    onSuccess: ({ runId }) => {
      onRun(runId, 'apt upgrade');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['system', serverId, 'installed'] }), 5000);
    },
  });

  const handleCustomInstall = () => {
    const pkgs = customInput
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pkgs.length) {
      toast.error('Bitte mindestens ein Paket eingeben');
      return;
    }
    installMutation.mutate({ packages: pkgs, label: pkgs.join(', ') });
    setCustomInput('');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Schnellinstallation"
          subtitle="Häufig benötigte Pakete mit einem Klick installieren"
          action={
            <button
              className="btn-secondary"
              onClick={() => upgradeMutation.mutate()}
              disabled={upgradeMutation.isPending}
            >
              <RefreshCw size={14} /> apt upgrade
            </button>
          }
        />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {curated?.map((p) => (
            <button
              key={p.id}
              className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-800 dark:hover:border-brand-600 dark:hover:bg-brand-900/10"
              disabled={installMutation.isPending}
              onClick={() => installMutation.mutate({ packages: p.packages, label: p.label })}
            >
              <Package size={18} className="mt-0.5 shrink-0 text-brand-500" />
              <div className="min-w-0">
                <div className="font-medium">{p.label}</div>
                <div className="truncate text-xs text-slate-500">{p.description}</div>
                <div className="mt-1 font-mono text-[10px] text-slate-400">{p.packages.join(' ')}</div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Eigene Pakete" subtitle="Komma- oder Leerzeichen-getrennt (z. B. nginx-extras vim postgresql-client)" />
        <div className="mt-3 flex gap-2">
          <input
            className="input flex-1"
            placeholder="z. B. nginx vim postgresql-client"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomInstall();
            }}
          />
          <button
            className="btn-primary"
            onClick={handleCustomInstall}
            disabled={installMutation.isPending || !customInput.trim()}
          >
            <Plus size={14} /> Installieren
          </button>
        </div>
      </Card>

      <Card className="p-0">
        <CardHeader
          title="Installierte Pakete"
          subtitle={installed ? `${installed.length} Pakete` : '…'}
          className="p-5"
          action={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-7"
                  placeholder="Filter…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button className="btn-secondary" onClick={() => refetch()}>
                <RefreshCw size={14} />
              </button>
            </div>
          }
        />
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/60">
              <tr>
                <th className="px-4 py-2">Paket</th>
                <th className="px-4 py-2">Version</th>
                <th className="px-4 py-2 text-right">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {isLoading ? (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">Lädt…</td></tr>
              ) : installed?.length ? (
                installed.slice(0, 500).map((p) => (
                  <tr key={p.name} className="table-row-hover">
                    <td className="px-4 py-2 font-mono text-xs">{p.name}</td>
                    <td className="px-4 py-2"><Badge tone="gray">{p.version}</Badge></td>
                    <td className="px-4 py-2 text-right">
                      <button
                        className="btn-ghost p-1 text-red-600"
                        title="Entfernen"
                        onClick={() => {
                          if (confirm(`Paket ${p.name} entfernen?`)) {
                            removeMutation.mutate({ pkg: p.name, purge: false });
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-500">Keine Pakete gefunden.</td></tr>
              )}
            </tbody>
          </table>
          {installed && installed.length > 500 && (
            <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
              … {installed.length - 500} weitere ausgeblendet — Filter eingeben, um einzugrenzen.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
