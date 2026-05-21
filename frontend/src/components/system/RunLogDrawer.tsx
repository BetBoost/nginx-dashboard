import { useEffect, useMemo, useRef, useState } from 'react';
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import {
  connectRunSocket,
  fetchRunSnapshot,
  type RunChunk,
  type RunDone,
} from '@/api/system';

export interface RunLogDrawerProps {
  serverId: string;
  runId: string | null;
  title: string;
  onClose: () => void;
  onFinished?: (result: RunDone) => void;
}

export function RunLogDrawer({ serverId, runId, title, onClose, onFinished }: RunLogDrawerProps) {
  const [chunks, setChunks] = useState<RunChunk[]>([]);
  const [done, setDone] = useState<RunDone | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  // Pull the current snapshot via REST, then stream live updates over WS.
  // We keep a `lastTs` cursor so socket replay doesn't duplicate REST chunks.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let lastTs = 0;
    let socket: ReturnType<typeof connectRunSocket> | null = null;
    setChunks([]);
    setDone(null);

    (async () => {
      try {
        const snap = await fetchRunSnapshot(serverId, runId);
        if (cancelled) return;
        const initial = snap.chunks ?? [];
        setChunks(initial);
        lastTs = initial.length ? initial[initial.length - 1].ts : 0;
        if (snap.finished && snap.result) {
          setDone(snap.result);
          finishedRef.current?.(snap.result);
          return;
        }
      } catch {
        /* fall through to socket */
      }

      socket = connectRunSocket();
      socket.on('connect', () => socket?.emit('subscribe', { runId }));
      socket.on('chunk', (chunk: RunChunk) => {
        if (cancelled || chunk.runId !== runId) return;
        if (chunk.ts <= lastTs) return;
        lastTs = chunk.ts;
        setChunks((prev) => [...prev, chunk]);
      });
      socket.on('done', (d: RunDone) => {
        if (cancelled || d.runId !== runId) return;
        setDone(d);
        finishedRef.current?.(d);
        socket?.disconnect();
      });
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [runId, serverId]);

  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [chunks, autoScroll]);

  const text = useMemo(() => chunks.map((c) => c.data).join(''), [chunks]);

  if (!runId) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl dark:bg-surface-dark">
        <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            {!done && <Loader2 size={16} className="shrink-0 animate-spin text-brand-500" />}
            {done && (done.code === 0
              ? <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
              : <XCircle size={16} className="shrink-0 text-red-500" />)}
            <h2 className="truncate text-sm font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div
          ref={logRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            setAutoScroll(atBottom);
          }}
          className="flex-1 overflow-y-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-100"
        >
          {text ? (
            <pre className="whitespace-pre-wrap break-words">{text}</pre>
          ) : (
            <p className="text-slate-500">Warte auf Output…</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
          <div>
            {done ? (
              <span className={cn('font-medium', done.code === 0 ? 'text-emerald-600' : 'text-red-600')}>
                {done.code === 0 ? 'Erfolgreich' : `Fehlgeschlagen (exit ${done.code ?? '?'})`}
                {' · '}
                {(done.durationMs / 1000).toFixed(1)}s
              </span>
            ) : (
              <span>Läuft…</span>
            )}
          </div>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-scroll
          </label>
        </div>
      </div>
    </div>
  );
}
