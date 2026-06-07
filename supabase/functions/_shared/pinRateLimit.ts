/**
 * PIN lookup 失敗時レート制限（ユーザー + IP）
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export const MAX_FAILED_PIN_ATTEMPTS_USER = 10;
export const MAX_FAILED_PIN_ATTEMPTS_IP = 30;
export const PIN_WINDOW_MINUTES = 15;

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return null;
}

export async function hashIp(ip: string): Promise<string> {
  const normalized = ip.trim().toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return `ip:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function windowSinceIso(): string {
  return new Date(Date.now() - PIN_WINDOW_MINUTES * 60 * 1000).toISOString();
}

function cleanupBeforeIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export type PinRateLimitResult =
  | { limited: false }
  | { limited: true; reason: 'user' | 'ip' };

export async function checkPinFailureRateLimit(
  supabase: SupabaseClient,
  userId: string,
  ipHash: string | null,
): Promise<PinRateLimitResult> {
  const since = windowSinceIso();

  const { count: userCount, error: userError } = await supabase
    .from('pin_lookup_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('attempted_at', since);

  if (userError) {
    console.error('pin_lookup_attempts count failed:', userError.message);
    throw new Error('PIN lookup failed');
  }

  if ((userCount ?? 0) >= MAX_FAILED_PIN_ATTEMPTS_USER) {
    return { limited: true, reason: 'user' };
  }

  if (ipHash) {
    const { count: ipCount, error: ipError } = await supabase
      .from('pin_lookup_ip_failures')
      .select('*', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('failed_at', since);

    if (ipError) {
      console.error('pin_lookup_ip_failures count failed:', ipError.message);
      throw new Error('PIN lookup failed');
    }

    if ((ipCount ?? 0) >= MAX_FAILED_PIN_ATTEMPTS_IP) {
      return { limited: true, reason: 'ip' };
    }
  }

  return { limited: false };
}

export async function recordPinLookupFailure(
  supabase: SupabaseClient,
  userId: string,
  ipHash: string | null,
): Promise<void> {
  const cleanupBefore = cleanupBeforeIso();

  const { error: userError } = await supabase
    .from('pin_lookup_attempts')
    .insert({ user_id: userId, ip_hash: ipHash });

  if (userError) {
    console.error('pin_lookup_attempts insert failed:', userError.message);
    throw new Error('PIN lookup failed');
  }

  if (ipHash) {
    const { error: ipError } = await supabase.from('pin_lookup_ip_failures').insert({
      ip_hash: ipHash,
    });
    if (ipError) {
      console.error('pin_lookup_ip_failures insert failed:', ipError.message);
    }
  }

  await supabase.from('pin_lookup_attempts').delete().lt('attempted_at', cleanupBefore);
  if (ipHash) {
    await supabase.from('pin_lookup_ip_failures').delete().lt('failed_at', cleanupBefore);
  }
}

export function rateLimitResponse(reason: 'user' | 'ip'): Response {
  const message =
    reason === 'ip'
      ? 'PIN lookup rate limit exceeded for this network'
      : 'PIN lookup rate limit exceeded';

  return new Response(
    JSON.stringify({
      ok: false,
      error: message,
      hint: 'rate_limit_exceeded',
      limit_reason: reason,
    }),
    {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
