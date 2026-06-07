/**
 * LINE 通知 — Supabase Edge Function（line-notify）経由
 * DB 上の LINE ID は暗号化。平文は Edge シークレットでのみ復号。
 */

import {
  ensureAnonymousAuth,
  getSupabaseClient,
  isSupabaseConfigured,
  requireSupabaseClient,
} from '@/lib/supabase';

export type NotifyTeamLookup = {
  pin: string;
  teamName: string;
  lineTargetId: string;
};

export type LineLinkCode = {
  code: string;
  expiresAtMs: number;
};

const TEAM_PIN_PATTERN = /^[0-9]{4,6}$/;

type LineNotifyPayload = {
  ok?: boolean;
  error?: string;
  hint?: string;
  team?: {
    pin: string;
    team_name: string;
    line_target_id: string;
  };
  linked?: boolean;
  line_target_id?: string | null;
  encrypted_target_id?: string;
};

async function invokeLineNotify(
  body: Record<string, unknown>,
): Promise<{ ok: true; data: LineNotifyPayload } | { ok: false; reason: string }> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.functions.invoke('line-notify', { body });

  if (error) {
    const ctx = (error as { context?: { status?: number; json?: () => Promise<LineNotifyPayload> } })
      .context;
    if (ctx?.json) {
      try {
        const payload = await ctx.json();
        if (payload?.hint === 'rate_limit_exceeded' || payload?.error?.includes('rate limit')) {
          return {
            ok: false,
            reason: 'PIN 確認の試行回数が上限に達しました。15分後に再度お試しください',
          };
        }
        if (payload?.error) {
          return { ok: false, reason: mapLineNotifyError(payload.error) };
        }
      } catch {
        // fall through
      }
    }
    return { ok: false, reason: error.message ?? 'LINE 通知 API の呼び出しに失敗しました' };
  }

  const payload = (data ?? {}) as LineNotifyPayload;
  if (!payload.ok) {
    if (payload.hint === 'rate_limit_exceeded' || payload.error?.includes('rate limit')) {
      return {
        ok: false,
        reason: 'PIN 確認の試行回数が上限に達しました。15分後に再度お試しください',
      };
    }
    return { ok: false, reason: mapLineNotifyError(payload.error ?? 'リクエストに失敗しました') };
  }

  return { ok: true, data: payload };
}

function mapLineNotifyError(error: string): string {
  if (error === 'PIN not found') {
    return 'PIN が見つかりません。主催者に確認してください';
  }
  if (error === 'Invalid PIN format') {
    return 'PIN は6桁の数字で入力してください（旧4桁PINも利用可）';
  }
  if (error.includes('rate limit')) {
    return 'PIN 確認の試行回数が上限に達しました。15分後に再度お試しください';
  }
  if (error.includes('network')) {
    return 'この回線からの PIN 確認が上限に達しました。15分後に再度お試しください';
  }
  if (error === 'Encryption not configured') {
    return 'サーバー暗号化が未設定です（管理者に LINE_TARGET_ENCRYPTION_KEY を設定してもらってください）';
  }
  return error;
}

export function normalizeTeamPin(raw: string): string | null {
  const trimmed = raw.trim();
  return TEAM_PIN_PATTERN.test(trimmed) ? trimmed : null;
}

export async function lookupNotifyTeam(pinRaw: string): Promise<
  | { ok: true; team: NotifyTeamLookup }
  | { ok: false; reason: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase が未設定です' };
  }

  const pin = normalizeTeamPin(pinRaw);
  if (!pin) {
    return { ok: false, reason: 'PIN は6桁の数字で入力してください（旧4桁PINも利用可）' };
  }

  try {
    await ensureAnonymousAuth();
  } catch (err) {
    const message = err instanceof Error ? err.message : '認証に失敗しました';
    return { ok: false, reason: message };
  }

  if (!getSupabaseClient()) {
    return { ok: false, reason: 'Supabase クライアントを初期化できません' };
  }

  const result = await invokeLineNotify({ action: 'team_lookup', pin });
  if (!result.ok) return result;

  const team = result.data.team;
  if (!team?.line_target_id) {
    return { ok: false, reason: 'PIN が見つかりません。主催者に確認してください' };
  }

  return {
    ok: true,
    team: {
      pin: team.pin,
      teamName: team.team_name,
      lineTargetId: team.line_target_id,
    },
  };
}

/** session_logs 保存用 — DB には暗号文のみ保存 */
export async function encryptLineTargetForStorage(
  plainTargetId: string,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    await ensureAnonymousAuth();
  } catch {
    return null;
  }

  if (!getSupabaseClient()) return null;

  const result = await invokeLineNotify({
    action: 'encrypt_target',
    target_id: plainTargetId,
  });
  if (!result.ok) return null;
  return result.data.encrypted_target_id ?? null;
}

function generateLinkCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** 個人連携用 6 桁コードを発行（10 分有効） */
export async function issueLineLinkCode(): Promise<
  | { ok: true; link: LineLinkCode }
  | { ok: false; reason: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase が未設定です' };
  }

  let userId: string;
  try {
    userId = await ensureAnonymousAuth();
  } catch (err) {
    const message = err instanceof Error ? err.message : '認証に失敗しました';
    return { ok: false, reason: message };
  }

  const supabase = requireSupabaseClient();
  const code = generateLinkCode();
  const expiresAtMs = Date.now() + 10 * 60 * 1000;

  const { error } = await supabase.from('line_link_pending').upsert(
    {
      user_id: userId,
      code,
      expires_at: new Date(expiresAtMs).toISOString(),
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true, link: { code, expiresAtMs } };
}

/** 個人連携が完了しているか確認（Edge で復号） */
export async function fetchLinkedLineTargetId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    await ensureAnonymousAuth();
  } catch {
    return null;
  }

  if (!getSupabaseClient()) return null;

  const result = await invokeLineNotify({ action: 'personal_status' });
  if (!result.ok || !result.data.linked) return null;
  return result.data.line_target_id ?? null;
}

/** 公式アカウント友だち追加 URL（https） */
export function getLineAddFriendUrl(): string | null {
  const basicId = normalizeLineOaBasicId();
  if (!basicId) return null;
  return `https://line.me/R/ti/p/@${basicId}`;
}

/** 設定済みなら @付き Basic ID を表示用に返す */
export function getLineOaBasicIdLabel(): string | null {
  const basicId = normalizeLineOaBasicId();
  if (!basicId) return null;
  return `@${basicId}`;
}

export function isLineAddFriendConfigured(): boolean {
  return normalizeLineOaBasicId() != null;
}

function normalizeLineOaBasicId(): string | null {
  const raw = process.env.EXPO_PUBLIC_LINE_OA_BASIC_ID?.trim();
  if (!raw) return null;
  return raw.startsWith('@') ? raw.slice(1) : raw;
}

/** LINE アプリ優先、なければ https */
export function getLineAddFriendOpenUrls(): { lineScheme: string; https: string } | null {
  const basicId = normalizeLineOaBasicId();
  if (!basicId) return null;
  return {
    lineScheme: `line://ti/p/@${basicId}`,
    https: `https://line.me/R/ti/p/@${basicId}`,
  };
}
