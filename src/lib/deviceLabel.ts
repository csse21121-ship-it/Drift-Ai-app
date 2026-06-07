/**
 * キャリブメタデータ用 — 端末表示名
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** 取得可能な範囲で端末モデル / 名称を返す */
export function getDeviceModelLabel(): string | undefined {
  const name = Constants.deviceName?.trim();
  if (name && name.toLowerCase() !== 'unknown') {
    return name;
  }

  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return Platform.OS === 'ios' ? 'iOS Device' : 'Android Device';
  }

  if (Platform.OS === 'web') {
    return 'Web';
  }

  return undefined;
}
