import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Server } from '@prisma/client';

import { SshService } from '@modules/ssh/ssh.service';

export interface CertInfo {
  domain: string;
  notBefore: Date;
  notAfter: Date;
  daysRemaining: number;
  issuer: string;
}

export interface SslRemoveResult {
  domain: string;
  liveRemoved: boolean;
  archiveRemoved: boolean;
  renewalRemoved: boolean;
  certbotDeleteRan: boolean;
  warnings: string[];
}

export interface BrokenRenewal {
  domain: string;
  renewalConf: string;
  reason: string;
  cleaned: boolean;
}

/**
 * Wrapper around `certbot` and `openssl` running on the remote server.
 *
 * Provides defensive, idempotent operations:
 *   - issue, renew, safeRenew, inspect
 *   - certificateExists / renewalConfigExists
 *   - cleanupBrokenRenewals — repair stale renewal configs
 *   - remove — purge live + archive + renewal for a single domain
 *
 * None of these methods crash the process on remote failure; they translate
 * remote errors into BadGatewayException or fall back to manual cleanup.
 */
@Injectable()
export class SslService {
  private readonly logger = new Logger(SslService.name);

  constructor(private readonly ssh: SshService) {}

  // ── issue / renew ────────────────────────────────────────────────────

  async issue(server: Server, domain: string, email: string): Promise<void> {
    if (!server.certbotEnabled) {
      throw new BadGatewayException('Certbot is disabled for this server');
    }
    if (!isLikelyDomain(domain) || !isLikelyEmail(email)) {
      throw new BadGatewayException('Invalid domain or email');
    }

    const cmd =
      `sudo certbot --nginx -d ${shellQuote(domain)} ` +
      `--non-interactive --agree-tos --email ${shellQuote(email)} ` +
      `--redirect --keep-until-expiring`;

    const result = await this.ssh.exec(server, cmd, { timeoutMs: 180_000 });

    const combined = `${result.stdout}\n${result.stderr}`;
    // certbot occasionally exits non-zero with this exact message; treat as no-op success.
    const benignNoop =
      /Certificate not yet due for renewal/i.test(combined) ||
      /Keeping the existing certificate/i.test(combined);

    if ((result.code ?? 0) !== 0 && !benignNoop) {
      const detail = result.stderr.trim() || result.stdout.trim();
      this.logger.error(`certbot issue failed for ${domain}: ${detail}`);
      throw new BadGatewayException(
        `certbot failed (code ${result.code}): ${trimMultiline(detail)}`,
      );
    }
    this.logger.log(`Certbot issued/kept cert for ${domain}`);
  }

  /** Raw renew. Caller is responsible for ensuring the cert exists. */
  async renew(server: Server, domain: string): Promise<void> {
    if (!isLikelyDomain(domain)) {
      throw new BadGatewayException('Invalid domain');
    }
    const cmd = `sudo certbot renew --cert-name ${shellQuote(domain)} --non-interactive`;
    const result = await this.ssh.exec(server, cmd, { timeoutMs: 180_000 });
    if ((result.code ?? 0) !== 0) {
      throw new BadGatewayException(
        `certbot renew failed for ${domain}: ${trimMultiline(result.stderr || result.stdout)}`,
      );
    }
  }

  /**
   * Renew a cert iff the lineage is intact. Returns:
   *   - { renewed: true }  – renew ran (certbot may have decided "not yet due", still success)
   *   - { renewed: false, reason } – nothing to renew, lineage missing / broken
   *
   * Never throws for the "missing lineage" case — instead self-heals the renewal
   * config so the next nightly `certbot renew` doesn't spam the same error.
   */
  async safeRenew(
    server: Server,
    domain: string,
  ): Promise<{ renewed: boolean; reason?: string }> {
    const hasLive = await this.certificateExists(server, domain);
    const hasRenewal = await this.renewalConfigExists(server, domain);

    if (!hasLive && !hasRenewal) {
      return { renewed: false, reason: 'no certificate and no renewal config' };
    }
    if (!hasLive && hasRenewal) {
      // Renewal config without a live cert — exactly the broken state from the
      // bug report. Clean up so the system doesn't keep trying to renew a
      // ghost certificate.
      await this.cleanupRenewalConfig(server, domain);
      return { renewed: false, reason: 'renewal config pointed at missing cert; cleaned up' };
    }
    if (hasLive && !hasRenewal) {
      return { renewed: false, reason: 'live cert without renewal config (manual install?)' };
    }
    await this.renew(server, domain);
    return { renewed: true };
  }

