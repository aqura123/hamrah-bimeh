import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { z } from 'zod';
import type { cardInputSchema } from '../../shared/validation.js';

type Card = z.infer<typeof cardInputSchema>;
function key(config: AppConfig): Buffer {
  if (
    !/^[0-9a-fA-F]{64}$/.test(config.cardEncryptionKey) ||
    /^0+$/.test(config.cardEncryptionKey)
  ) {
    throw new Error('CARD_ENCRYPTION_KEY must be a unique 32-byte hex secret.');
  }
  return Buffer.from(config.cardEncryptionKey, 'hex');
}
export function encryptCard(config: AppConfig, customerId: string, data: Card): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(config), iv);
  cipher.setAAD(Buffer.from(`hamrah-card-v1:${customerId}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}
export function decryptCard(config: AppConfig, customerId: string, value: string): Card {
  const [version, iv, tag, data] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted card.');
  const decipher = createDecipheriv('aes-256-gcm', key(config), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(`hamrah-card-v1:${customerId}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
      'utf8',
    ),
  ) as Card;
}
