/**
 * 追走 .tsuiso ファイル — 受信リンク監視（AirDrop / Open In）
 */

import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { handleTsuisoInboundUri } from '@/lib/tsuisoInboundBridge';

export function TsuisoInboundLinking() {
  useEffect(() => {
    const process = async (url: string | null) => {
      if (!url) return;
      await handleTsuisoInboundUri(url);
    };

    void Linking.getInitialURL().then(process);
    const sub = Linking.addEventListener('url', ({ url }) => {
      void process(url);
    });

    return () => sub.remove();
  }, []);

  return null;
}
