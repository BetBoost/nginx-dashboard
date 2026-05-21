import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuditAction, Server } from '@prisma/client';

import { SshService } from '@modules/ssh/ssh.service';
import { AuditService } from '@modules/audit/audit.service';
import { RunRegistry } from './run-registry';

export interface InstalledPackage {
  name: string;
  version: string;
}

/** Allow only safe package names: letters, digits, +, -, ., : (for arch suffix). */
const PACKAGE_NAME_RE = /^[a-z0-9][a-z0-9+\-.:]{0,127}$/i;

/** Curated quick-install presets shown in the UI. */
export const CURATED_PACKAGES: { id: string; label: string; description: string; packages: string[] }[] = [
  { id: 'nginx', label: 'Nginx', description: 'Webserver / Reverse Proxy', packages: ['nginx'] },
  { id: 'certbot', label: 'Certbot', description: "Let's Encrypt SSL Tooling", packages: ['certbot', 'python3-certbot-nginx'] },
  { id: 'docker', label: 'Docker', description: 'Container Runtime', packages: ['docker.io', 'docker-compose-plugin'] },
  { id: 'fail2ban', label: 'fail2ban', description: 'Brute-Force-Schutz', packages: ['fail2ban'] },
  { id: 'ufw', label: 'UFW', description: 'Uncomplicated Firewall', packages: ['ufw'] },
  { id: 'git', label: 'Git', description: 'Version Control', packages: ['git'] },
  { id: 'htop', label: 'htop', description: 'Process Monitor', packages: ['htop'] },
  { id: 'curl', label: 'curl', description: 'HTTP Client', packages: ['curl'] },
  { id: 'wget', label: 'wget', description: 'Downloader', packages: ['wget'] },
  { id: 'unzip', label: 'unzip', description: 'ZIP Entpacker', packages: ['unzip'] },
  { id: 'nodejs', label: 'Node.js', description: 'JavaScript Runtime', packages: ['nodejs', 'npm'] },
  { id: 'python3', label: 'Python 3', description: 'Python Runtime + pip', packages: ['python3', 'python3-pip'] },
];

@Injectable()
export class PackageService {
  private readonly logger = new Logger(PackageService.name);

  constructor(
    private readonly ssh: SshService,
    private readonly audit: AuditService,
    private readonly runs: RunRegistry,
  ) {}

  /** Lists installed packages via `dpkg-query`. */
  async list(server: Server, query?: string): Promise<InstalledPackage[]> {
    const r = await this.ssh.exec(
      server,
      "dpkg-query -W -f='${binary:Package}\\t${Version}\\n' 2>/dev/null",
      { timeoutMs: 60_000 },
    );
    if ((r.code ?? 0) !== 0) return [];
    const items: InstalledPackage[] = [];
    const q = query?.toLowerCase();
    for (const line of r.stdout.split('\n')) {
      if (!line.trim()) continue;
      const [name, version] = line.split('\t');
      if (!name) continue;
      if (q && !name.toLowerCase().includes(q)) continue;
      items.push({ name, version: version ?? '' });
    }
    return items;
  }

  /** Checks `which` for each candidate; returns names that resolve. */
  async whichAvailable(server: Server, binaries: string[]): Promise<Record<string, boolean>> {
    const checks: Record<string, boolean> = {};
    const list = binaries.filter((b) => /^[a-z0-9_.\-+]{1,64}$/i.test(b));
    if (!list.length) return checks;
    const cmd = list.map((b) => `command -v ${b} >/dev/null 2>&1 && echo "${b}:yes" || echo "${b}:no"`).join('; ');
    const r = await this.ssh.exec(server, cmd, { timeoutMs: 15_000 });
    for (const line of r.stdout.split('\n')) {
      const [name, val] = line.split(':');
      if (name) checks[name] = val?.trim() === 'yes';
    }
    return checks;
  }

  /** Async — kicks off an apt-get install streaming output into the run registry. */
  install(server: Server, packages: string[], actorId: string): string {
    const sanitized = this.sanitize(packages);
    const run = this.runs.create(server.id, 'package-install', `apt install ${sanitized.join(' ')}`);
    const env = 'DEBIAN_FRONTEND=noninteractive';
    const script = [
      `sudo ${env} apt-get update`,
      `sudo ${env} apt-get install -y ${sanitized.join(' ')}`,
    ];

    this.runScript(run.id, server, script)
      .then((res) => {
        void this.audit.log({
          action: AuditAction.PACKAGE_INSTALLED,
          actorId,
          targetType: 'Server',
          targetId: server.id,
          message: `installed ${sanitized.join(', ')} on ${server.name}`,
          meta: { exitCode: res.code, packages: sanitized },
        });
      })
      .catch(() => undefined);

    return run.id;
  }

  /** Async — kicks off apt-get remove streaming output into the run registry. */
  remove(server: Server, packages: string[], purge: boolean, actorId: string): string {
    const sanitized = this.sanitize(packages);
    const run = this.runs.create(server.id, 'package-remove', `apt ${purge ? 'purge' : 'remove'} ${sanitized.join(' ')}`);
    const cmd = `sudo DEBIAN_FRONTEND=noninteractive apt-get ${purge ? 'purge' : 'remove'} -y ${sanitized.join(' ')}`;

    this.runScript(run.id, server, [cmd])
      .then((res) => {
        void this.audit.log({
          action: AuditAction.PACKAGE_REMOVED,
          actorId,
          targetType: 'Server',
          targetId: server.id,
          message: `${purge ? 'purged' : 'removed'} ${sanitized.join(', ')} on ${server.name}`,
          meta: { exitCode: res.code, packages: sanitized, purge },
        });
      })
      .catch(() => undefined);

    return run.id;
  }

  /** Async — apt update + upgrade. */
  upgrade(server: Server, actorId: string): string {
    const run = this.runs.create(server.id, 'package-upgrade', 'apt upgrade');
    const env = 'DEBIAN_FRONTEND=noninteractive';
    const script = [
      `sudo ${env} apt-get update`,
      `sudo ${env} apt-get upgrade -y`,
    ];

    this.runScript(run.id, server, script)
      .then((res) => {
        void this.audit.log({
          action: AuditAction.PACKAGE_UPDATED,
          actorId,
          targetType: 'Server',
          targetId: server.id,
          message: `apt upgrade on ${server.name}`,
          meta: { exitCode: res.code },
        });
      })
      .catch(() => undefined);

    return run.id;
  }

  private sanitize(packages: string[]): string[] {
    if (!packages?.length) throw new BadRequestException('No packages provided');
    if (packages.length > 30) throw new BadRequestException('Too many packages in one request');
    const cleaned: string[] = [];
    for (const p of packages) {
      const trimmed = p.trim();
      if (!PACKAGE_NAME_RE.test(trimmed)) {
        throw new BadRequestException(`Invalid package name: ${p}`);
      }
      cleaned.push(trimmed);
    }
    return cleaned;
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
          timeoutMs: 15 * 60_000,
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
