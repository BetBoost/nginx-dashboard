import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { Server } from '@prisma/client';

import { SshService } from '@modules/ssh/ssh.service';
import { NginxTemplateService } from './nginx-template.service';

export interface DeployResult {
  configPath: string;
  enabledPath: string;
  backupPath: string | null;
  reloadOk: boolean;
  testStdout: string;
  testStderr: string;
}

export interface NginxRemoveResult {
  domain: string;
  configRemoved: boolean;
  enabledRemoved: boolean;
  backupsRemoved: boolean;
  reloadOk: boolean;
  warnings: string[];
}

/**
 * High level operations against the remote nginx installation. All mutating
 * operations are *atomic*:
 *
 *   1. snapshot the current sites-available config (if any)
 *   2. write the new one
 *   3. (un)link sites-enabled
 *   4. run `nginx -t`
 *   5. on failure → restore snapshot, remove broken symlink, abort
 *      on success → reload, drop snapshot
 *
 * The reload-on-success step is also gated by `nginx -t`, so we never call
 * `systemctl reload nginx` while the daemon would refuse to start.
 */
@Injectable()
export class NginxService {
  private readonly logger = new Logger(NginxService.name);

  constructor(
    private readonly ssh: SshService,
    private readonly template: NginxTemplateService,
  ) {}

  // ── deploy / undeploy ────────────────────────────────────────────────

