/** Supabase session_logs テーブル — INSERT 用 */

import type { SessionResult, TelemetryLogPoint } from '@/types/score';

export type SessionLogRow = {
  user_id: string;
  file_url: string;
  score: number;
  track_name: string | null;
  car_model: string | null;
  /** 設定済みの場合のみ — この ID 宛てに LINE Push */
  line_target_id?: string | null;
};

export type SessionLogUploadPayload = {
  session: {
    startedAt: number;
    sessionDurationMs: number;
    totalPoints: number;
    grade: string;
    courseName?: string;
    maxSpeedKmh?: number;
  };
  telemetryLog: unknown[];
  vehicleLabel?: string | null;
  locationLabel?: string | null;
};

export type SessionLogUploadResult =
  | { ok: true; fileUrl: string; storagePath: string }
  | { ok: false; reason: string };

export type SessionLogUploadStatus = 'idle' | 'loading' | 'success' | 'error' | 'skipped';

/** session_logs 一覧表示用（DB 行） */
export type CloudSessionLogListItem = {
  id: number;
  fileUrl: string;
  score: number;
  trackName: string | null;
  carModel: string | null;
  createdAt: string;
};

/** Storage に保存される走行 JSON */
export type CloudSessionLogFile = {
  formatVersion: 1;
  exportedAtUtcMs: number;
  session: SessionLogUploadPayload['session'];
  telemetryLog: TelemetryLogPoint[];
  vehicleLabel?: string | null;
  locationLabel?: string | null;
  /** フル SessionResult（新形式アップロード） */
  result?: SessionResult;
};
