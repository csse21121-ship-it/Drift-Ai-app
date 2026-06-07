/**
 * session_logs INSERT → LINE Messaging API Push 通知
 *
 * 通知先は session_logs.line_target_id（アプリ設定）のみ。
 * 未設定の行は通知しない（他ユーザーへ漏れない）。
 *
 * シークレット: supabase secrets set LINE_ACCESS_TOKEN=...
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { decryptLineTarget } from '../_shared/lineTargetCrypto.ts';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

type SessionLogRecord = {
  score?: number | string | null;
  track_name?: string | null;
  car_model?: string | null;
  line_target_id?: string | null;
  /** アプリ現行スキーマとの互換 */
  location?: string | null;
  vehicle?: string | null;
};

type DatabaseWebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: SessionLogRecord;
  old_record?: SessionLogRecord | null;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseRecord(body: unknown): SessionLogRecord | null {
  if (!body || typeof body !== 'object') return null;

  const payload = body as DatabaseWebhookPayload & SessionLogRecord;

  if (payload.record && typeof payload.record === 'object') {
    return payload.record;
  }

  if ('score' in payload || 'track_name' in payload || 'location' in payload) {
    return payload;
  }

  return null;
}

function formatScore(score: number | string | null | undefined): string {
  if (score == null || score === '') return '—';
  const n = typeof score === 'number' ? score : Number(score);
  if (Number.isFinite(n)) return String(Math.round(n * 10) / 10);
  return String(score);
}

function resolveTrackName(record: SessionLogRecord): string {
  const name = record.track_name?.trim() || record.location?.trim();
  return name || '不明';
}

function resolveCarModel(record: SessionLogRecord): string {
  const model = record.car_model?.trim() || record.vehicle?.trim();
  return model || '未設定';
}

function buildLineMessage(record: SessionLogRecord): string {
  const trackName = resolveTrackName(record);
  const scoreText = formatScore(record.score);
  const carModel = resolveCarModel(record);

  return (
    `【四季轟煙 走行速報】\n` +
    `${trackName}で${scoreText}点が記録されました！\n` +
    `マシン: ${carModel}`
  );
}

async function sendLinePush(
  text: string,
  accessToken: string,
  targetId: string,
): Promise<Response> {
  return fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: targetId,
      messages: [{ type: 'text', text }],
    }),
  });
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const lineAccessToken = Deno.env.get('LINE_ACCESS_TOKEN');
  if (!lineAccessToken) {
    console.error('LINE_ACCESS_TOKEN is not set');
    return jsonResponse({ error: 'LINE_ACCESS_TOKEN is not configured' }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const webhook = body as DatabaseWebhookPayload;
  if (webhook.type && webhook.type !== 'INSERT') {
    return jsonResponse({ ok: true, skipped: true, reason: 'Not an INSERT event' });
  }

  if (webhook.table && webhook.table !== 'session_logs') {
    return jsonResponse({ ok: true, skipped: true, reason: 'Not session_logs table' });
  }

  const record = parseRecord(body);
  if (!record) {
    return jsonResponse({ error: 'Missing session_logs record in payload' }, 400);
  }

  const storedTarget = record.line_target_id?.trim();
  if (!storedTarget) {
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: 'No line_target_id — notification disabled for this user',
    });
  }

  let lineTargetId: string | null;
  try {
    lineTargetId = await decryptLineTarget(storedTarget);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Decrypt failed';
    console.error('line_target_id decrypt failed:', detail);
    return jsonResponse({ error: 'Failed to decrypt line_target_id' }, 500);
  }

  if (!lineTargetId) {
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: 'Invalid or undecryptable line_target_id',
    });
  }

  const messageText = buildLineMessage(record);

  try {
    const lineRes = await sendLinePush(messageText, lineAccessToken, lineTargetId);
    const lineBody = await lineRes.text();

    if (!lineRes.ok) {
      console.error('LINE API error:', lineRes.status, lineBody);
      return jsonResponse(
        {
          error: 'LINE API request failed',
          status: lineRes.status,
          detail: lineBody,
        },
        502,
      );
    }

    return jsonResponse({
      ok: true,
      message: messageText,
      lineTargetId,
      lineStatus: lineRes.status,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    console.error('Failed to send LINE push:', detail);
    return jsonResponse({ error: 'Failed to send LINE push', detail }, 500);
  }
});
