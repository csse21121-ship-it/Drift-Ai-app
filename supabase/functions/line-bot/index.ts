/**
 * LINE Messaging API Webhook
 * - ボットがグループに参加 → チーム PIN を自動発行
 * - グループで「PIN」→ PIN 再送
 * - 個人連携（6桁コード）
 *
 * Webhook URL: https://<project>.supabase.co/functions/v1/line-bot
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  encryptLineTarget,
  lineTargetLookupKey,
} from '../_shared/lineTargetCrypto.ts';

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

type LineSource = {
  type?: string;
  userId?: string;
  groupId?: string;
};

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: LineSource;
  message?: { type?: string; text?: string };
};

type LineWebhookBody = {
  events?: LineEvent[];
};

type TeamRow = { pin: string; team_name: string };

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function replyLine(
  replyToken: string,
  text: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(LINE_REPLY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    console.error('LINE reply failed:', res.status, await res.text());
  }
}

async function pushLine(
  to: string,
  text: string,
  accessToken: string,
): Promise<void> {
  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text }],
    }),
  });
  if (!res.ok) {
    console.error('LINE push failed:', res.status, await res.text());
  }
}

function teamPinMessage(team: TeamRow): string {
  return (
    `【四季轟煙 チーム登録】\n` +
    `チーム PIN: ${team.pin}\n\n` +
    `DriftScore AI → 設定 → LINE 走行速報 →「チーム」→ 上記 PIN を入力\n` +
    `走行終了時、このグループに速報が届きます。`
  );
}

async function generateUniquePin(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const { data } = await supabase.from('notify_teams').select('pin').eq('pin', pin).maybeSingle();
    if (!data) return pin;
  }
  throw new Error('Failed to generate unique team PIN');
}

async function ensureTeamForGroup(
  supabase: SupabaseClient,
  groupId: string,
  teamName?: string,
): Promise<TeamRow> {
  const lookupKey = await lineTargetLookupKey(groupId);
  const { data: existing } = await supabase
    .from('notify_teams')
    .select('pin, team_name')
    .eq('line_target_key', lookupKey)
    .maybeSingle();

  if (existing?.pin) {
    return { pin: existing.pin, team_name: existing.team_name };
  }

  const pin = await generateUniquePin(supabase);
  const name = teamName?.trim() || 'LINEグループ';
  const encryptedTarget = await encryptLineTarget(groupId);

  const { error } = await supabase.from('notify_teams').insert({
    pin,
    team_name: name,
    line_target_id: encryptedTarget,
    line_target_key: lookupKey,
  });

  if (error) {
    const { data: raced } = await supabase
      .from('notify_teams')
      .select('pin, team_name')
      .eq('line_target_key', lookupKey)
      .maybeSingle();
    if (raced?.pin) return { pin: raced.pin, team_name: raced.team_name };
    throw error;
  }

  return { pin, team_name: name };
}

async function groupHasTeam(
  supabase: SupabaseClient,
  groupId: string,
): Promise<boolean> {
  const lookupKey = await lineTargetLookupKey(groupId);
  const { data } = await supabase
    .from('notify_teams')
    .select('pin')
    .eq('line_target_key', lookupKey)
    .maybeSingle();
  return Boolean(data?.pin);
}

async function handleGroupJoin(
  supabase: SupabaseClient,
  groupId: string,
  replyToken: string | undefined,
  accessToken: string,
): Promise<void> {
  const team = await ensureTeamForGroup(supabase, groupId);
  const text = teamPinMessage(team);
  if (replyToken) {
    await replyLine(replyToken, text, accessToken);
  } else {
    await pushLine(groupId, text, accessToken);
  }
}

async function handleGroupPinRequest(
  supabase: SupabaseClient,
  groupId: string,
  replyToken: string,
  accessToken: string,
): Promise<void> {
  const lookupKey = await lineTargetLookupKey(groupId);
  const { data: team } = await supabase
    .from('notify_teams')
    .select('pin, team_name')
    .eq('line_target_key', lookupKey)
    .maybeSingle();

  if (!team?.pin) {
    const created = await ensureTeamForGroup(supabase, groupId);
    await replyLine(replyToken, teamPinMessage(created), accessToken);
    return;
  }

  await replyLine(replyToken, teamPinMessage(team), accessToken);
}

async function handlePersonalLinkCode(
  supabase: SupabaseClient,
  lineUserId: string,
  replyToken: string,
  code: string,
  accessToken: string,
): Promise<void> {
  const { data: pending, error: pendingError } = await supabase
    .from('line_link_pending')
    .select('user_id, code, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (pendingError) {
    await replyLine(replyToken, '連携処理でエラーが発生しました。', accessToken);
    return;
  }

  if (!pending) {
    await replyLine(
      replyToken,
      'コードが見つかりません。アプリで新しい連携コードを発行してください（10分以内）。',
      accessToken,
    );
    return;
  }

  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await replyLine(replyToken, 'コードの有効期限が切れました。アプリで再発行してください。', accessToken);
    return;
  }

  const encryptedUserId = await encryptLineTarget(lineUserId);
  const { error: linkError } = await supabase.from('user_line_links').upsert(
    {
      user_id: pending.user_id,
      line_target_id: encryptedUserId,
      linked_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (linkError) {
    await replyLine(replyToken, '連携の保存に失敗しました。', accessToken);
    return;
  }

  await supabase.from('line_link_pending').delete().eq('user_id', pending.user_id);
  await replyLine(
    replyToken,
    '連携完了！アプリの設定画面に戻ると「自分に通知」が有効になります。',
    accessToken,
  );
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const lineAccessToken = Deno.env.get('LINE_ACCESS_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!lineAccessToken || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server not configured' }, 500);
  }

  let body: LineWebhookBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  for (const event of body.events ?? []) {
    const source = event.source;
    const groupId = source?.groupId;
    const replyToken = event.replyToken;

    if (event.type === 'join' && source?.type === 'group' && groupId) {
      try {
        await handleGroupJoin(supabase, groupId, replyToken, lineAccessToken);
      } catch (err) {
        console.error('Group join handler error:', err);
      }
      continue;
    }

    // ボットがグループに追加された直後は join が来ないことが多い → 初回メッセージで PIN 発行
    if (
      event.type === 'message' &&
      event.message?.type === 'text' &&
      groupId &&
      replyToken
    ) {
      const text = event.message.text?.trim() ?? '';

      try {
        const hasTeam = await groupHasTeam(supabase, groupId);
        if (!hasTeam) {
          await handleGroupJoin(supabase, groupId, replyToken, lineAccessToken);
          continue;
        }

        if (/^pin$/i.test(text)) {
          await handleGroupPinRequest(supabase, groupId, replyToken, lineAccessToken);
          continue;
        }
      } catch (err) {
        console.error('Group message handler error:', err);
      }
      continue;
    }

    if (event.type !== 'message' || event.message?.type !== 'text' || !replyToken) {
      continue;
    }

    const lineUserId = source?.userId;
    const text = event.message.text?.trim() ?? '';

    // 1:1 トークのみ個人連携（グループ内の数字は無視）
    if (!lineUserId) continue;

    if (/^[0-9]{6}$/.test(text)) {
      await handlePersonalLinkCode(supabase, lineUserId, replyToken, text, lineAccessToken);
      continue;
    }

    if (text === '連携' || text.toLowerCase() === 'link') {
      await replyLine(
        replyToken,
        '四季轟煙アプリの設定で「連携コードを発行」を押し、表示された6桁の数字をこのトークに送信してください。',
        lineAccessToken,
      );
    }
  }

  return jsonResponse({ ok: true });
});
