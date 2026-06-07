/**
 * LINE 走行速報 — 認証済みクライアント API
 * - team_lookup: PIN → チーム情報（復号済み target は端末のみ）
 * - personal_status: 個人連携済み LINE ID
 * - encrypt_target: session_logs 保存用暗号化
 *
 * PIN 当て試し: 失敗時のみカウント（15分 10回/ユーザー、30回/IP）
 *
 * シークレット: LINE_TARGET_ENCRYPTION_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  decryptLineTarget,
  encryptLineTarget,
  isPlainLineTargetId,
} from '../_shared/lineTargetCrypto.ts';
import {
  checkPinFailureRateLimit,
  getClientIp,
  hashIp,
  rateLimitResponse,
  recordPinLookupFailure,
} from '../_shared/pinRateLimit.ts';

const TEAM_PIN_PATTERN = /^[0-9]{4,6}$/;

type NotifyAction = 'team_lookup' | 'personal_status' | 'encrypt_target';

type RequestBody = {
  action?: NotifyAction;
  pin?: string;
  target_id?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function assertAuthenticatedUser(req: Request): Promise<{ userId: string } | Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const token = getBearerToken(req);

  if (!supabaseUrl || !anonKey || !token) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user?.id) {
    return jsonResponse({ ok: false, error: 'Unauthorized' }, 401);
  }
  return { userId: data.user.id };
}

function serviceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role is not configured');
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

async function resolveIpHash(req: Request): Promise<string | null> {
  const ip = getClientIp(req);
  if (!ip) return null;
  return hashIp(ip);
}

async function handleTeamLookup(
  req: Request,
  userId: string,
  pinRaw: string,
): Promise<Response> {
  const supabase = serviceClient();
  const ipHash = await resolveIpHash(req);

  let limited;
  try {
    limited = await checkPinFailureRateLimit(supabase, userId, ipHash);
  } catch {
    return jsonResponse({ ok: false, error: 'PIN lookup failed' }, 500);
  }

  if (limited.limited) {
    return rateLimitResponse(limited.reason);
  }

  const pin = pinRaw.trim();
  if (!TEAM_PIN_PATTERN.test(pin)) {
    try {
      await recordPinLookupFailure(supabase, userId, ipHash);
    } catch {
      return jsonResponse({ ok: false, error: 'PIN lookup failed' }, 500);
    }
    return jsonResponse({ ok: false, error: 'Invalid PIN format' }, 400);
  }

  const { data, error } = await supabase
    .from('notify_teams')
    .select('pin, team_name, line_target_id')
    .eq('pin', pin)
    .maybeSingle();

  if (error) {
    console.error('notify_teams lookup failed:', error.message);
    return jsonResponse({ ok: false, error: 'PIN lookup failed' }, 500);
  }

  if (!data?.line_target_id) {
    try {
      await recordPinLookupFailure(supabase, userId, ipHash);
    } catch {
      return jsonResponse({ ok: false, error: 'PIN lookup failed' }, 500);
    }
    return jsonResponse({ ok: false, error: 'PIN not found' }, 404);
  }

  const lineTargetId = await decryptLineTarget(data.line_target_id);
  if (!lineTargetId) {
    try {
      await recordPinLookupFailure(supabase, userId, ipHash);
    } catch {
      return jsonResponse({ ok: false, error: 'PIN lookup failed' }, 500);
    }
    return jsonResponse({ ok: false, error: 'Failed to resolve team target' }, 500);
  }

  return jsonResponse({
    ok: true,
    team: {
      pin: data.pin,
      team_name: data.team_name,
      line_target_id: lineTargetId,
    },
  });
}

async function handlePersonalStatus(userId: string): Promise<Response> {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('user_line_links')
    .select('line_target_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('user_line_links read failed:', error.message);
    return jsonResponse({ ok: false, error: 'Failed to read link status' }, 500);
  }
  if (!data?.line_target_id) {
    return jsonResponse({ ok: true, linked: false, line_target_id: null });
  }

  const lineTargetId = await decryptLineTarget(data.line_target_id);
  return jsonResponse({
    ok: true,
    linked: Boolean(lineTargetId),
    line_target_id: lineTargetId,
  });
}

async function handleEncryptTarget(userId: string, targetRaw: string): Promise<Response> {
  void userId;
  const targetId = targetRaw.trim();
  if (!isPlainLineTargetId(targetId)) {
    return jsonResponse({ ok: false, error: 'Invalid LINE target ID' }, 400);
  }

  try {
    const encrypted = await encryptLineTarget(targetId);
    return jsonResponse({ ok: true, encrypted_target_id: encrypted });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Encryption failed';
    console.error('encrypt_target failed:', detail);
    return jsonResponse({ ok: false, error: 'Encryption not configured' }, 500);
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const auth = await assertAuthenticatedUser(req);
  if (auth instanceof Response) return auth;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const action = body.action;
  if (!action) {
    return jsonResponse({ error: 'Missing action' }, 400);
  }

  try {
    switch (action) {
      case 'team_lookup':
        if (!body.pin) return jsonResponse({ error: 'Missing pin' }, 400);
        return await handleTeamLookup(req, auth.userId, body.pin);
      case 'personal_status':
        return await handlePersonalStatus(auth.userId);
      case 'encrypt_target':
        if (!body.target_id) return jsonResponse({ error: 'Missing target_id' }, 400);
        return await handleEncryptTarget(auth.userId, body.target_id);
      default:
        return jsonResponse({ error: 'Unknown action' }, 400);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    console.error('line-notify error:', detail);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