  async deployConfig(
    server: Server,
    domain: string,
    config: string,
    enable = true,
  ): Promise<DeployResult> {
    if (!NginxTemplateService.isValidDomain(domain)) {
      throw new BadGatewayException(`Invalid domain: ${domain}`);
    }

    const filename = NginxTemplateService.configFilename(domain);
    const configPath = `${server.sitesAvailable}/${filename}`;
    const enabledPath = `${server.sitesEnabled}/${filename}`;
    const backupPath = `${configPath}.bak`;

    // 1. Snapshot (idempotent — cp -a is safe whether the source exists or not).
    const hadPrev = await this.fileExists(server, configPath);
    if (hadPrev) {
      const snap = await this.ssh.exec(
        server,
        `sudo cp -a ${q(configPath)} ${q(backupPath)}`,
      );
      if ((snap.code ?? 0) !== 0) {
        throw new BadGatewayException(
          `Failed to back up existing config: ${trim(snap.stderr)}`,
        );
      }
    }

    let symlinkChanged = false;
    let symlinkPrevTarget: string | null = null;
    try {
      // 2. Write new config.
      const writeRes = await this.ssh.writeFile(server, configPath, config, true);
      if ((writeRes.code ?? 0) !== 0) {
        throw new BadGatewayException(`Failed to write config: ${trim(writeRes.stderr)}`);
      }

      // 3. (Un)link sites-enabled. Remember what was there before so we can
      //    roll back a removal too.
      symlinkPrevTarget = await this.readlink(server, enabledPath);
      if (enable) {
        const link = await this.ssh.exec(
          server,
          `sudo ln -sfn ${q(configPath)} ${q(enabledPath)}`,
        );
        if ((link.code ?? 0) !== 0) {
          throw new BadGatewayException(`Failed to link sites-enabled: ${trim(link.stderr)}`);
        }
        symlinkChanged = symlinkPrevTarget !== configPath;
      } else {
        const rm = await this.ssh.exec(server, `sudo rm -f ${q(enabledPath)}`);
        if ((rm.code ?? 0) !== 0) {
          throw new BadGatewayException(`Failed to remove symlink: ${trim(rm.stderr)}`);
        }
        symlinkChanged = symlinkPrevTarget !== null;
      }

      // 4. Validate.
      const test = await this.ssh.exec(server, server.testCommand);
      if ((test.code ?? 0) !== 0) {
        throw new BadGatewayException(
          `nginx -t failed:\n${trim(test.stderr || test.stdout)}`,
        );
      }

      // 5. Reload — soft signal, also check exit code.
      const reload = await this.ssh.exec(server, server.reloadCommand);
      const reloadOk = (reload.code ?? 0) === 0;
      if (!reloadOk) {
        throw new BadGatewayException(`nginx reload failed: ${trim(reload.stderr)}`);
      }

      // 6. Success — drop the snapshot.
      if (hadPrev) {
        await this.ssh.exec(server, `sudo rm -f ${q(backupPath)}`);
      }

      return {
        configPath,
        enabledPath,
        backupPath: hadPrev ? backupPath : null,
        reloadOk: true,
        testStdout: test.stdout,
        testStderr: test.stderr,
      };
    } catch (err) {
      // Rollback: restore snapshot, undo symlink change. Best-effort, don't
      // mask the original error.
      await this.rollback(server, {
        configPath,
        enabledPath,
        backupPath,
        hadPrev,
        symlinkChanged,
        symlinkPrevTarget,
      }).catch((e) =>
        this.logger.error(`rollback for ${domain} failed: ${(e as Error).message}`),
      );
      this.logger.error(
        `deployConfig(${domain}) failed and was rolled back: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async disable(server: Server, domain: string): Promise<void> {
    const enabledPath = `${server.sitesEnabled}/${NginxTemplateService.configFilename(domain)}`;
    await this.ssh.exec(server, `sudo rm -f ${q(enabledPath)}`);
    await this.reload(server);
  }

  /**
   * Idempotent removal. Returns a per-step summary instead of throwing on
   * partial failure — the subdomain-delete flow wants to keep going even if
   * one step fails so the DB row can still be removed.
   *
   * Reload is gated by `nginx -t`. If the test fails (somebody else broke
   * unrelated config), we still try `reload` so the daemon picks up our
   * deletion, but we record the failure in `warnings`.
   */
  async remove(server: Server, domain: string): Promise<NginxRemoveResult> {
    const result: NginxRemoveResult = {
      domain,
      configRemoved: false,
      enabledRemoved: false,
      backupsRemoved: false,
      reloadOk: false,
      warnings: [],
    };

    if (!NginxTemplateService.isValidDomain(domain)) {
      result.warnings.push('invalid domain — skipped');
      return result;
    }

    const filename = NginxTemplateService.configFilename(domain);
    const configPath = `${server.sitesAvailable}/${filename}`;
    const enabledPath = `${server.sitesEnabled}/${filename}`;

    // rm -f is idempotent: it does not error on missing files.
    const rm = await this.ssh.exec(
      server,
      `sudo rm -f ${q(enabledPath)} ${q(configPath)} ${q(`${configPath}.bak`)}`,
    );
    if ((rm.code ?? 0) !== 0) {
      result.warnings.push(`rm failed: ${trim(rm.stderr)}`);
    } else {
      result.enabledRemoved = true;
      result.configRemoved = true;
      result.backupsRemoved = true;
    }

    // Validate & reload — but tolerate `nginx -t` failures from unrelated
    // configs. We still want our deletion to take effect.
    const test = await this.ssh.exec(server, server.testCommand);
    if ((test.code ?? 0) !== 0) {
      result.warnings.push(`nginx -t after remove failed: ${trim(test.stderr)}`);
    }
    const reload = await this.ssh.exec(server, server.reloadCommand);
    result.reloadOk = (reload.code ?? 0) === 0;
    if (!result.reloadOk) {
      result.warnings.push(`nginx reload after remove failed: ${trim(reload.stderr)}`);
    }
    return result;
  }

  async reload(server: Server): Promise<void> {
    const test = await this.ssh.exec(server, server.testCommand);
    if ((test.code ?? 0) !== 0) {
      throw new BadGatewayException(`nginx -t failed: ${trim(test.stderr)}`);
    }
    const r = await this.ssh.exec(server, server.reloadCommand);
    if ((r.code ?? 0) !== 0) {
      throw new BadGatewayException(`nginx reload failed: ${trim(r.stderr)}`);
    }
  }

  // ── status / monitoring ──────────────────────────────────────────────

  async status(server: Server): Promise<{
    running: boolean;
    version?: string;
    uptimeSeconds?: number;
    workerCount?: number;
  }> {
    const r = await this.ssh.exec(
      server,
      'nginx -v 2>&1; pgrep -c nginx; ps -C nginx -o etimes=,comm= | head -n 1',
    );
    if ((r.code ?? 0) !== 0) return { running: false };
    const lines = r.stdout.split('\n');
    const versionLine = lines.find((l) => l.startsWith('nginx version:'));
    const version = versionLine?.replace('nginx version: ', '').trim();
    const workerCount = Number(lines[1] ?? '0') || 0;
    const ps = lines.find((l) => /\d+\s+nginx/.test(l));
    const uptimeSeconds = ps ? Number(ps.trim().split(/\s+/)[0]) : undefined;
    return { running: workerCount > 0, version, workerCount, uptimeSeconds };
  }

  template_(): NginxTemplateService {
    return this.template;
  }

  // ── internals ────────────────────────────────────────────────────────

  private async rollback(
    server: Server,
    ctx: {
      configPath: string;
      enabledPath: string;
      backupPath: string;
      hadPrev: boolean;
      symlinkChanged: boolean;
      symlinkPrevTarget: string | null;
    },
  ): Promise<void> {
    // Restore config file.
    if (ctx.hadPrev) {
      await this.ssh.exec(
        server,
        `sudo mv -f ${q(ctx.backupPath)} ${q(ctx.configPath)}`,
      );
    } else {
      await this.ssh.exec(server, `sudo rm -f ${q(ctx.configPath)}`);
    }

    // Restore symlink.
    if (ctx.symlinkChanged) {
      if (ctx.symlinkPrevTarget) {
        await this.ssh.exec(
          server,
          `sudo ln -sfn ${q(ctx.symlinkPrevTarget)} ${q(ctx.enabledPath)}`,
        );
      } else {
        await this.ssh.exec(server, `sudo rm -f ${q(ctx.enabledPath)}`);
      }
    }

    // Best-effort: re-test the daemon. If this fails too, the operator has
    // bigger problems — but at least our caller will see the original error.
    await this.ssh.exec(server, server.testCommand).catch(() => undefined);
  }

  private async fileExists(server: Server, path: string): Promise<boolean> {
    const r = await this.ssh.exec(
      server,
      `sudo test -f ${q(path)} && echo yes || echo no`,
    );
    return r.stdout.trim() === 'yes';
  }

  /** Returns the link target if `path` is a symlink, else null. */
  private async readlink(server: Server, path: string): Promise<string | null> {
    const r = await this.ssh.exec(
      server,
      `sudo readlink ${q(path)} 2>/dev/null || true`,
    );
    const target = r.stdout.trim();
    return target.length ? target : null;
  }
}

// ── helpers ────────────────────────────────────────────────────────────

function q(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function trim(s: string, max = 800): string {
  const t = (s ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
