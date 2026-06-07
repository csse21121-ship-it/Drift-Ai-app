/**
 * マウントセットアップオンボーディング — 初回ガイド完了フラグ
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const MOUNT_SETUP_KEY = '@driftscore/mount_setup_complete';

export async function isMountSetupComplete(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(MOUNT_SETUP_KEY);
    return v === '1';
  } catch {
    return false;
  }
}

export async function markMountSetupComplete(): Promise<void> {
  await AsyncStorage.setItem(MOUNT_SETUP_KEY, '1');
}