  // ── existence probes ─────────────────────────────────────────────────

  /** True iff /etc/letsencrypt/live/<domain>/fullchain.pem is a regular file. */
  async certificateExists(server: Server, domain: string): Promise<boolean> {
    if (!isLikelyDomain(domain)) return false;
    const path = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
    const r = await this.ssh.exec(
      server,
      `sudo test -f ${shellQuote(path)} && echo yes || echo no`,
    );
    return r.stdout.trim() === 'yes';
  }

  /** True iff /etc/letsencrypt/renewal/<domain>.conf is a regular file. */
  async renewalConfigExists(server: Server, domain: string): Promise<boolean> {
    if (!isLikelyDomain(domain)) return false;
    const path = `/etc/letsencrypt/renewal/${domain}.conf`;
    const r = await this.ssh.exec(
      server,
      `sudo test -f ${shellQuote(path)} && echo yes || echo no`,
    );
    return r.stdout.trim() === 'yes';
  }

  /** Back-compat alias — historically meant "renewal config exists". */
  async certExists(server: Server, domain: string): Promise<boolean> {
    return this.renewalConfigExists(server, domain);
  }

  // ── cleanup ──────────────────────────────────────────────────────────

  /**
   * Walks /etc/letsencrypt/renewal/*.conf and removes any whose live cert
   * directory is missing. This is the root-cause fix for:
   *
   *     certbot renew failed:
   *     No certificate found with name <fqdn>
   *     (expected /etc/letsencrypt/renewal/<fqdn>.conf)
   *
   * Safe to run repeatedly. Returns the list of cleaned configs.
   */
  async cleanupBrokenRenewals(server: Server): Promise<BrokenRenewal[]> {
    // Print every renewal conf name and whether the live dir is present.
    // Output format per line: "<domain>\t<yes|no>"
    const probe = `
      set -e
      shopt -s nullglob
      for f in /etc/letsencrypt/renewal/*.conf; do
        base="$(basename "$f" .conf)"
        if sudo test -d "/etc/letsencrypt/live/$base"; then
          echo "$base\tyes"
        else
          echo "$base\tno"
        fi
      done
    `;
    const probeResult = await this.ssh.exec(server, `sudo bash -lc ${shellQuote(probe)}`);
    if ((probeResult.code ?? 0) !== 0) {
      this.logger.warn(
        `cleanupBrokenRenewals probe failed: ${probeResult.stderr.trim()}`,
      );
      return [];
    }

    const broken: BrokenRenewal[] = [];
    for (const line of probeResult.stdout.split('\n')) {
      const [domain, status] = line.trim().split('\t');
      if (!domain || status === 'yes') continue;
      const renewalConf = `/etc/letsencrypt/renewal/${domain}.conf`;
      const rm = await this.ssh.exec(
        server,
        `sudo rm -f ${shellQuote(renewalConf)} && sudo rm -rf ${shellQuote(`/etc/letsencrypt/archive/${domain}`)}`,
      );
      broken.push({
        domain,
        renewalConf,
        reason: 'live cert directory missing',
        cleaned: (rm.code ?? 0) === 0,
      });
      if ((rm.code ?? 0) !== 0) {
        this.logger.warn(`failed to clean broken renewal for ${domain}: ${rm.stderr.trim()}`);
      } else {
        this.logger.log(`cleaned broken renewal config for ${domain}`);
      }
    }
    return broken;
  }

  /** Purge renewal + archive for a single domain. Does not touch live/. */
  async cleanupRenewalConfig(server: Server, domain: string): Promise<void> {
    if (!isLikelyDomain(domain)) return;
    const cmd =
      `sudo rm -f ${shellQuote(`/etc/letsencrypt/renewal/${domain}.conf`)} && ` +
      `sudo rm -rf ${shellQuote(`/etc/letsencrypt/archive/${domain}`)}`;
    const r = await this.ssh.exec(server, cmd);
    if ((r.code ?? 0) !== 0) {
      this.logger.warn(`cleanupRenewalConfig(${domain}) failed: ${r.stderr.trim()}`);
    }
  }

  // ── removal ──────────────────────────────────────────────────────────

