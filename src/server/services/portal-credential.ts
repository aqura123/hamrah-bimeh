import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AppConfig } from '../config.js';

type ProfileKind = 'driver' | 'workshop';
function key(config: AppConfig): Buffer {
  if (
    !/^[0-9a-fA-F]{64}$/.test(config.portalCredentialKey) ||
    (/^(.)\1{63}$/.test(config.portalCredentialKey) && config.nodeEnv !== 'test') ||
    config.portalCredentialKey.toLowerCase() === config.cardEncryptionKey.toLowerCase()
  ) {
    throw new Error('PORTAL_CREDENTIAL_KEY must be an independent 32-byte hex secret.');
  }
  return Buffer.from(config.portalCredentialKey, 'hex');
}
function aad(customerId: string, kind: ProfileKind, profileId: string): Buffer {
  return Buffer.from(`hamrah-portal-v1:${customerId}:${kind}:${profileId}`, 'utf8');
}
export function encryptPortalPassword(
  config: AppConfig,
  customerId: string,
  kind: ProfileKind,
  profileId: string,
  password: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(config), iv);
  cipher.setAAD(aad(customerId, kind, profileId));
  const data = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    data.toString('base64'),
  ].join('.');
}
export function decryptPortalPassword(
  config: AppConfig,
  customerId: string,
  kind: ProfileKind,
  profileId: string,
  value: string,
): string {
  const [version, iv, tag, data] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data)
    throw new Error('Invalid encrypted portal credential.');
  const decipher = createDecipheriv('aes-256-gcm', key(config), Buffer.from(iv, 'base64'));
  decipher.setAAD(aad(customerId, kind, profileId));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}
