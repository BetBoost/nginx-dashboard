import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

export interface RunChunk {
  runId: string;
  stream: 'stdout' | 'stderr';
  data: string;
  ts: number;
}

export interface RunDone {
  runId: string;
  code: number | null;
  signal: string | null;
  durationMs: number;
  error?: string;
}

interface RunRecord {
  id: string;
  serverId: string;
  kind: string;
  label: string;
  startedAt: number;
  emitter: EventEmitter;
  finished: boolean;
  result?: RunDone;
  buffer: RunChunk[];
}

const MAX_BUFFER_CHUNKS = 2000;
const RETENTION_MS = 10 * 60_000;

/**
 * In-memory registry of long-running SSH operations.
 *
 * Each run has a buffered chunk log so clients that connect mid-stream can
 * replay what they missed before subscribing to live updates.
 */
@Injectable()
export class RunRegistry {
  private readonly runs = new Map<string, RunRecord>();

  create(serverId: string, kind: string, label: string): RunRecord {
    const record: RunRecord = {
      id: randomUUID(),
      serverId,
      kind,
      label,
      startedAt: Date.now(),
      emitter: new EventEmitter(),
      finished: false,
      buffer: [],
    };
    record.emitter.setMaxListeners(50);
    this.runs.set(record.id, record);
    return record;
  }

  get(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  appendChunk(runId: string, stream: 'stdout' | 'stderr', data: string): void {
    const r = this.runs.get(runId);
    if (!r || r.finished) return;
    const chunk: RunChunk = { runId, stream, data, ts: Date.now() };
    if (r.buffer.length >= MAX_BUFFER_CHUNKS) r.buffer.shift();
    r.buffer.push(chunk);
    r.emitter.emit('chunk', chunk);
  }

  finish(runId: string, result: Omit<RunDone, 'runId'>): void {
    const r = this.runs.get(runId);
    if (!r || r.finished) return;
    r.finished = true;
    r.result = { runId, ...result };
    r.emitter.emit('done', r.result);
    setTimeout(() => this.runs.delete(runId), RETENTION_MS).unref();
  }
}
