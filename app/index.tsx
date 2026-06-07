/**
 * 起動画面 — Pit Lane スプラッシュ → Pit Lane ホームへ
 */

import { PitLaneSplash } from '@/components/splash/PitLaneSplash';
import { openPitLane } from '@/lib/navigation';

export default function SplashEntryScreen() {
  return (
    <PitLaneSplash
      onFinish={() => {
        openPitLane();
      }}
    />
  );
}
