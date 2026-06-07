/**
 * 外部ロガーのプリセット定義（モックスキャン用）
 *
 * 将来 react-native-ble-plx 等で実デバイス接続時も
 * 同じ capabilities マッピングで採点を自動調整する。
 */

import type { LoggerCapabilities, LoggerDevice } from '@/types/logger';

const CAP_BASIC: LoggerCapabilities = {
  tier: 'basic',
  hasHighFidelityG: false,
  hasDirectSlipAngle: false,
  hasWheelSpeed: true,
  hasHighRateGps: false,
  gSampleRateHz: 0,
  gpsSampleRateHz: 5,
  accuracyGrade: 'medium',
};

const CAP_ADVANCED: LoggerCapabilities = {
  tier: 'advanced',
  hasHighFidelityG: true,
  hasDirectSlipAngle: false,
  hasWheelSpeed: true,
  hasHighRateGps: true,
  gSampleRateHz: 25,
  gpsSampleRateHz: 10,
  accuracyGrade: 'high',
};

const CAP_PRO: LoggerCapabilities = {
  tier: 'pro',
  hasHighFidelityG: true,
  hasDirectSlipAngle: true,
  hasWheelSpeed: true,
  hasHighRateGps: true,
  gSampleRateHz: 100,
  gpsSampleRateHz: 20,
  accuracyGrade: 'race',
};

/** スキャンで検出するモックロガー一覧 */
export const MOCK_LOGGER_DEVICES: LoggerDevice[] = [
  {
    id: 'mock-obd-gps',
    name: 'OBD GPS Link',
    model: 'OBD-II GPS',
    manufacturer: 'Generic',
    capabilities: CAP_BASIC,
    transport: 'mock',
  },
  {
    id: 'mock-racebox-mini',
    name: 'RaceBox Mini',
    model: 'Mini S',
    manufacturer: 'RaceBox',
    capabilities: CAP_ADVANCED,
    transport: 'mock',
  },
  {
    id: 'mock-aim-mx',
    name: 'AiM MX Logger',
    model: 'MXG 1.2',
    manufacturer: 'AiM Sports',
    capabilities: CAP_PRO,
    transport: 'mock',
  },
];

export const LOGGER_TIER_LABELS: Record<LoggerCapabilities['tier'], string> = {
  phone:    'スマホ単体',
  basic:    'ベーシック',
  advanced: 'アドバンス',
  pro:      'プロ',
};

export const ACCURACY_GRADE_LABELS: Record<LoggerCapabilities['accuracyGrade'], string> = {
  low:    '標準',
  medium: '中精度',
  high:   '高精度',
  race:   'レース級',
};
