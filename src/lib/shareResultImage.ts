/**
 * 結果画面共有カードの PNG キャプチャと OS 共有シート
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { RefObject } from 'react';
import type ViewShot from 'react-native-view-shot';
import { SHARE_CARD_WIDTH } from '@/components/result/ResultShareCard';

type CaptureOptions = {
  /** 出力解像度倍率（デフォルト 3 → 1080px 幅） */
  pixelRatio?: number;
};

export async function captureResultShareImage(
  viewRef: RefObject<ViewShot | null>,
  options: CaptureOptions = {},
): Promise<string | null> {
  if (!viewRef.current) return null;
  const pixelRatio = options.pixelRatio ?? 3;
  try {
    return await captureRef(viewRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
      width: SHARE_CARD_WIDTH * pixelRatio,
    });
  } catch {
    return null;
  }
}

export async function shareResultImage(uri: string): Promise<boolean> {
  try {
    let shareUri = uri;
    if (Platform.OS === 'android') {
      shareUri = await FileSystem.getContentUriAsync(uri);
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(shareUri, {
        mimeType: 'image/png',
        dialogTitle: 'DriftScore AI — セッション結果',
        UTI: 'public.png',
      });
      return true;
    }

    // expo-sharing 非対応環境向けフォールバック（主に iOS）
    if (Platform.OS === 'ios') {
      const result = await Share.share({
        url: shareUri,
        title: 'DriftScore AI — セッション結果',
      });
      return result.action !== Share.dismissedAction;
    }

    return false;
  } catch {
    return false;
  }
}

export async function captureAndShareResultImage(
  viewRef: RefObject<ViewShot | null>,
): Promise<'shared' | 'unavailable' | 'failed'> {
  const uri = await captureResultShareImage(viewRef);
  if (!uri) return 'failed';
  const shared = await shareResultImage(uri);
  return shared ? 'shared' : 'unavailable';
}
