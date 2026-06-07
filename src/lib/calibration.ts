/**
 * センサーキャリブレーション — 永続ストア
 *
 * 【キャリブレーションの目的】
 *
 *   スマホの加速度計・ジャイロスコープには端末固有の DC バイアスがある。
 *   車に固定した状態で「静止中の平均値」を計測してバイアスを推定し、
 *   以降の計測値から差し引くことで精度を上げる。
 *
 *   改善が見込まれる箇所:
 *     - 横G の精度   → ドリフト検知閾値の安定化
 *     - ヨーレート   → スリップアングル推定のドリフト抑制
 *
 * 【利用フロー】
 *
 *   1. 設定画面の CALIBRATE ボタンを押す（車停止・端末固定状態）
 *   2. useCalibration.capture() が 100 サンプル（約 5 秒）収集
 *   3. 各軸の平均値をバイアスとして saveCalibration() で保存
 *   4. useTelemetrySession が起動時に loadCalibration() で読み込み
 *   5. センサー値から calibration offset を引き算して使用
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MountOrientation } from '@/lib/orientation';
import type { MountOrientationOverride } from '@/types/settings';

const CALIBRATION_KEY = '@driftscore/calibration';

// ── 型定義 ──────────────────────────────────────────────────

export type CalibrationData = {
  /** 静止時の車体横方向 G 平均値（バイアス） */
  lateralGOffset: number;
  /** 静止時の車体前後方向 G 平均値（バイアス） */
  longitudinalGOffset: number;
  /** 静止時のジャイロ X 平均値 (rad/s) */
  gyroXOffset: number;
  /** 静止時のジャイロ Y 平均値 (rad/s) */
  gyroYOffset: number;
  /** 静止時のジャイロ Z 平均値 (rad/s) */
  gyroZOffset: number;
  /** キャリブレーション実施時刻 (Date.now()) */
  capturedAt: number;
  /** 使用したサンプル数 */
  sampleCount: number;
  /** キャリブ時のマウント向き（車体軸リマップ基準） */
  mountOrientationAtCapture?: MountOrientation;
  /** キャリブ時点の mountOverride 設定スナップショット */
  mountOverrideAtCapture?: MountOrientationOverride;
  /** キャリブ実行端末（取得可能な場合） */
  deviceModel?: string;
  /** 静止時横Gの分散（アイドリング振動ノイズ推定） */
  lateralGVariance?: number;
  /** 静止時前後Gの分散 */
  longitudinalGVariance?: number;
  /** 横/前後の大きい方の分散 — カルマン R 推定用 */
  noiseVarianceG?: number;
};

/**
 * バイアスゼロのデフォルト値。
 * AsyncStorage に保存データがない場合や、クリア後に使用する。
 */
export const ZERO_CALIBRATION: CalibrationData = {
  lateralGOffset:      0,
  longitudinalGOffset: 0,
  gyroXOffset:         0,
  gyroYOffset:         0,
  gyroZOffset:         0,
  capturedAt:          0,
  sampleCount:         0,
};

// ── AsyncStorage 操作 ────────────────────────────────────────

/** 保存済みキャリブレーションを読み込む。データなし時は ZERO_CALIBRATION を返す */
export async function loadCalibration(): Promise<CalibrationData> {
  try {
    const json = await AsyncStorage.getItem(CALIBRATION_KEY);
    if (!json) return ZERO_CALIBRATION;
    return { ...ZERO_CALIBRATION, ...(JSON.parse(json) as Partial<CalibrationData>) };
  } catch {
    return ZERO_CALIBRATION;
  }
}

/** キャリブレーションデータを保存する */
export async function saveCalibration(data: CalibrationData): Promise<void> {
  await AsyncStorage.setItem(CALIBRATION_KEY, JSON.stringify(data));
}

/** キャリブレーションデータを削除してデフォルトに戻す */
export async function clearCalibration(): Promise<void> {
  await AsyncStorage.removeItem(CALIBRATION_KEY);
}

// ── ユーティリティ ───────────────────────────────────────────

/** キャリブレーションが有効か（sampleCount > 0 = 実測済み） */
export function isCalibrated(cal: CalibrationData): boolean {
  return cal.sampleCount > 0;
}

/**
 * キャリブレーション収集時の姿勢を決定する。
 * mountOverride が手動固定のときは自動検知を使わない。
 */
export function resolveCalibrationOrientation(
  mountOverride: MountOrientationOverride,
  detected: MountOrientation,
): MountOrientation {
  if (mountOverride !== 'auto') return mountOverride;
  return detected;
}

/** 手動固定 mountOverride か */
export function isFixedMountOverride(
  mountOverride: MountOrientationOverride,
): mountOverride is MountOrientation {
  return mountOverride !== 'auto';
}

/**
 * 保存済みキャリブの向きと現在の設定が食い違うか。
 * 固定向きでキャリブした後に設定を変えた場合などに true。
 */
export function needsRecalibrationForMountChange(
  cal: CalibrationData | null | undefined,
  currentMountOverride: MountOrientationOverride,
): boolean {
  if (!cal || !isCalibrated(cal)) return false;

  const capturedMount = cal.mountOrientationAtCapture;
  if (!capturedMount || capturedMount === 'unknown') return false;

  const capturedOverride = cal.mountOverrideAtCapture;

  if (currentMountOverride === 'auto') {
    return capturedOverride != null && capturedOverride !== 'auto';
  }

  return currentMountOverride !== capturedMount;
}

/** バイアス補正を適用した横G / 前後G を返す */
export function applyGCalibration(
  lateralG: number,
  longitudinalG: number,
  cal: CalibrationData,
): { lateralG: number; longitudinalG: number } {
  return {
    lateralG:      lateralG      - cal.lateralGOffset,
    longitudinalG: longitudinalG - cal.longitudinalGOffset,
  };
}

/** バイアス補正を適用したジャイロ値を返す */
export function applyGyroCalibration(
  gyro: { x: number; y: number; z: number },
  cal: CalibrationData,
): { x: number; y: number; z: number } {
  return {
    x: gyro.x - cal.gyroXOffset,
    y: gyro.y - cal.gyroYOffset,
    z: gyro.z - cal.gyroZOffset,
  };
}

/** 配列の分散を計算 */
export function computeSampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

/**
 * 静止キャリブのノイズ分散からカルマン R の追加倍率を推定。
 * アイドリング振動が大きい車ほど R を高めにする。
 */
export function calibrationNoiseRMultiplier(cal: CalibrationData): number {
  const v = cal.noiseVarianceG ?? 0;
  if (v <= 0 || cal.sampleCount < 2) return 1;
  if (v < 0.002) return 1.0;
  if (v < 0.006) return 1.25;
  if (v < 0.015) return 1.55;
  return 1.85;
}
