import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

export interface StoredFileMetadata {
  storageKey: string;
  displayFilename: string;
  detectedMimeType: string;
  byteSize: number;
  sha256Checksum: string;
  scanState: 'not_configured' | 'clean';
}

export interface FileStorageProvider {
  put(
    buffer: Buffer,
    contentType: string,
  ): Promise<{ storageKey: string; sha256Checksum: string }>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}

const SAFE_STORAGE_KEY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin$/;

export class LocalPrivateFileStorage implements FileStorageProvider {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  private resolveSafePath(storageKey: string): string {
    if (!SAFE_STORAGE_KEY_REGEX.test(storageKey)) {
      throw new Error('Invalid opaque storage key');
    }
    const target = path.resolve(this.rootDir, storageKey);
    const relative = path.relative(this.rootDir, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Storage path traversal blocked');
    }
    return target;
  }

  async put(
    buffer: Buffer,
    _contentType: string,
  ): Promise<{ storageKey: string; sha256Checksum: string }> {
    await fs.mkdir(this.rootDir, { recursive: true, mode: 0o700 });
    const storageKey = `${crypto.randomUUID()}.bin`;
    const filePath = this.resolveSafePath(storageKey);
    const sha256Checksum = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
    await fs.writeFile(filePath, buffer, { mode: 0o600 });
    return { storageKey, sha256Checksum };
  }

  async read(storageKey: string): Promise<Buffer> {
    const filePath = this.resolveSafePath(storageKey);
    return fs.readFile(filePath);
  }

  async remove(storageKey: string): Promise<void> {
    const filePath = this.resolveSafePath(storageKey);
    await fs.unlink(filePath).catch(() => undefined);
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const filePath = this.resolveSafePath(storageKey);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.com',
  '.scr',
  '.msi',
  '.sh',
  '.bash',
  '.ps1',
  '.vbs',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.html',
  '.htm',
  '.xhtml',
  '.svg',
  '.xml',
  '.php',
  '.phtml',
  '.py',
  '.rb',
  '.pl',
  '.jar',
  '.war',
  '.apk',
  '.elf',
  '.app',
]);

const ALLOWED_EXTENSION_FOR_MIME: Record<string, readonly string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

/**
 * Inspects actual file magic bytes on the server rather than trusting browser-supplied Content-Type.
 */
