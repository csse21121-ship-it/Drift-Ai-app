/**
 * Supabase クライアント — アプリ全体の唯一の接続点
 *
 * URL / ANON KEY は .env の EXPO_PUBLIC_* から読み込みます。
 * 必ずこのファイルからインポートしてください。
 */

import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SessionResult, TelemetryLogPoint } from '@/types/score';
import type { SessionLogUploadPayload, SessionLogUploadResult } from '@/types/sessionLog';
import {
  isTurnstileConfigured,
  requestFreshCaptchaToken,
} from '@/lib/supabaseCaptcha';
import { getLineNotifyTargetForUpload } from '@/lib/lineNotifyStore';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
const AUTH_STORAGE_KEY = '@driftscore/supabase-auth';

/** 走行 JSON の Storage バケット名 */
export const SESSION_LOGS_STORAGE_BUCKET = 'logs';

let client: SupabaseClient | null = null;
let anonymousAuthPromise: Promise<string> | null = null;

export type SessionLogUploadInput = {
  result: SessionResult;
  telemetryLog: TelemetryLogPoint[];
  vehicleLabel?: string | null;
  locationLabel?: string | null;
};

/** 環境変数が設定済みか */
export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

function createSupabaseClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: {
      /** Broadcast / Presence（Channels）向け */
      params: {
        eventsPerSecond: 10,
      },
      heartbeatIntervalMs: 15_000,
      timeout: 20_000,
    },
  });
}

export type RealtimeReadyResult =
  | { ok: true; authWarning?: string }
  | { ok: false; error: string };

/**
 * リアルタイム（Channels / Broadcast）利用前の準備。
 * 匿名認証を試行（失敗しても Realtime 自体は API キーで接続可能な場合あり）。
 */
export async function ensureRealtimeReady(): Promise<RealtimeReadyResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: 'Supabase 環境変数が未設定です' };
  }
  if (!getSupabaseClient()) {
    return { ok: false, error: 'Supabase クライアントを初期化できません' };
  }
  try {
    await ensureAnonymousAuth();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : '匿名認証に失敗しました';
    // ルーム接続は publishable / anon キーのみでも試行可能
    return { ok: true, authWarning: message };
  }
}

/** 追走ルーム用 Realtime チャンネル名 */
export function tsuisoRoomChannelName(pin: string): string {
  return `tsuiso-room-${pin.trim()}`;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createSupabaseClient();
  }
  return client;
}

export function requireSupabaseClient(): SupabaseClient {
  const instance = getSupabaseClient();
  if (!instance) {
    throw new Error(
      'Supabase が未設定です。.env に EXPO_PUBLIC_SUPABASE_URL と EXPO_PUBLIC_SUPABASE_ANON_KEY を設定してください。',
    );
  }
  return instance;
}

/**
 * 端末ごとの匿名ユーザー ID を確保する。
 * 初回は signInAnonymously、以降は AsyncStorage のセッションを再利用。
 * CAPTCHA 保護 ON 時は EXPO_PUBLIC_TURNSTILE_SITE_KEY 経由で captchaToken を付与。
 */
async function signInAnonymouslyWithCaptcha(supabase: SupabaseClient): Promise<string> {
  let captchaToken: string | undefined;

  if (isTurnstileConfigured()) {
    captchaToken = await requestFreshCaptchaToken();
    if (!captchaToken) {
      throw new Error('CAPTCHA token required but not obtained');
    }
    if (__DEV__) {
      console.log('[auth] signInAnonymously with captcha token length:', captchaToken.length);
    }
  }

  const { data, error } = await supabase.auth.signInAnonymously({
    options: captchaToken ? { captchaToken } : undefined,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (!data.user?.id) {
    throw new Error('匿名ユーザー ID を取得できませんでした');
  }
  return data.user.id;
}

export async function ensureAnonymousAuth(): Promise<string> {
  const supabase = requireSupabaseClient();

  if (anonymousAuthPromise) {
    return anonymousAuthPromise;
  }

  anonymousAuthPromise = (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      throw new Error(sessionError.message);
    }
    if (sessionData.session?.user?.id) {
      return sessionData.session.user.id;
    }

    return signInAnonymouslyWithCaptcha(supabase);
  })();

  try {
    return await anonymousAuthPromise;
  } finally {
    anonymousAuthPromise = null;
  }
}

/** アプリ起動時に匿名認証を先行実行（失敗時は握りつぶす） */
export async function warmupAnonymousAuth(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    return await ensureAnonymousAuth();
  } catch {
    return null;
  }
}

function resolveLocationLabel(
  session: Pick<SessionResult, 'courseName' | 'gpsTrack' | 'telemetryLog'>,
  override?: string | null,
): string | null {
  if (override?.trim()) return override.trim();
  if (session.courseName?.trim()) return session.courseName.trim();

  const fromTrack = session.gpsTrack?.[0];
  if (fromTrack) {
    return `${fromTrack.latitude.toFixed(5)}, ${fromTrack.longitude.toFixed(5)}`;
  }

  const fromLog = session.telemetryLog?.find(
    (p) => typeof p.latitude === 'number' && typeof p.longitude === 'number',
  );
  if (fromLog?.latitude != null && fromLog.longitude != null) {
    return `${fromLog.latitude.toFixed(5)}, ${fromLog.longitude.toFixed(5)}`;
  }

  return null;
}

function resolveVehicleLabel(override?: string | null): string | null {
  const trimmed = override?.trim();
  return trimmed ? trimmed : 'スマホ計測';
}

