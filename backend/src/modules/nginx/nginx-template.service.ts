import { Injectable } from '@nestjs/common';
import { Subdomain } from '@prisma/client';

export interface NginxTemplateInput {
  name: string;                       // FQDN
  upstreamScheme: 'http' | 'https';
  upstreamHost: string;
  upstreamPort: number;
  websocket?: boolean;
  forceHttps?: boolean;
  clientMaxBodySize?: string | null;
  customDirectives?: string | null;
  /** Set to true once certbot has produced certs for this FQDN. */
  withSsl?: boolean;
}

/**
 * Pure, side-effect-free nginx vhost template renderer.
 *
 * Two emit modes:
 *  - HTTP only (initial bootstrap, before SSL has been issued)
 *  - HTTP redirect + HTTPS (once a let's-encrypt cert exists)
 */
@Injectable()
export class NginxTemplateService {
  /** Produce a complete nginx config from a Subdomain row. */
  fromSubdomain(sub: Subdomain, withSsl: boolean): string {
    return this.render({
      name: sub.name,
      upstreamScheme: (sub.upstreamScheme as 'http' | 'https') ?? 'http',
      upstreamHost: sub.upstreamHost,
      upstreamPort: sub.upstreamPort,
      websocket: sub.websocket,
      forceHttps: sub.forceHttps,
      clientMaxBodySize: sub.clientMaxBodySize,
      customDirectives: sub.customDirectives,
      withSsl,
    });
  }

  render(i: NginxTemplateInput): string {
    const proxyPass = `${i.upstreamScheme}://${i.upstreamHost}:${i.upstreamPort}`;
    const wsBlock = i.websocket
      ? `
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;`
      : '';
    const bodySize = i.clientMaxBodySize ? `\n    client_max_body_size ${i.clientMaxBodySize};` : '';
    const custom = i.customDirectives ? `\n    # ── custom ──\n    ${i.customDirectives.split('\n').join('\n    ')}\n    # ── /custom ──` : '';

    const locationBlock = `
    location / {
        proxy_pass ${proxyPass};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_buffering off;${wsBlock}
    }`.trim();

    const httpBlock = `
server {
    listen 80;
    listen [::]:80;
    server_name ${i.name};

    # Always serve the ACME challenge on plain HTTP so renewals don't break.
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
${
  i.withSsl && i.forceHttps
    ? `
    location / {
        return 301 https://$host$request_uri;
    }`
    : `
    ${locationBlock}${bodySize}${custom}`
}
}`.trim();

    if (!i.withSsl) return httpBlock + '\n';

    const httpsBlock = `
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${i.name};

    ssl_certificate     /etc/letsencrypt/live/${i.name}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${i.name}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
${bodySize}${custom}

    ${locationBlock}
}`.trim();

    return `${httpBlock}\n\n${httpsBlock}\n`;
  }

  /** Validate the FQDN format. */
  static isValidDomain(name: string): boolean {
    return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(name);
  }

  /** Safe filename derived from FQDN (e.g. app.example.com → app.example.com.conf) */
  static configFilename(name: string): string {
    return `${name.toLowerCase()}.conf`;
  }
}
