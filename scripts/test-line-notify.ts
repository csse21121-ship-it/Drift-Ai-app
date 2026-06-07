/**
 * LINE 走行速報 — 疎通テスト
 *
 * Usage: npm run test:line-notify
 * Required (one of):
 *   LINE_TEST_PIN=4556
 *   LINE_TEST_TARGET_ID=Cxxx...
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const TEST_PIN = process.env.LINE_TEST_PIN?.trim();
const TEST_TARGET_ID = process.env.LINE_TEST_TARGET_ID?.trim();

type StepResult = { name: string; ok: boolean; detail: string };

const results: StepResult[] = [];

function pass(name: string, detail: string): void {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}: ${detail}`);
}

function fail(name: string, detail: string): void {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}: ${detail}`);
}

async function supabaseAuth(): Promise<{ accessToken: string; userId: string } | null> {
  if (!SUPABASE_URL || !ANON_KEY) {
    fail('env', 'EXPO_PUBLIC_SUPABASE_URL / ANON_KEY が未設定');
    return null;
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  const body = (await res.json()) as {
    access_token?: string;
    user?: { id?: string };
    error_description?: string;
    msg?: string;
  };

  if (!res.ok || !body.access_token || !body.user?.id) {
    fail('anonymous auth', body.error_description ?? body.msg ?? `HTTP ${res.status}`);
    return null;
  }

  pass('anonymous auth', `user_id=${body.user.id.slice(0, 8)}…`);
  return { accessToken: body.access_token, userId: body.user.id };
}

async function testNotifyTeamsDirectSelectBlocked(accessToken: string): Promise<void> {
  if (!SUPABASE_URL || !ANON_KEY) return;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notify_teams?select=pin,team_name,line_target_id&limit=1`,
    {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const body = await res.text();
  if (res.status === 403 || res.status === 401 || body.includes('permission denied')) {
    pass('notify_teams direct SELECT blocked', `HTTP ${res.status} — 一覧取得不可`);
    return;
  }

  if (res.ok) {
    fail('notify_teams direct SELECT blocked', '全件 SELECT がまだ可能です（SQL マイグレーション未適用？）');
    return;
  }

  pass('notify_teams direct SELECT blocked', `HTTP ${res.status}`);
}

async function invokeLineNotify(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/line-notify`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, payload };
}

async function testRpcDeprecated(accessToken: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/lookup_notify_team_by_pin`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_pin: '000000' }),
  });
  const body = await res.text();
  if (!res.ok && (body.includes('deprecated') || body.includes('line-notify'))) {
    pass('legacy RPC disabled', '直接 RPC から ID は取得不可');
    return;
  }
  fail('legacy RPC disabled', `旧 RPC がまだ使えます: HTTP ${res.status}`);
}

async function testTeamPinLookup(accessToken: string): Promise<string | null> {
  if (!SUPABASE_URL || !ANON_KEY) return null;

  const pin = TEST_PIN;
  if (!pin) {
    fail('PIN lookup', 'LINE_TEST_PIN が未設定（例: LINE_TEST_PIN=4556）');
    return null;
  }

  const { ok, status, payload } = await invokeLineNotify(accessToken, {
    action: 'team_lookup',
    pin,
  });

  if (!ok) {
    fail('PIN lookup (line-notify)', String(payload.error ?? `HTTP ${status}`));
    return null;
  }

  const team = payload.team as { team_name?: string; line_target_id?: string } | undefined;
  if (!team?.line_target_id) {
    fail('PIN lookup (line-notify)', `PIN=${pin} が見つかりません`);
    return null;
  }

  pass(
    'PIN lookup (line-notify)',
    `PIN=${pin} → ${team.team_name} (${team.line_target_id.slice(0, 6)}…)`,
  );
  return team.line_target_id;
}

async function encryptTargetForTest(accessToken: string, plainTargetId: string): Promise<string | null> {
  const { ok, payload } = await invokeLineNotify(accessToken, {
    action: 'encrypt_target',
    target_id: plainTargetId,
  });
  if (!ok) return null;
  return (payload.encrypted_target_id as string | undefined) ?? null;
}

async function testLineWebhook(targetId: string, encrypted?: string): Promise<void> {
  if (!SUPABASE_URL) return;

  const payload = {
    type: 'INSERT',
    table: 'session_logs',
    schema: 'public',
    record: {
      score: 88.5,
      track_name: 'テストコース（DriftScore AI）',
      car_model: 'TEST-RUN',
      line_target_id: encrypted ?? targetId,
    },
  };

  const res = await fetch(`${SUPABASE_URL}/functions/v1/line-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = { raw: text };
  }

  if (res.ok && parsed.ok === true) {
    pass('line-webhook Push', `HTTP ${res.status} — LINE に送信済み（端末で通知確認）`);
    if (typeof parsed.message === 'string') {
      console.log('  メッセージ:\n' + parsed.message.split('\n').map((l) => '    ' + l).join('\n'));
    }
    return;
  }

  fail('line-webhook Push', `HTTP ${res.status} — ${text.slice(0, 300)}`);
}

async function testSessionLogInsert(
  accessToken: string,
  userId: string,
  targetId: string,
  encryptedTargetId: string | null,
): Promise<void> {
  if (!SUPABASE_URL || !ANON_KEY) return;

  const row = {
    user_id: userId,
    file_url: `https://example.com/test/${Date.now()}.json`,
    score: 77.7,
    track_name: 'E2Eテスト（DBトリガー）',
    car_model: 'TRIGGER-TEST',
    line_target_id: encryptedTargetId ?? targetId,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/session_logs`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });

  if (res.ok || res.status === 201) {
    pass('session_logs INSERT', 'DB 保存 OK（pg_net トリガー経由で LINE も届くはず）');
    return;
  }

  const text = await res.text();
  fail('session_logs INSERT', `HTTP ${res.status} — ${text.slice(0, 300)}`);
}

async function testRateLimit(accessToken: string): Promise<void> {
  if (!SUPABASE_URL || !ANON_KEY) return;

  for (let i = 1; i <= 11; i++) {
    const { ok, status, payload } = await invokeLineNotify(accessToken, {
      action: 'team_lookup',
      pin: '000000',
    });

    if (i <= 10) {
      if (ok || status === 404) continue;
      if (payload.hint === 'rate_limit_exceeded') {
        fail('PIN rate limit', `試行 ${i}/10 で早期ブロック`);
        return;
      }
      fail('PIN rate limit', `試行 ${i}/10 で予期しないエラー: ${JSON.stringify(payload).slice(0, 120)}`);
      return;
    }

    if (
      !ok &&
      (payload.hint === 'rate_limit_exceeded' ||
        String(payload.error).includes('rate limit'))
    ) {
      pass('PIN rate limit', '11回目でブロック（15分10回）');
      return;
    }

    fail('PIN rate limit', `11回目がブロックされませんでした: HTTP ${status}`);
  }
}

async function testSuccessNotCounted(accessToken: string, validPin: string): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await invokeLineNotify(accessToken, { action: 'team_lookup', pin: '000000' });
  }

  const { ok, status, payload } = await invokeLineNotify(accessToken, {
    action: 'team_lookup',
    pin: validPin,
  });

  if (ok && (payload.team as { line_target_id?: string } | undefined)?.line_target_id) {
    pass('PIN success not counted', '5回失敗後も正しい PIN で成功（成功はカウント外）');
    return;
  }

  if (payload.hint === 'rate_limit_exceeded') {
    fail('PIN success not counted', '5回失敗後の正しい PIN がブロックされました');
    return;
  }

  fail('PIN success not counted', `期待外: HTTP ${status} ${JSON.stringify(payload).slice(0, 120)}`);
}

async function main(): Promise<void> {
  console.log('=== LINE 走行速報 疎通テスト ===\n');

  const auth = await supabaseAuth();
  if (!auth) {
    summarize();
    process.exit(1);
  }

  await testNotifyTeamsDirectSelectBlocked(auth.accessToken);
  await testRpcDeprecated(auth.accessToken);

  // レート制限テストは別ユーザーで実行（以降の PIN lookup と干渉しない）
  const rateLimitAuth = await supabaseAuth();
  if (rateLimitAuth) {
    await testRateLimit(rateLimitAuth.accessToken);
  }

  if (TEST_PIN) {
    const successAuth = await supabaseAuth();
    if (successAuth) {
      await testSuccessNotCounted(successAuth.accessToken, TEST_PIN);
    }
  }

  const targetFromPin = TEST_TARGET_ID ? null : await testTeamPinLookup(auth.accessToken);
  const targetId = TEST_TARGET_ID ?? targetFromPin;

  if (!targetId) {
    console.log('\nヒント: LINE_TEST_PIN=4556 または LINE_TEST_TARGET_ID=Cxxx を指定');
    summarize();
    process.exit(1);
  }

  const encryptedTarget = await encryptTargetForTest(auth.accessToken, targetId);
  if (encryptedTarget) {
    pass('encrypt_target', `暗号文 ${encryptedTarget.slice(0, 12)}…`);
  } else {
    fail('encrypt_target', '暗号化に失敗（LINE_TARGET_ENCRYPTION_KEY を確認）');
  }

  await testLineWebhook(targetId, encryptedTarget ?? undefined);
  await testSessionLogInsert(auth.accessToken, auth.userId, targetId, encryptedTarget);

  summarize();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

function summarize(): void {
  const ok = results.filter((r) => r.ok).length;
  const ng = results.length - ok;
  console.log(`\n=== 結果: ${ok} OK / ${ng} NG ===`);
}

void main();
