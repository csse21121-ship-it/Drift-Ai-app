/**
 * LINE 通知先 ID の AES-256-GCM 暗号化（Edge Function シークレットのみ復号可能）
 * DB / Dashboard 上は v1:... 形式の暗号文のみ表示。
 */

const VERSION_PREFIX = 'v1:';

function requireKeyBytes(): Uint8Array {
  const raw = Deno.env.get('LINE_TARGET_ENCRYPTION_KEY')?.trim();
  if (!raw) {
    throw new Error('LINE_TARGET_ENCRYPTION_KEY is not configured');
  }
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) {
    throw new Error('LINE_TARGET_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
  }
  return bytes;
}

async function importKey(): Promise<CryptoKey> {
  const bytes = requireKeyBytes();
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Uint8Array.from(atob(padded + pad), (c) => c.charCodeAt(0));
}

export function isEncryptedLineTarget(value: string): boolean {
  return value.startsWith(VERSION_PREFIX);
}

export function isPlainLineTargetId(value: string): boolean {
  return /^[UCR][a-f0-9]{32}$/i.test(value.trim());
}

/** 平文 → v1:iv.ciphertext（base64url） */
export async function encryptLineTarget(plain: string): Promise<string> {
  const trimmed = plain.trim();
  if (!trimmed) return trimmed;
  if (isEncryptedLineTarget(trimmed)) return trimmed;

  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(trimmed),
  );
  return `${VERSION_PREFIX}${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

/** 暗号文 → 平文（旧平文保存はそのまま返す） */
export async function decryptLineTarget(stored: string): Promise<string | null> {
  const trimmed = stored?.trim();
  if (!trimmed) return null;
  if (!isEncryptedLineTarget(trimmed)) {
    return isPlainLineTargetId(trimmed) ? trimmed : null;
  }

  const payload = trimmed.slice(VERSION_PREFIX.length);
  const dot = payload.indexOf('.');
  if (dot <= 0) return null;

  const iv = fromBase64Url(payload.slice(0, dot));
  const cipher = fromBase64Url(payload.slice(dot + 1));
  const key = await importKey();

  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    const text = new TextDecoder().decode(plain);
    return isPlainLineTargetId(text) ? text : null;
  } catch {
    return null;
  }
}

/** 新規デプロイ用 — openssl rand -base64 32 と同等 */
export function generateEncryptionKeyBase64(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes));
}

/** 平文 LINE ID → DB ルックアップ用 HMAC（復号不能・Dashboard から ID は復元不可） */
export async function lineTargetLookupKey(plain: string): Promise<string> {
  const trimmed = plain.trim();
  const keyBytes = requireKeyBytes();
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(trimmed));
  return `hk:${toBase64Url(new Uint8Array(sig))}`;
}
