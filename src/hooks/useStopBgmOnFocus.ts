import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { haltBgmImmediately } from '@/lib/themeMusicPlayer';

/** 計測画面など — フォーカス中は BGM を停止 */
export function useStopBgmOnFocus() {
  useFocusEffect(
    useCallback(() => {
      haltBgmImmediately();
      return () => undefined;
    }, []),
  );
}
