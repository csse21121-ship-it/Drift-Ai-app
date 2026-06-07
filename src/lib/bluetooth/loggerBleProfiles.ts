/**
 * BLE ロガープロファイル（汎用 + 既知プロトコルヒント）
 */

import type { LoggerCapabilities, LoggerDevice } from '@/types/logger';
import { UNIVERSAL_INITIAL_CAPABILITIES } from '@/lib/bluetooth/loggerCapabilityInference';

/** Nordic UART Service — 多くの BLE ロガーが使用 */
export const NUS_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
export const NUS_TX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E';

export type LoggerBleProfileId = 'universal';

/** 汎用 BLE ロガープロファイル（製品名フィルタなし） */
export const UNIVERSAL_BLE_PROFILE = {
  id: 'universal' as const,
  label: '汎用 BLE ロガー',
  capabilities: UNIVERSAL_INITIAL_CAPABILITIES,
};

/** スキャン結果から汎用 BLE デバイスを構築 */
export function buildUniversalBleDevice(
  bleId: string,
  name: string,
): LoggerDevice {
  return {
    id: `ble:${bleId}`,
    bleId,
    profileId: UNIVERSAL_BLE_PROFILE.id,
    name,
    model: 'Auto-detect',
    manufacturer: 'BLE',
    capabilities: { ...UNIVERSAL_BLE_PROFILE.capabilities },
    transport: 'ble',
  };
}

/** 既知のテレメトリデバイス名（表示用ヒントのみ・接続可否には不使用） */
export const KNOWN_LOGGER_NAME_HINTS = [
  /racebox/i,
  /aim/i,
  /vbox/i,
  /garmin/i,
  /obd/i,
  /gps/i,
  /logger/i,
  /telemetry/i,
];

export function isLikelyTelemetryDevice(name: string): boolean {
  return KNOWN_LOGGER_NAME_HINTS.some((re) => re.test(name));
}
