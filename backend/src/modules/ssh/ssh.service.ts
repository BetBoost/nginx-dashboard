import { Injectable, Logger } from '@nestjs/common';
import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import { Server } from '@prisma/client';

import { CryptoService } from '@common/crypto/crypto.service';

export interface SshResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface SshExecOptions {
  /** Total command timeout in milliseconds (default 30s). */
  timeoutMs?: number;
  /** Stdin contents — useful for writing files via `tee`. */
  stdin?: string;
  /** Optional onData hook (live log streaming, e.g. via WebSocket). */
  onData?: (chunk: string, stream: 'stdout' | 'stderr') => void;
}

const DEFAULT_TIMEOUT = 30_000;

/**
 * Thin promise-based wrapper around `ssh2`.
 *
 * One Client per call — connection pooling can be added later, but the per-call
 * cost is small and pooling complicates secret handling (the decrypted private
 * key would have to be kept resident in memory).
 */
@Injectable()
export class SshService {
  private readonly logger = new Logger(SshService.name);

  constructor(private readonly crypto: CryptoService) {}

  /** Tests TCP+auth+banner negotiation. Returns banner/uname output. */
  async testConnection(server: Server): Promise<{ ok: true; uname: string } | { ok: false; error: string }> {
    try {
      const r = await this.exec(server, 'uname -a');
      if ((r.code ?? 0) !== 0) {
        return { ok: false, error: r.stderr.trim() || `exit ${r.code}` };
      }
      return { ok: true, uname: r.stdout.trim() };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Run a single command on the remote server. */
  exec(server: Server, command: string, options: SshExecOptions = {}): Promise<SshResult> {
    const config = this.buildConnectConfig(server);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
    const start = Date.now();

    return new Promise<SshResult>((resolve, reject) => {
      const conn = new Client();
      let stdout = '';
      let stderr = '';
      let finished = false;
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        conn.end();
        reject(new Error(`SSH timeout after ${timeoutMs}ms while running: ${command}`));
      }, timeoutMs);

      const done = (result: SshResult | Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        conn.end();
        if (result instanceof Error) reject(result);
        else resolve(result);
      };

      conn
        .on('ready', () => {
          conn.exec(command, { pty: false }, (err, stream: ClientChannel) => {
            if (err) return done(err);
            if (options.stdin) {
              stream.stdin.write(options.stdin);
              stream.stdin.end();
            }
            stream
              .on('close', (code: number | null, signal: string | null) => {
                done({
                  code,
                  signal,
                  stdout,
                  stderr,
                  durationMs: Date.now() - start,
                });
              })
              .on('data', (data: Buffer) => {
                const s = data.toString('utf8');
                stdout += s;
                options.onData?.(s, 'stdout');
              });
            stream.stderr.on('data', (data: Buffer) => {
              const s = data.toString('utf8');
              stderr += s;
              options.onData?.(s, 'stderr');
            });
          });
        })
        .on('error', (err) => done(err))
        .connect(config);
    });
  }

  /** Convenience: write a file to the remote server via `tee`. */
  async writeFile(server: Server, remotePath: string, contents: string, sudo = true): Promise<SshResult> {
    const escapedPath = remotePath.replace(/(["\\$`])/g, '\\$1');
    const cmd = `${sudo ? 'sudo ' : ''}tee "${escapedPath}" > /dev/null`;
    return this.exec(server, cmd, { stdin: contents });
  }

  /** Run multiple commands sequentially and bail on the first failure. */
  async runScript(server: Server, commands: string[], opts: SshExecOptions = {}): Promise<SshResult[]> {
    const results: SshResult[] = [];
    for (const cmd of commands) {
      const r = await this.exec(server, cmd, opts);
      results.push(r);
      if ((r.code ?? 0) !== 0) break;
    }
    return results;
  }

  private buildConnectConfig(server: Server): ConnectConfig {
    const base: ConnectConfig = {
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: 15_000,
      keepaliveInterval: 10_000,
    };
    if (server.passwordEnc && !server.privateKeyEnc) {
      return {
        ...base,
        password: this.crypto.decrypt(server.passwordEnc),
        tryKeyboard: true,
      };
    }
    if (!server.privateKeyEnc) {
      throw new Error('Server has no SSH credentials configured');
    }
    return {
      ...base,
      privateKey: this.crypto.decrypt(server.privateKeyEnc),
      passphrase: server.passphraseEnc ? this.crypto.decrypt(server.passphraseEnc) : undefined,
      tryKeyboard: false,
    };
  }
}
