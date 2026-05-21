import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';

/**
 * AES-256-GCM symmetric encryption used to protect SSH private keys at rest.
 *
 * Output format: `iv:authTag:ciphertext` — all hex. Self-contained, so values
 * may be rotated independently of the key (the IV is per-message).
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const raw = this.config.get<string>('app.encryptionKey', '');
    if (!raw) {
      throw new Error('ENCRYPTION_KEY is required');
    }
    // Accept either a raw 32-byte base64 key or arbitrary string — derive 32B via SHA-256.
    const decoded = Buffer.from(raw, 'base64');
    this.key = decoded.length === 32 ? decoded : createHash('sha256').update(raw).digest();
    this.logger.log('CryptoService ready');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
  }

  decrypt(payload: string): string {
    const [ivHex, tagHex, ctHex] = payload.split(':');
    if (!ivHex || !tagHex || !ctHex) {
      throw new Error('Invalid ciphertext payload');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(ctHex, 'hex')),
      decipher.final(),
    ]);
    return pt.toString('utf8');
  }
}
