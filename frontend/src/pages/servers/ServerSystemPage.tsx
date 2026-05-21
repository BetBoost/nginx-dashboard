import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Boxes, Shield, ArrowLeft } from 'lucide-react';

import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/ui/PageHeader';
import { getServer } from '@/api/queries';
import { PackageManager } from '@/components/system/PackageManager';
import { FirewallManager } from '@/components/system/FirewallManager';
import { RunLogDrawer } from '@/components/system/RunLogDrawer';

type Tab = 'packages' | 'firewall';

export function ServerSystemPage() {
  const { id = '' } = useParams();
  const [tab, setTab] = useState<Tab>('packages');
  const [run, setRun] = useState<{ runId: string; title: string } | null>(null);

  const { data: server } = useQuery({ queryKey: ['server', id], queryFn: () => getServer(id) });

  if (!server) return <p className="text-sm text-slate-500">Lädt…</p>;

  return (
    <div>
      <PageHeader
        title={`System: ${server.name}`}
        description={`${server.username}@${server.host}:${server.port}`}
        actions={
          <Link to={`/servers/${id}`} className="btn-secondary">
            <ArrowLeft size={14} /> Zurück zum Server
          </Link>
        }
      />

      <div className="mb-4 flex gap-1 border-b border-slate-200 dark:border-slate-800">
        <TabButton active={tab === 'packages'} onClick={() => setTab('packages')} icon={<Boxes size={14} />}>
          Pakete
        </TabButton>
        <TabButton active={tab === 'firewall'} onClick={() => setTab('firewall')} icon={<Shield size={14} />}>
          Firewall
        </TabButton>
      </div>

      {tab === 'packages' && (
        <PackageManager
          serverId={id}
          onRun={(runId, title) => setRun({ runId, title })}
        />
      )}
      {tab === 'firewall' && (
        <FirewallManager
          serverId={id}
          onRun={(runId, title) => setRun({ runId, title })}
        />
      )}

      <RunLogDrawer
        serverId={id}
        runId={run?.runId ?? null}
        title={run?.title ?? ''}
        onClose={() => setRun(null)}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
        active
          ? 'border-brand-500 text-brand-600 dark:text-brand-300'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