function buildStoragePath(userId: string, startedAt: number): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${userId}/${startedAt}_${suffix}.json`;
}

/** Supabase / Storage の生エラーをユーザー向け日本語に変換 */
function formatSessionLogUploadError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes('anonymous') && lower.includes('disabled')) {
    return '匿名認証が無効です（Dashboard → Authentication → Anonymous Sign-Ins を ON）';
  }
  if (lower.includes('bucket not found') || lower.includes('not found')) {
    return 'Storage バケット "logs" がありません（Dashboard → Storage で作成）';
  }
  if (lower.includes('row-level security') || lower.includes('violates row-level')) {
    return '保存権限がありません（session_logs / Storage の RLS ポリシーを確認）';
  }
  if (lower.includes("'location'") || lower.includes("'vehicle'")) {
    return 'テーブル列名が一致しません（track_name / car_model を使用してください）';
  }
  if (lower.includes("'track_name'") || lower.includes("'car_model'")) {
    return 'テーブル列名が一致しません（session_logs の列定義を確認してください）';
  }
  if (lower.includes("'file_url'")) {
    return (
      'session_logs に file_url 列がありません。' +
      'supabase/setup/alter_session_logs_columns.sql を SQL Editor で実行してください'
    );
  }
  if (lower.includes("'line_target_id'")) {
    return (
      'session_logs に line_target_id 列がありません。' +
      'supabase/setup/add_line_target_id_column.sql を SQL Editor で実行してください'
    );
  }
  if (lower.includes('invalid api key') || lower.includes('jwt')) {
    return 'Supabase API キーが無効です（.env の ANON / Publishable key を確認）';
  }
  if (lower.includes('captcha')) {
    return (
      'Supabase の CAPTCHA 保護が ON です。Dashboard → Authentication → ' +
      'Bot and Abuse Protection → Enable CAPTCHA protection を OFF にしてください'
    );
  }

  return message;
}

export function buildSessionLogPayload(
  result: SessionResult,
  telemetryLog: TelemetryLogPoint[],
  options?: { vehicleLabel?: string | null; locationLabel?: string | null },
): SessionLogUploadPayload {
  return {
    session: {
      startedAt: result.startedAt,
      sessionDurationMs: result.sessionDurationMs,
      totalPoints: result.totalPoints,
      grade: result.grade,
      courseName: result.courseName,
      maxSpeedKmh: result.maxSpeedKmh,
    },
    telemetryLog,
    vehicleLabel: options?.vehicleLabel ?? null,
    locationLabel: options?.locationLabel ?? null,
  };
}

/**
 * 走行 JSON を Storage（logs バケット）へアップロードし、
 * session_logs テーブルへ INSERT する。
 */
export async function uploadSessionLog(
  input: SessionLogUploadInput,
): Promise<SessionLogUploadResult> {
  const { result, telemetryLog, vehicleLabel, locationLabel } = input;

  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase が未設定です' };
  }

  if (telemetryLog.length < 2) {
    return { ok: false, reason: 'テレメトリーデータが不足しています' };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, reason: 'Supabase クライアントを初期化できません' };
  }

  let userId: string;
  try {
    userId = await ensureAnonymousAuth();
  } catch (err) {
    const message = err instanceof Error ? err.message : '匿名認証に失敗しました';
    console.warn('[uploadSessionLog] anonymous auth failed:', message);
    return { ok: false, reason: formatSessionLogUploadError(message) };
  }

  const payload = buildSessionLogPayload(result, telemetryLog, {
    vehicleLabel,
    locationLabel,
  });
  const storagePath = buildStoragePath(userId, payload.session.startedAt);
  const jsonBody = JSON.stringify(
    {
      formatVersion: 1,
      exportedAtUtcMs: Date.now(),
      ...payload,
      result,
    },
    null,
    0,
  );
  const fileBytes = new TextEncoder().encode(jsonBody);

  const { error: uploadError } = await supabase.storage
    .from(SESSION_LOGS_STORAGE_BUCKET)
    .upload(storagePath, fileBytes, {
      contentType: 'application/json',
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    console.warn('[uploadSessionLog] storage upload failed:', uploadError.message);
    return { ok: false, reason: formatSessionLogUploadError(uploadError.message) };
  }

  const { data: publicUrlData } = supabase.storage
    .from(SESSION_LOGS_STORAGE_BUCKET)
    .getPublicUrl(storagePath);
  const fileUrl = publicUrlData.publicUrl;

  const lineTargetId = await getLineNotifyTargetForUpload();

  const insertRow: {
    user_id: string;
    file_url: string;
    score: number;
    track_name: string | null;
    car_model: string | null;
    line_target_id?: string;
  } = {
    user_id: userId,
    file_url: fileUrl,
    score: payload.session.totalPoints,
    track_name: resolveLocationLabel(result, locationLabel),
    car_model: resolveVehicleLabel(vehicleLabel),
  };

  if (lineTargetId) {
    const { encryptLineTargetForStorage } = await import('@/lib/lineNotifyApi');
    const encryptedTarget = await encryptLineTargetForStorage(lineTargetId);
    if (!encryptedTarget) {
      console.warn('[uploadSessionLog] line target encryption failed');
      return {
        ok: false,
        reason: 'LINE 通知先の暗号化に失敗しました。設定を確認するか、しばらくして再試行してください',
      };
    }
    insertRow.line_target_id = encryptedTarget;
  }

  const { error: insertError } = await supabase.from('session_logs').insert(insertRow);

  if (insertError) {
    console.warn('[uploadSessionLog] session_logs insert failed:', insertError.message);
    return { ok: false, reason: formatSessionLogUploadError(insertError.message) };
  }

  return { ok: true, fileUrl, storagePath };
}
