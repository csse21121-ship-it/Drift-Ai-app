/**
 * センサープローブ — 間隔・ジッタ統計
 */

export type IntervalStats = {
  sampleCount: number;
  medianIntervalMs: number | null;
  meanIntervalMs: number | null;
  jitterMs: number;
  effectiveHz: number;
  deliveryRatio: number;
};

export function interArrivalDeltas(timestamps: number[]): number[] {
  const deltas: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const delta = timestamps[i] - timestamps[i - 1];
    if (delta > 0) deltas.push(delta);
  }
  return deltas;
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function computeIntervalStats(
  timestamps: number[],
  requestedIntervalMs: number,
  durationMs: number,
): IntervalStats {
  const deltas = interArrivalDeltas(timestamps);
  const sampleCount = timestamps.length;
  const expectedSamples = Math.max(
    1,
    Math.floor(durationMs / requestedIntervalMs),
  );
  const deliveryRatio = sampleCount / expectedSamples;
  const medianIntervalMs = median(deltas);
  const meanIntervalMs =
    deltas.length > 0
      ? deltas.reduce((sum, v) => sum + v, 0) / deltas.length
      : null;
  const jitterMs = stdDev(deltas);
  const effectiveHz =
    medianIntervalMs != null && medianIntervalMs > 0
      ? Math.round(1000 / medianIntervalMs)
      : 0;

  return {
    sampleCount,
    medianIntervalMs,
    meanIntervalMs,
    jitterMs,
    effectiveHz,
    deliveryRatio,
  };
}

export function isStableIntervalStats(
  stats: IntervalStats,
  requestedIntervalMs: number,
  options?: {
    minDeliveryRatio?: number;
    maxJitterRatio?: number;
    maxMedianSlack?: number;
    minSamples?: number;
  },
): boolean {
  const minDeliveryRatio = options?.minDeliveryRatio ?? 0.72;
  const maxJitterRatio = options?.maxJitterRatio ?? 0.38;
  const maxMedianSlack = options?.maxMedianSlack ?? 1.65;
  const minSamples = options?.minSamples ?? 6;

  if (stats.sampleCount < minSamples) return false;
  if (stats.deliveryRatio < minDeliveryRatio) return false;
  if (stats.medianIntervalMs == null) return false;
  if (stats.medianIntervalMs > requestedIntervalMs * maxMedianSlack) {
    return false;
  }
  if (stats.jitterMs / stats.medianIntervalMs > maxJitterRatio) return false;
  return true;
}
