/**
 * 既存の平文 LINE ID を暗号化（1回限り）
 *
 * Usage:
 *   LINE_TARGET_ENCRYPTION_KEY=<base64-32-bytes> SUPABASE_SERVICE_ROLE_KEY=<key> npm run migrate:line-encrypt
 *
 * キー生成: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { resolve } from 'node:path';

const crypto = webcrypto as Crypto;

function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env なし
  }
}

loadEnv();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENC_KEY_B64 = process.env.LINE_TARGET_ENCRYPTION_KEY;

const VERSION_PREFIX = 'v1:';
const PLAIN_PATTERN = /^[UCR][a-f0-9]{32}$/i;

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function importKey(): Promise<CryptoKey> {
  if (!ENC_KEY_B64) throw new Error('LINE_TARGET_ENCRYPTION_KEY is required');
  const bytes = Uint8Array.from(Buffer.from(ENC_KEY_B64, 'base64'));
  if (bytes.length !== 32) throw new Error('LINE_TARGET_ENCRYPTION_KEY must be 32 bytes');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptLineTarget(plain: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `${VERSION_PREFIX}${toBase64Url(iv)}.${toBase64Url(new Uint8Array(cipher))}`;
}

async function lineTargetLookupKey(plain: string, keyBytes: Uint8Array): Promise<string> {
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(plain));
  return `hk:${toBase64Url(new Uint8Array(sig))}`;
}

function isPlain(value: string): boolean {
  return PLAIN_PATTERN.test(value.trim()) && !value.startsWith(VERSION_PREFIX);
}

async function patchRows(
  table: string,
  key: CryptoKey,
  keyBytes: Uint8Array,
  withLookupKey: boolean,
): Promise<number> {
  if (!SUPABASE_URL || !SERVICE_KEY) return 0;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  const rows = (await res.json()) as Record<string, unknown>[];
  if (!res.ok || !Array.isArray(rows)) {
    throw new Error(`Failed to read ${table}: ${JSON.stringify(rows)}`);
  }

  let updated = 0;
  for (const row of rows) {
    const stored = String(row.line_target_id ?? '');
    if (!isPlain(stored)) continue;

    const encrypted = await encryptLineTarget(stored, key);
    const patch: Record<string, string> = { line_target_id: encrypted };
    if (withLookupKey) {
      patch.line_target_key = await lineTargetLookupKey(stored, keyBytes);
    }

    const idFilter =
      table === 'notify_teams'
        ? `pin=eq.${encodeURIComponent(String(row.pin))}`
        : table === 'user_line_links'
          ? `user_id=eq.${encodeURIComponent(String(row.user_id))}`
          : `id=eq.${encodeURIComponent(String(row.id))}`;

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${idFilter}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(patch),
    });

    if (!patchRes.ok) {
      const text = await patchRes.text();
      throw new Error(`PATCH ${table} failed: ${text}`);
    }
    updated += 1;
    console.log(`  ✓ ${table} ${withLookupKey ? row.pin : row.user_id ?? row.id}`);
  }
  return updated;
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }
  if (!ENC_KEY_B64) {
    console.error('LINE_TARGET_ENCRYPTION_KEY is required');
    process.exit(1);
  }

  const key = await importKey();
  const keyBytes = Uint8Array.from(Buffer.from(ENC_KEY_B64, 'base64'));

  console.log('Encrypting plaintext LINE IDs…\n');

  const teams = await patchRows('notify_teams', key, keyBytes, true);
  const links = await patchRows('user_line_links', key, keyBytes, false);
  const logs = await patchRows('session_logs', key, keyBytes, false);

  console.log(`\nDone: notify_teams=${teams}, user_line_links=${links}, session_logs=${logs}`);
}

void main();
