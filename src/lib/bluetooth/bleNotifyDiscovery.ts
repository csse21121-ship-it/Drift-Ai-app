/**
 * BLE デバイスから通知可能な特性を探索
 */

import type { Characteristic, Device } from 'react-native-ble-plx';
import { NUS_TX_CHAR_UUID } from '@/lib/bluetooth/loggerBleProfiles';

export type NotifyCharacteristic = {
  serviceUuid: string;
  characteristicUuid: string;
  priority: number;
};

function charPriority(serviceUuid: string, charUuid: string): number {
  const su = serviceUuid.toLowerCase();
  const cu = charUuid.toLowerCase();
  if (cu === NUS_TX_CHAR_UUID.toLowerCase()) return 100;
  if (su.includes('6e400001')) return 90;
  if (cu.includes('fff1') || cu.includes('ffe1')) return 70;
  if (cu.includes('notify') || cu.includes('tx') || cu.includes('data')) return 50;
  return 10;
}

function isNotifiable(c: Characteristic): boolean {
  return c.isNotifiable || c.isIndicatable;
}

/** 接続済みデバイスから通知購読候補を優先度順に返す */
export async function discoverNotifyCharacteristics(
  device: Device,
): Promise<NotifyCharacteristic[]> {
  const services = await device.services();
  const results: NotifyCharacteristic[] = [];

  for (const service of services) {
    const chars = await service.characteristics();
    for (const c of chars) {
      if (!isNotifiable(c)) continue;
      results.push({
        serviceUuid: service.uuid,
        characteristicUuid: c.uuid,
        priority: charPriority(service.uuid, c.uuid),
      });
    }
  }

  results.sort((a, b) => b.priority - a.priority);
  return results;
}

/** 上位 N 件の通知特性を購読（汎用ロガー用） */
export function pickNotifyTargets(
  chars: NotifyCharacteristic[],
  max = 2,
): NotifyCharacteristic[] {
  return chars.slice(0, max);
}
