/**
 * 追走 Post-Run Merge — 受信ファイルとローカル Chase の自動採点ブリッジ
 */

import { router } from 'expo-router';
import { compareTsuisoRuns } from '@/lib/tsuisoScoring';
import { loadLocalTsuisoSession } from '@/lib/tsuisoLocalSessionStore';
import { parseTsuisoFileFromUri, resolveTsuisoInboundUri } from '@/lib/tsuisoExport';
import type { TsuisoCompareResult } from '@/types/tsuiso';

export type TsuisoPendingCompare = {
  result: TsuisoCompareResult;
};

let pendingCompare: TsuisoPendingCompare | null = null;
const listeners = new Set<(payload: TsuisoPendingCompare) => void>();

export function publishPendingCompare(payload: TsuisoPendingCompare): void {
  pendingCompare = payload;
  for (const listener of listeners) {
    listener(payload);
  }
}

export function consumePendingCompare(): TsuisoPendingCompare | null {
  const current = pendingCompare;
  pendingCompare = null;
  return current;
}

export function subscribePendingCompare(
  listener: (payload: TsuisoPendingCompare) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type InboundMergeResult =
  | { status: 'auto_scored' }
  | { status: 'no_chase_session' }
  | { status: 'invalid_file' }
  | { status: 'ignored' }
  | { status: 'sync_failed' };

/**
 * AirDrop / ディープリンクで受信した Lead .tsuiso と
 * ローカル Chase セッションを結合し、リザルトへ誘導
 */
export async function handleTsuisoInboundUri(url: string): Promise<InboundMergeResult> {
  const fileUri = resolveTsuisoInboundUri(url);
  if (!fileUri) return { status: 'ignored' };

  const lead = await parseTsuisoFileFromUri(fileUri);
  if (!lead || lead.role !== 'lead') {
    return { status: 'invalid_file' };
  }

  const chaseSession = await loadLocalTsuisoSession('chase');
  if (!chaseSession) {
    return { status: 'no_chase_session' };
  }

  const compared = compareTsuisoRuns(lead, chaseSession.run);
  if (compared.score.alignedSampleCount < 5) {
    return { status: 'sync_failed' };
  }
  if (!compared.score.isValid) {
    return { status: 'invalid_run' };
  }

  publishPendingCompare({ result: compared });
  router.push('/tsuiso');
  return { status: 'auto_scored' };
}
