import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/** AES-256-GCM encryption for secrets at rest (Gmail refresh tokens). Output: iv.tag.ciphertext (base64). */
@Injectable()
export class TokenCipherService {
  private readonly key: Buffer;

  constructor(config: AppConfigService) {
    this.key = Buffer.from(config.get('TOKEN_ENCRYPTION_KEY'), 'base64');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
  }

  decrypt(payload: string): string {
    const [iv, tag, encrypted] = payload.split('.').map((part) => Buffer.from(part, 'base64'));
    if (!iv || !tag || !encrypted) throw new Error('Malformed encrypted payload');
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }
}
