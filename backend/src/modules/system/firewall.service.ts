import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuditAction, Server } from '@prisma/client';

import { SshService } from '@modules/ssh/ssh.service';
import { AuditService } from '@modules/audit/audit.service';
import { RunRegistry } from './run-registry';

export type FirewallBackend = 'ufw' | 'firewalld' | 'none';
export type Protocol = 'tcp' | 'udp';
export type Action = 'allow' | 'deny';

export interface FirewallStatus {
  backend: FirewallBackend;
  active: boolean;
  rules: FirewallRule[];
  raw: string;
}

export interface FirewallRule {
  id: string;
  port?: number;
  portRange?: { from: number; to: number };
  protocol: Protocol | 'any';
  action: Action;
  source?: string;
  comment?: string;
}

export interface AddRuleInput {
  port: number;
  protocol: Protocol;
  action: Action;
  source?: string;
  comment?: string;
}

@Injectable()
export class FirewallService {
  private readonly logger = new Logger(FirewallService.name);

  constructor(
    private readonly ssh: SshService,
    private readonly audit: AuditService,
    private readonly runs: RunRegistry,
  ) {}

  /** Detect which firewall (if any) is installed and enabled. */
  async detect(server: Server): Promise<FirewallBackend> {
    const r = await this.ssh.exec(
      server,
      'command -v ufw >/dev/null 2>&1 && echo ufw || (command -v firewall-cmd >/dev/null 2>&1 && echo firewalld || echo none)',
      { timeoutMs: 10_000 },
    );
    const out = r.stdout.trim();
    return out === 'ufw' || out === 'firewalld' ? out : 'none';
  }

  async status(server: Server): Promise<FirewallStatus> {
    const backend = await this.detect(server);
    if (backend === 'ufw') return this.ufwStatus(server);
    if (backend === 'firewalld') return this.firewalldStatus(server);
    return { backend: 'none', active: false, rules: [], raw: '' };
  }

  /** Async — installs ufw if missing and enables it. */
  enable(server: Server, actorId: string): string {
    const run = this.runs.create(server.id, 'firewall-enable', 'firewall enable');
    const script = [
      'if ! command -v ufw >/dev/null 2>&1; then sudo DEBIAN_FRONTEND=noninteractive apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ufw; fi',
      'sudo ufw allow OpenSSH || sudo ufw allow 22/tcp',
      'echo "y" | sudo ufw enable',
      'sudo ufw status verbose',
    ];

    this.runScript(run.id, server, script)
      .then((res) => {
        void this.audit.log({
          action: AuditAction.FIREWALL_ENABLED,
          actorId,
          targetType: 'Server',
          targetId: server.id,
          message: `firewall enabled on ${server.name}`,
          meta: { exitCode: res.code },
        });
      })
      .catch(() => undefined);

    return run.id;
  }

  async disable(server: Server, actorId: string): Promise<{ ok: boolean; output: string }> {
    const backend = await this.detect(server);
    let cmd = '';
    if (backend === 'ufw') cmd = 'sudo ufw --force disable';
    else if (backend === 'firewalld') cmd = 'sudo systemctl stop firewalld && sudo systemctl disable firewalld';
    else throw new BadRequestException('No firewall installed');

    const r = await this.ssh.exec(server, cmd, { timeoutMs: 30_000 });
    await this.audit.log({
      action: AuditAction.FIREWALL_DISABLED,
      actorId,
      targetType: 'Server',
      targetId: server.id,
      message: `firewall disabled on ${server.name}`,
      meta: { exitCode: r.code },
    });
    return { ok: (r.code ?? 0) === 0, output: r.stdout + r.stderr };
  }

  async addRule(server: Server, input: AddRuleInput, actorId: string): Promise<FirewallStatus> {
    this.validatePort(input.port);
    this.validateSource(input.source);
    const backend = await this.detect(server);
    if (backend === 'none') throw new BadRequestException('No firewall installed — call enable() first');

    const comment = input.comment ? this.escapeComment(input.comment) : undefined;

    let cmd = '';
    if (backend === 'ufw') {
      const verb = input.action === 'allow' ? 'allow' : 'deny';
      const from = input.source ? `from ${input.source} ` : '';
      const to = input.source ? `to any ` : '';
      cmd = `sudo ufw ${verb} ${from}${to}port ${input.port} proto ${input.protocol}${
        comment ? ` comment '${comment}'` : ''
      }`;
    } else {
      const verb = input.action === 'allow' ? 'add' : 'remove';
      if (input.source) {
        const rich = `rule family=ipv4 source address=${input.source} port port=${input.port} protocol=${input.protocol} ${
          input.action === 'allow' ? 'accept' : 'drop'
        }`;
        cmd = `sudo firewall-cmd --permanent --${verb}-rich-rule='${rich}' && sudo firewall-cmd --reload`;
      } else {
        cmd = `sudo firewall-cmd --permanent --${verb}-port=${input.port}/${input.protocol} && sudo firewall-cmd --reload`;
      }
    }

    const r = await this.ssh.exec(server, cmd, { timeoutMs: 30_000 });
    if ((r.code ?? 0) !== 0) {
      throw new BadRequestException(`Firewall command failed: ${r.stderr.trim() || r.stdout.trim()}`);
    }
    await this.audit.log({
      action: AuditAction.FIREWALL_RULE_ADDED,
      actorId,
      targetType: 'Server',
      targetId: server.id,
      message: `${input.action} ${input.port}/${input.protocol}${input.source ? ` from ${input.source}` : ''} on ${server.name}`,
      meta: input as unknown as Record<string, unknown>,
    });
    return this.status(server);
  }

