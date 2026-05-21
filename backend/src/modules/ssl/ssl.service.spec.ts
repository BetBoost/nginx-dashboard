import { Test } from '@nestjs/testing';
import { Server } from '@prisma/client';

import { SshService, SshResult } from '@modules/ssh/ssh.service';
import { SslService } from './ssl.service';

/**
 * Behavioural tests for SslService. Verifies the self-healing semantics that
 * fix the bug reported in production:
 *
 *     certbot renew failed:
 *     No certificate found with name bets.bethost.cc
 *     (expected /etc/letsencrypt/renewal/bets.bethost.cc.conf)
 *
 * Strategy: stub SshService.exec with a scripted responder that picks the
 * correct fake result based on the command substring. No real SSH happens.
 */
describe('SslService', () => {
  let ssl: SslService;
  let exec: jest.Mock<Promise<SshResult>, [Server, string, unknown?]>;

  const server: Server = {
    id: 'srv-1',
    name: 'edge-1',
    host: '1.2.3.4',
    port: 22,
    username: 'deploy',
    privateKeyEnc: 'x',
    passphraseEnc: null,
    passwordEnc: null,
    nginxPath: '/etc/nginx',
    sitesAvailable: '/etc/nginx/sites-available',
    sitesEnabled: '/etc/nginx/sites-enabled',
    reloadCommand: 'sudo systemctl reload nginx',
    testCommand: 'sudo nginx -t',
    certbotEnabled: true,
    isActive: true,
    lastSeenAt: null,
    notes: null,
    ownerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Server;

  const ok = (stdout = '', stderr = '', code = 0): SshResult => ({
    code,
    signal: null,
    stdout,
    stderr,
    durationMs: 1,
  });

  beforeEach(async () => {
    exec = jest.fn();
    const mod = await Test.createTestingModule({
      providers: [
        SslService,
        { provide: SshService, useValue: { exec } },
      ],
    }).compile();
    ssl = mod.get(SslService);
  });

  describe('certificateExists / renewalConfigExists', () => {
    it('reports true when both live cert and renewal conf are present', async () => {
      exec.mockImplementation(async (_s, cmd) => {
        if (cmd.includes('/live/foo.example.com/fullchain.pem')) return ok('yes\n');
        if (cmd.includes('/renewal/foo.example.com.conf')) return ok('yes\n');
        return ok('no\n');
      });

      expect(await ssl.certificateExists(server, 'foo.example.com')).toBe(true);
      expect(await ssl.renewalConfigExists(server, 'foo.example.com')).toBe(true);
    });

    it('rejects suspicious domains without hitting the network', async () => {
      // No exec call should fire for a non-domain-looking string.
      expect(await ssl.certificateExists(server, '../../etc/passwd')).toBe(false);
      expect(exec).not.toHaveBeenCalled();
    });
  });

  describe('safeRenew', () => {
    it('renews when both live cert and renewal conf exist', async () => {
      exec.mockImplementation(async (_s, cmd) => {
        if (cmd.includes('/live/x.example.com/fullchain.pem')) return ok('yes\n');
        if (cmd.includes('/renewal/x.example.com.conf')) return ok('yes\n');
        if (cmd.includes('certbot renew')) return ok('Renewed certs');
        return ok('no\n');
      });

      const r = await ssl.safeRenew(server, 'x.example.com');
      expect(r.renewed).toBe(true);
      expect(exec.mock.calls.some(([, c]) => c.includes('certbot renew'))).toBe(true);
    });

    it('does NOT renew and cleans up when renewal conf exists but live cert is missing — the production bug', async () => {
      // Simulate exactly the bug: /renewal/bets.bethost.cc.conf exists but
      // /live/bets.bethost.cc/fullchain.pem does not.
      let cleanupRan = false;
      exec.mockImplementation(async (_s, cmd) => {
        if (cmd.includes('/live/bets.bethost.cc/fullchain.pem')) return ok('no\n');
        if (cmd.includes('/renewal/bets.bethost.cc.conf') && cmd.includes('test -f')) {
          return ok('yes\n');
        }
        if (cmd.includes('rm -f') && cmd.includes('/renewal/bets.bethost.cc.conf')) {
          cleanupRan = true;
          return ok();
        }
        return ok('no\n');
      });

      const r = await ssl.safeRenew(server, 'bets.bethost.cc');
      expect(r.renewed).toBe(false);
      expect(r.reason).toMatch(/cleaned up/);
      expect(cleanupRan).toBe(true);
      // Critically: certbot renew was never invoked, so no error toast for the user.
      expect(exec.mock.calls.some(([, c]) => c.includes('certbot renew'))).toBe(false);
    });

    it('returns no-op when nothing is installed at all', async () => {
      exec.mockResolvedValue(ok('no\n'));
      const r = await ssl.safeRenew(server, 'absent.example.com');
      expect(r.renewed).toBe(false);
      expect(r.reason).toMatch(/no certificate/i);
    });
  });

  describe('remove', () => {
    it('runs certbot delete then manual rm and reports success', async () => {
      const calls: string[] = [];
      exec.mockImplementation(async (_s, cmd) => {
        calls.push(cmd);
        if (cmd.includes('test -f') && cmd.includes('/renewal/del.example.com.conf')) {
          // First check (existence): yes. Second check (after cleanup): no.
          const seen = calls.filter(
            (c) => c.includes('test -f') && c.includes('/renewal/del.example.com.conf'),
          ).length;
          return ok(seen <= 1 ? 'yes\n' : 'no\n');
        }
        if (cmd.includes('test -f') && cmd.includes('/live/del.example.com/fullchain.pem')) {
          const seen = calls.filter((c) =>
            c.includes('/live/del.example.com/fullchain.pem'),
          ).length;
          return ok(seen <= 1 ? 'yes\n' : 'no\n');
        }
        if (cmd.includes('test -d') && cmd.includes('/archive/del.example.com')) {
          return ok('no\n');
        }
        return ok();
      });

      const r = await ssl.remove(server, 'del.example.com');
      expect(r.certbotDeleteRan).toBe(true);
      expect(r.liveRemoved).toBe(true);
      expect(r.renewalRemoved).toBe(true);
      expect(r.archiveRemoved).toBe(true);
      expect(r.warnings).toEqual([]);
    });

    it('is a no-op when nothing exists', async () => {
      exec.mockResolvedValue(ok('no\n'));
      const r = await ssl.remove(server, 'gone.example.com');
      expect(r.certbotDeleteRan).toBe(false);
      expect(r.warnings).toEqual([]);
    });
  });
});