  /**
   * Idempotent full removal of a cert. Tries `certbot delete` first (which
   * cleans live/archive/renewal in one shot). If that fails (no such cert,
   * partially deleted), falls back to manual rm. Always returns a structured
   * summary instead of throwing — the caller (delete flow) wants to keep
   * going even if SSL cleanup is partial.
   */
  async remove(server: Server, domain: string): Promise<SslRemoveResult> {
    const result: SslRemoveResult = {
      domain,
      liveRemoved: false,
      archiveRemoved: false,
      renewalRemoved: false,
      certbotDeleteRan: false,
      warnings: [],
    };

    if (!isLikelyDomain(domain)) {
      result.warnings.push('invalid domain — skipped');
      return result;
    }

    const hasAnything =
      (await this.certificateExists(server, domain)) ||
      (await this.renewalConfigExists(server, domain));
    if (!hasAnything) {
      this.logger.log(`ssl.remove(${domain}): nothing to remove`);
      return result;
    }

    // 1. preferred path — certbot does the right thing across all three dirs.
    if (await this.renewalConfigExists(server, domain)) {
      const cmd = `sudo certbot delete --cert-name ${shellQuote(domain)} --non-interactive`;
      const r = await this.ssh.exec(server, cmd, { timeoutMs: 60_000 });
      result.certbotDeleteRan = true;
      if ((r.code ?? 0) !== 0) {
        result.warnings.push(
          `certbot delete failed (code ${r.code}): ${trimMultiline(r.stderr || r.stdout)}`,
        );
        this.logger.warn(`certbot delete ${domain} failed: ${r.stderr.trim()}`);
      } else {
        this.logger.log(`certbot delete ${domain} ok`);
      }
    }

    // 2. fallback / belt-and-braces — manually rm every place a cert lives.
    //    Safe to run even after a successful certbot delete (rm -rf is a no-op).
    const cleanup = await this.ssh.exec(
      server,
      [
        `sudo rm -rf ${shellQuote(`/etc/letsencrypt/live/${domain}`)}`,
        `sudo rm -rf ${shellQuote(`/etc/letsencrypt/archive/${domain}`)}`,
        `sudo rm -f  ${shellQuote(`/etc/letsencrypt/renewal/${domain}.conf`)}`,
      ].join(' && '),
    );
    if ((cleanup.code ?? 0) !== 0) {
      result.warnings.push(`manual cleanup failed: ${cleanup.stderr.trim()}`);
      this.logger.warn(`manual ssl cleanup ${domain} failed: ${cleanup.stderr.trim()}`);
    }

    result.liveRemoved = !(await this.certificateExists(server, domain));
    result.renewalRemoved = !(await this.renewalConfigExists(server, domain));

    // archive dir check
    const archiveCheck = await this.ssh.exec(
      server,
      `sudo test -d ${shellQuote(`/etc/letsencrypt/archive/${domain}`)} && echo yes || echo no`,
    );
    result.archiveRemoved = archiveCheck.stdout.trim() === 'no';

    return result;
  }

  /** @deprecated — use remove(). Kept for callers that prefer the old name. */
  async revoke(server: Server, domain: string): Promise<void> {
    const r = await this.remove(server, domain);
    if (!r.renewalRemoved || !r.liveRemoved) {
      throw new BadGatewayException(
        `ssl revoke incomplete for ${domain}: ${r.warnings.join('; ') || 'unknown error'}`,
      );
    }
  }

  // ── inspect ──────────────────────────────────────────────────────────

  async inspect(server: Server, domain: string): Promise<CertInfo | null> {
    if (!isLikelyDomain(domain)) return null;
    const path = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
    const cmd = `sudo openssl x509 -in ${shellQuote(path)} -noout -dates -issuer 2>/dev/null || true`;
    const r = await this.ssh.exec(server, cmd);
    if (!r.stdout.trim()) return null;

    const lines = r.stdout.trim().split('\n');
    const find = (prefix: string) =>
      lines.find((l) => l.startsWith(prefix))?.replace(prefix, '').trim() ?? '';

    const notBefore = parseOpenSslDate(find('notBefore='));
    const notAfter = parseOpenSslDate(find('notAfter='));
    if (!notBefore || !notAfter) return null;

    const daysRemaining = Math.floor((notAfter.getTime() - Date.now()) / 86400_000);
    return {
      domain,
      notBefore,
      notAfter,
      daysRemaining,
      issuer: find('issuer='),
    };
  }
}

// ── helpers ────────────────────────────────────────────────────────────

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function isLikelyDomain(s: string): boolean {
  // letters, digits, dots, hyphens — no whitespace, no shell metacharacters.
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(s);
}

function isLikelyEmail(s: string): boolean {
  return /^[^\s@'"`$]+@[^\s@'"`$]+\.[^\s@'"`$]+$/.test(s);
}

function parseOpenSslDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function trimMultiline(s: string, max = 800): string {
  const t = (s ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