export function detectMimeTypeFromMagicBytes(buffer: Buffer): string | null {
  if (buffer.byteLength < 8) {
    return null;
  }

  // Block common executable / script headers immediately
  // Windows MZ, Linux ELF, Shebang #!
  if (
    (buffer[0] === 0x4d && buffer[1] === 0x5a) ||
    (buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46) ||
    (buffer[0] === 0x23 && buffer[1] === 0x21)
  ) {
    return null;
  }

  // PDF: %PDF-
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return 'application/pdf';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.byteLength >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Strips path components, control characters, and BiDi override characters
 * from original filenames so they are safe as display metadata.
 */
export function sanitizeDisplayFilename(
  rawName: string,
  fallbackExt = '.pdf',
): string {
  const normalizedSlashes = rawName.replace(/\\/g, '/');
  const base = path.posix.basename(normalizedSlashes);
  const withoutControls = Array.from(base)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
  const cleaned = withoutControls
    .replace(/[\u202a-\u202e\u2066-\u2069"<>|:*?]/g, '')
    .replace(/\.{2,}/g, '.')
    .trim();

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return `document${fallbackExt}`;
  }
  return cleaned.length > 140 ? cleaned.slice(-140) : cleaned;
}

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

export async function validateAndStorePrivateFile(params: {
  storage: FileStorageProvider;
  originalName: string;
  buffer: Buffer;
  maxUploadBytes: number;
  allowedMimes: readonly string[];
  antivirusMode: 'disabled';
}): Promise<StoredFileMetadata> {
  const { storage, originalName, buffer, maxUploadBytes, allowedMimes } = params;

  if (!buffer || buffer.byteLength === 0) {
    throw new FileValidationError('فایل انتخاب‌شده خالی است.');
  }
  if (buffer.byteLength > maxUploadBytes) {
    const maxMb = Math.round(maxUploadBytes / (1024 * 1024));
    throw new FileValidationError(
      `حجم فایل بیش از حد مجاز (${maxMb} مگابایت) است.`,
    );
  }

  const lowerName = originalName.toLowerCase();
  const segments = path.posix
    .basename(lowerName.replace(/\\/g, '/'))
    .split('.')
    .slice(1);

  for (const seg of segments) {
    if (BLOCKED_EXTENSIONS.has(`.${seg}`)) {
      throw new FileValidationError(
        'فرمت فایل به دلایل امنیتی مجاز نیست.',
      );
    }
  }

  const detectedMimeType = detectMimeTypeFromMagicBytes(buffer);
  if (!detectedMimeType || !allowedMimes.includes(detectedMimeType)) {
    throw new FileValidationError(
      'نوع فایل پشتیبانی نمی‌شود. فقط فایل‌های PDF و تصاویر معتبر (JPG، PNG، WebP) مجاز هستند.',
    );
  }

  const allowedExts = ALLOWED_EXTENSION_FOR_MIME[detectedMimeType] ?? [];
  const actualExt = path.extname(lowerName);
  if (actualExt && allowedExts.length > 0 && !allowedExts.includes(actualExt)) {
    throw new FileValidationError(
      'پسوند فایل با محتوای واقعی آن همخوانی ندارد. لطفاً فایل معتبر بارگذاری کنید.',
    );
  }

  const fallbackExt = allowedExts[0] ?? '.bin';
  let displayFilename = sanitizeDisplayFilename(originalName, fallbackExt);
  if (!path.extname(displayFilename)) {
    displayFilename = `${displayFilename}${fallbackExt}`;
  }

  // Pass the server-detected MIME type to storage, not the browser-supplied value.
  const { storageKey, sha256Checksum } = await storage.put(
    buffer,
    detectedMimeType,
  );

  return {
    storageKey,
    displayFilename,
    detectedMimeType,
    byteSize: buffer.byteLength,
    sha256Checksum,
    scanState: 'not_configured',
  };
}

/**
 * Stores private insurance documents in Supabase Storage.
 * The bucket must remain private.
 */
export class SupabasePrivateFileStorage implements FileStorageProvider {
  private readonly client: ReturnType<typeof createClient>;
  private readonly bucket: string;

  constructor(
    supabaseUrl = process.env.SUPABASE_URL,
    secretKey = process.env.SUPABASE_SECRET_KEY,
    bucket = 'private-insurance-files',
  ) {
    if (!supabaseUrl || !secretKey) {
      throw new Error('Supabase Storage environment variables are missing.');
    }

    this.client = createClient(supabaseUrl, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    this.bucket = bucket;
  }

  private validateKey(storageKey: string): void {
    if (!SAFE_STORAGE_KEY_REGEX.test(storageKey)) {
      throw new Error('Invalid opaque storage key');
    }
  }

  async put(
    buffer: Buffer,
    contentType: string,
  ): Promise<{ storageKey: string; sha256Checksum: string }> {
    const storageKey = `${crypto.randomUUID()}.bin`;
    const sha256Checksum = crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');

    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(storageKey, buffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }

    return { storageKey, sha256Checksum };
  }

  async read(storageKey: string): Promise<Buffer> {
    this.validateKey(storageKey);

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .download(storageKey);

    if (error || !data) {
      throw new Error('Unable to read private file from Supabase Storage.');
    }

    return Buffer.from(await data.arrayBuffer());
  }

  async remove(storageKey: string): Promise<void> {
    this.validateKey(storageKey);

    const { error } = await this.client.storage
      .from(this.bucket)
      .remove([storageKey]);

    if (error) {
      throw new Error('Unable to remove private file from Supabase Storage.');
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    this.validateKey(storageKey);

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .list('', { search: storageKey, limit: 1 });

    if (error) {
      throw new Error('Unable to check private file in Supabase Storage.');
    }

    return (data ?? []).some((file) => file.name === storageKey);
  }
}
