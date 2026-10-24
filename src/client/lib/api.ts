export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    code?: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

const PREVIEW_TOKEN_STORAGE_KEY = 'hb_preview_session_token';
const PREVIEW_CSRF_STORAGE_KEY = 'hb_preview_csrf_token';

function readSafeSessionStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(key);
    }
  } catch {
    // Ignore storage security errors inside restricted iframes
  }
  return null;
}

function writeSafeSessionStorage(key: string, value: string | null): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (value) {
        window.sessionStorage.setItem(key, value);
      } else {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage security errors inside restricted iframes
  }
}

let currentCsrfToken: string | null = readSafeSessionStorage(PREVIEW_CSRF_STORAGE_KEY);
let currentPreviewSessionToken: string | null = readSafeSessionStorage(PREVIEW_TOKEN_STORAGE_KEY);
let unauthorizedHandler: (() => void) | null = null;

export function setOnUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function setCsrfToken(token: string | null): void {
  currentCsrfToken = token;
  writeSafeSessionStorage(PREVIEW_CSRF_STORAGE_KEY, token);
}

export function getCsrfToken(): string | null {
  return currentCsrfToken;
}

export function setPreviewSessionToken(token: string | null): void {
  currentPreviewSessionToken = token;
  writeSafeSessionStorage(PREVIEW_TOKEN_STORAGE_KEY, token);
}

export function getPreviewSessionToken(): string | null {
  return currentPreviewSessionToken;
}

export function clearClientAuthTokens(): void {
  setCsrfToken(null);
  setPreviewSessionToken(null);
}

function attachPreviewSessionHeaders(headers: Record<string, string>): void {
  if (currentPreviewSessionToken) {
    headers['X-Session-Token'] = currentPreviewSessionToken;
    headers['Authorization'] = `Bearer ${currentPreviewSessionToken}`;
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
  } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET' && currentCsrfToken) {
    headers['X-CSRF-Token'] = currentCsrfToken;
  }
  attachPreviewSessionHeaders(headers);

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      'عدم برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کرده و دوباره تلاش کنید.',
      0,
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/me') {
      clearClientAuthTokens();
      unauthorizedHandler?.();
    }
    throw new ApiError(
      data?.error ?? 'خطایی در پردازش درخواست رخ داد.',
      res.status,
      data?.code,
      data?.fieldErrors,
    );
  }

  return data as T;
}

/**
 * Multipart form-data upload with real upload progress reporting via XMLHttpRequest.
 */
export function apiUploadFormData<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    if (currentCsrfToken) {
      xhr.setRequestHeader('X-CSRF-Token', currentCsrfToken);
    }
    if (currentPreviewSessionToken) {
      xhr.setRequestHeader('X-Session-Token', currentPreviewSessionToken);
      xhr.setRequestHeader('Authorization', `Bearer ${currentPreviewSessionToken}`);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          onProgress(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
        }
      };
    }

    xhr.onerror = () => {
      reject(
        new ApiError('خطا در ارسال فایل به سرور. لطفاً اتصال شبکه را بررسی و مجدداً تلاش کنید.', 0),
      );
    };

    xhr.onload = () => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch {
        parsed = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(parsed as T);
      } else {
        if (xhr.status === 401) {
          clearClientAuthTokens();
          unauthorizedHandler?.();
        }
        reject(
          new ApiError(
            typeof parsed.error === 'string' ? parsed.error : 'خطا در ارسال اطلاعات.',
            xhr.status,
            typeof parsed.code === 'string' ? parsed.code : undefined,
            parsed.fieldErrors as Record<string, string> | undefined,
          ),
        );
      }
    };

    xhr.send(formData);
  });
}

/**
 * Downloads an authenticated private file safely in both cookie-based production
 * and third-party-cookie-blocked preview iframes.
 */
export async function downloadProtectedFile(
  downloadUrl: string,
  displayFilename: string,
): Promise<void> {
  const headers: Record<string, string> = {};
  attachPreviewSessionHeaders(headers);

  const res = await fetch(downloadUrl, {
    method: 'GET',
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearClientAuthTokens();
      unauthorizedHandler?.();
    }
    throw new ApiError(errJson?.error ?? 'خطا در دریافت فایل از سرور.', res.status, errJson?.code);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = displayFilename || 'document';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
