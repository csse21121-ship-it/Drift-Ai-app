/**
 * BLE ロガートランスポート（公開 API）
 */

import {
  bleLoggerManager,
  getBleUnavailableReason,
  isBleAvailable,
  isExpoGo,
  type BleProtocolCallback,
  type BleSampleCallback,
} from '@/lib/bluetooth/bleLoggerManager';
import type { LoggerDevice, LoggerSample } from '@/types/logger';
import type { LoggerProtocolId } from '@/lib/bluetooth/loggerProtocol';

export { isBleAvailable, isExpoGo, getBleUnavailableReason };
export type { LoggerProtocolId, BleProtocolCallback };

export async function scanBleLoggers(): Promise<LoggerDevice[]> {
  if (!(await isBleAvailable())) return [];
  return bleLoggerManager.scan();
}

export async function connectBleLogger(
  device: LoggerDevice,
  onSample: BleSampleCallback,
  onProtocol?: BleProtocolCallback,
): Promise<void> {
  await bleLoggerManager.connect(device, onSample, onProtocol);
}

export async function disconnectBleLogger(): Promise<void> {
  await bleLoggerManager.disconnect();
}

export function getConnectedBleDevice(): LoggerDevice | null {
  return bleLoggerManager.getConnectedDevice();
}

export function getDetectedBleProtocol(): LoggerProtocolId {
  return bleLoggerManager.getDetectedProtocol();
}