  async removeRule(server: Server, ruleId: string, actorId: string): Promise<FirewallStatus> {
    const current = await this.status(server);
    const rule = current.rules.find((r) => r.id === ruleId);
    if (!rule) throw new BadRequestException('Rule not found');

    let cmd = '';
    if (current.backend === 'ufw') {
      // ufw numbers rules deterministically — id encodes the position.
      const num = parseInt(ruleId.replace(/^ufw-/, ''), 10);
      if (!Number.isFinite(num)) throw new BadRequestException('Malformed rule id');
      cmd = `yes | sudo ufw delete ${num}`;
    } else if (current.backend === 'firewalld') {
      if (!rule.port) throw new BadRequestException('Cannot remove rule without port');
      cmd = `sudo firewall-cmd --permanent --remove-port=${rule.port}/${rule.protocol} && sudo firewall-cmd --reload`;
    } else {
      throw new BadRequestException('No firewall installed');
    }

    const r = await this.ssh.exec(server, cmd, { timeoutMs: 30_000 });
    if ((r.code ?? 0) !== 0) {
      throw new BadRequestException(`Firewall command failed: ${r.stderr.trim() || r.stdout.trim()}`);
    }
    await this.audit.log({
      action: AuditAction.FIREWALL_RULE_REMOVED,
      actorId,
      targetType: 'Server',
      targetId: server.id,
      message: `removed ${rule.action} ${rule.port}/${rule.protocol} on ${server.name}`,
      meta: rule as unknown as Record<string, unknown>,
    });
    return this.status(server);
  }

  // ── UFW parsing ────────────────────────────────────────────────────────

  private async ufwStatus(server: Server): Promise<FirewallStatus> {
    const r = await this.ssh.exec(server, 'sudo ufw status numbered', { timeoutMs: 15_000 });
    const raw = r.stdout;
    const active = /Status:\s*active/i.test(raw);
    const rules: FirewallRule[] = [];
    // Lines like:
    //   [ 1] 22/tcp                     ALLOW IN    Anywhere
    //   [ 2] 80,443/tcp                 ALLOW IN    Anywhere (v6)
    const re = /^\[\s*(\d+)\]\s+(\S+)\s+(ALLOW|DENY|REJECT|LIMIT)\s+IN\s+(\S+)(?:\s+#\s*(.*))?$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const [, num, dest, verbRaw, source, comment] = m;
      const action: Action = verbRaw.toUpperCase().startsWith('ALLOW') ? 'allow' : 'deny';
      const portPart = dest.split('/');
      const protocol = (portPart[1] as Protocol | undefined) ?? 'any';
      const portText = portPart[0];
      let port: number | undefined;
      let portRange: FirewallRule['portRange'];
      if (portText.includes(':')) {
        const [from, to] = portText.split(':').map(Number);
        portRange = { from, to };
      } else {
        const n = Number(portText);
        if (Number.isFinite(n)) port = n;
      }
      rules.push({
        id: `ufw-${num}`,
        port,
        portRange,
        protocol,
        action,
        source: source === 'Anywhere' ? undefined : source,
        comment: comment?.trim(),
      });
    }
    return { backend: 'ufw', active, rules, raw };
  }

  // ── firewalld parsing ──────────────────────────────────────────────────

  private async firewalldStatus(server: Server): Promise<FirewallStatus> {
    const r = await this.ssh.exec(
      server,
      'sudo firewall-cmd --state 2>/dev/null; echo ---; sudo firewall-cmd --list-all',
      { timeoutMs: 15_000 },
    );
    const raw = r.stdout;
    const active = /running/i.test(raw.split('---')[0] ?? '');
    const rules: FirewallRule[] = [];
    const portsMatch = raw.match(/ports:\s*(.*)$/m);
    if (portsMatch) {
      for (const entry of portsMatch[1].trim().split(/\s+/)) {
        if (!entry) continue;
        const [portStr, proto] = entry.split('/');
        const port = Number(portStr);
        if (!Number.isFinite(port)) continue;
        rules.push({
          id: `fwd-port-${port}-${proto}`,
          port,
          protocol: (proto as Protocol) ?? 'tcp',
          action: 'allow',
        });
      }
    }
    return { backend: 'firewalld', active, rules, raw };
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private validatePort(port: number): void {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new BadRequestException('Port must be 1..65535');
    }
  }

  private validateSource(source?: string): void {
    if (!source) return;
    // Accept IPv4 or IPv4 CIDR only; reject anything that could break out of the arg.
    if (!/^[0-9]{1,3}(\.[0-9]{1,3}){3}(\/[0-9]{1,2})?$/.test(source)) {
      throw new BadRequestException('source must be an IPv4 address or CIDR');
    }
  }

  private escapeComment(c: string): string {
    return c.replace(/[^\w \-.,:]/g, '').slice(0, 64);
  }

  private async runScript(
    runId: string,
    server: Server,
    commands: string[],
  ): Promise<{ code: number | null }> {
    const start = Date.now();
    let lastCode: number | null = 0;
    let error: string | undefined;
    try {
      for (const cmd of commands) {
        const r = await this.ssh.exec(server, cmd, {
          timeoutMs: 10 * 60_000,
          onData: (chunk, stream) => this.runs.appendChunk(runId, stream, chunk),
        });
        lastCode = r.code;
        if ((r.code ?? 0) !== 0) break;
      }
    } catch (err) {
      error = (err as Error).message;
      this.runs.appendChunk(runId, 'stderr', `\n[run failed] ${error}\n`);
    } finally {
      this.runs.finish(runId, {
        code: lastCode,
        signal: null,
        durationMs: Date.now() - start,
        error,
      });
    }
    return { code: lastCode };
  }
}
