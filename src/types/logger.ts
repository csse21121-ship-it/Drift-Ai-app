/**
 * 外部 Bluetooth ロガーの型定義
 *
 * 実機 BLE 接続前の開発・検証用にモックデバイスも同型で扱う。
 */

import type { PhonePerformanceTier } from '@/types/phoneSensor';

/** 接続状態 */
export type LoggerConnectionStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

/** ロガーの性能ティア（採点・閾値の自動調整に使用） */
export type LoggerTier = 'phone' | 'basic' | 'advanced' | 'pro';

/** ロガーが提供する計測能力 */
export type LoggerCapabilities = {
  tier: LoggerTier;
  /** 高精度 G センサー（10Hz 以上・ノイズ低） */
  hasHighFidelityG: boolean;
  /** 直接スリップアングル出力（推定不要） */
  hasDirectSlipAngle: boolean;
  /** ホイール/GPS 高精度速度 */
  hasWheelSpeed: boolean;
  /** 高レート GPS（5Hz 以上） */
  hasHighRateGps: boolean;
  gSampleRateHz: number;
  gpsSampleRateHz: number;
  /** 計測精度グレード（UI 表示・採点補正の強度） */
  accuracyGrade: 'low' | 'medium' | 'high' | 'race';
  /** スマホ端末のみ — プローブ判定の性能ティア */
  phonePerformanceTier?: PhonePerformanceTier;
};

/** スキャン/接続対象のロガーデバイス */
export type LoggerDevice = {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  capabilities: LoggerCapabilities;
  /** モック or BLE */
  transport: 'mock' | 'ble';
  /** BLE デバイス ID（MAC / UUID） */
  bleId?: string;
  /** BLE プロファイル（universal = 自動判別） */
  profileId?: string;
  /** 接続後に判明したデータ形式 */
  detectedProtocol?: string;
};

/** ロガーから受信する生サンプル（正規化済み） */
export type LoggerSample = {
  timestamp: number;
  lateralG?: number;
  longitudinalG?: number;
  yawRateRad?: number;
  slipAngleDeg?: number;
  speedKmh?: number;
  heading?: number;
  latitude?: number;
  longitude?: number;
};

/** セッション保存時に付与するテレメトリソース情報 */
export type TelemetrySourceMetadata = {
  primary: 'phone' | 'logger' | 'hybrid';
  loggerName?: string;
  loggerModel?: string;
  tier: LoggerTier;
  accuracyGrade: LoggerCapabilities['accuracyGrade'];
  /** スマホ計測時の端末ティア（プローブ結果） */
  phonePerformanceTier?: PhonePerformanceTier;
  /** 接続ロガーによる採点プロファイル調整の概要（UI 表示用） */
  scoringAdjustments: string[];
};

/** スマホ単体時の能力（ベースライン） */
export const PHONE_CAPABILITIES: LoggerCapabilities = {
  tier: 'phone',
  hasHighFidelityG: false,
  hasDirectSlipAngle: false,
  hasWheelSpeed: false,
  hasHighRateGps: false,
  gSampleRateHz: 20,
  gpsSampleRateHz: 2,
  accuracyGrade: 'low',
};
