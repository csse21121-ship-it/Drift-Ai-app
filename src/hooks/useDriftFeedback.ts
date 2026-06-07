import { useEffect, useRef } from 'react';
import { triggerDriftEnterFeedback } from '@/lib/driftFeedback';
import type { DriftStatus } from '@/types/drift';
import type { FeedbackSettings } from '@/types/settings';

/**
 * ドリフト phase が idle → active に遷移した瞬間に
 * ハプティクス / サウンドを発火する。
 */
export function useDriftFeedback(
  driftStatus: DriftStatus,
  isActive: boolean,
  feedback: FeedbackSettings,
): void {
  const prevPhaseRef = useRef<DriftStatus['phase']>('idle');

  useEffect(() => {
    if (!isActive) {
      prevPhaseRef.current = 'idle';
      return;
    }

    const prev = prevPhaseRef.current;
    const next = driftStatus.phase;

    if (prev === 'idle' && next === 'active') {
      triggerDriftEnterFeedback(feedback);
    }

    prevPhaseRef.current = next;
  }, [
    driftStatus.phase,
    isActive,
    feedback.hapticsEnabled,
    feedback.soundEnabled,
  ]);
}
