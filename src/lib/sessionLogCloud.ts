/**
 * クラウド走行履歴 — session_logs 一覧取得・JSON 再ダウンロード
 */

import {
  ensureAnonymousAuth,
  getSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase';
import { resolveGrade } from '@/lib/scoring';
import type { Grade, SessionResult, TelemetryLogPoint } from '@/types/score';
import type {
  CloudSessionLogFile,
  CloudSessionLogListItem,
  SessionLogUploadPayload,
} from '@/types/sessionLog';

const CLOUD_LIST_LIMIT = 50;

type SessionLogDbRow = {
  id: number;
  file_url: string;
  score: number;
  track_name: string | null;
  car_model: string | null;
  created_at: string;
};

function mapDbRow(row: SessionLogDbRow): CloudSessionLogListItem {
  return {
    id: row.id,
    fileUrl: row.file_url,
    score: Number(row.score),
    trackName: row.track_name,
    carModel: row.car_model,
    createdAt: row.created_at,
  };
}

function isGrade(value: string): value is Grade {
  return value === 'S' || value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

function reconstructFromLegacyPayload(
  payload: SessionLogUploadPayload,
  telemetryLog: TelemetryLogPoint[],
): SessionResult {
  const session = payload.session;
  const maxLateralG = telemetryLog.reduce(
    (max, point) => Math.max(max, Math.abs(point.lateralG)),
    0,
  );
  const maxSpeedKmh =
    session.maxSpeedKmh
    ?? telemetryLog.reduce((max, point) => Math.max(max, point.speedKmh ?? 0), 0);
  const bestDriftDurationMs = telemetryLog.reduce(
    (max, point) => (point.driftPhase === 'active' ? Math.max(max, point.activeDurationMs) : max),
    0,
  );
  const grade = isGrade(session.grade) ? session.grade : resolveGrade(session.totalPoints);

  return {
    startedAt: session.startedAt,
    courseName: session.courseName ?? payload.locationLabel ?? undefined,
    sessionDurationMs: session.sessionDurationMs,
    totalPoints: session.totalPoints,
    grade,
    driftScores: [],
    events: [],
    maxSpeedKmh,
    maxLateralG,
    bestDriftDurationMs,
    telemetryLog,
  };
}

function parseCloudSessionLogFile(raw: unknown): CloudSessionLogFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.formatVersion !== 1) return null;
  if (!obj.session || typeof obj.session !== 'object') return null;
  if (!Array.isArray(obj.telemetryLog)) return null;

  return {
    formatVersion: 1,
    exportedAtUtcMs: typeof obj.exportedAtUtcMs === 'number' ? obj.exportedAtUtcMs : Date.now(),
    session: obj.session as SessionLogUploadPayload['session'],
    telemetryLog: obj.telemetryLog as TelemetryLogPoint[],
    vehicleLabel: typeof obj.vehicleLabel === 'string' ? obj.vehicleLabel : null,
    locationLabel: typeof obj.locationLabel === 'string' ? obj.locationLabel : null,
    result: obj.result && typeof obj.result === 'object' ? (obj.result as SessionResult) : undefined,
  };
}

export function sessionResultFromCloudFile(file: CloudSessionLogFile): SessionResult {
  if (file.result) {
    return {
      ...file.result,
      telemetryLog: file.telemetryLog.length > 0 ? file.telemetryLog : file.result.telemetryLog,
    };
  }

  return reconstructFromLegacyPayload(
    {
      session: file.session,
      telemetryLog: file.telemetryLog,
      vehicleLabel: file.vehicleLabel,
      locationLabel: file.locationLabel,
    },
    file.telemetryLog,
  );
}

export type CloudSessionLogListResult =
  | { ok: true; items: CloudSessionLogListItem[] }
  | { ok: false; reason: string };

export async function fetchCloudSessionLogs(): Promise<CloudSessionLogListResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'Supabase が未設定です（.env を確認）' };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, reason: 'Supabase クライアントを初期化できません' };
  }

  try {
    await ensureAnonymousAuth();
  } catch (err) {
    const message = err instanceof Error ? err.message : '匿名認証に失敗しました';
    return { ok: false, reason: message };
  }

  const { data, error } = await supabase
    .from('session_logs')
    .select('id, file_url, score, track_name, car_model, created_at')
    .order('created_at', { ascending: false })
    .limit(CLOUD_LIST_LIMIT);

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true, items: (data ?? []).map((row) => mapDbRow(row as SessionLogDbRow)) };
}

export type CloudSessionLogDownloadResult =
  | { ok: true; result: SessionResult; file: CloudSessionLogFile }
  | { ok: false; reason: string };

export async function downloadCloudSessionLog(
  fileUrl: string,
): Promise<CloudSessionLogDownloadResult> {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      return { ok: false, reason: `ダウンロード失敗 (HTTP ${response.status})` };
    }

    const raw = (await response.json()) as unknown;
    const file = parseCloudSessionLogFile(raw);
    if (!file) {
      return { ok: false, reason: '走行 JSON の形式が不正です' };
    }
    if (file.telemetryLog.length < 2) {
      return { ok: false, reason: 'テレメトリーデータが不足しています' };
    }

    return { ok: true, result: sessionResultFromCloudFile(file), file };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ネットワークエラー';
    return { ok: false, reason: message };
  }
}
