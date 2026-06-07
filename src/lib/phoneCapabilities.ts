/**
 * プローブ結果 → LoggerCapabilities（スマホ単体用）
 */

import {
  formatPhoneProfileSummary,
  phonePerformanceTierLabel,
  phonePerformanceTierLabelJa,
} from '@/lib/phoneProbeGrade';
import type { PhoneSensorProbeResult } from '@/types/phoneSensor';
import type { LoggerCapabilities } from '@/types/logger';
import { PHONE_CAPABILITIES } from '@/types/logger';

function resolvePhoneAccuracyGrade(
  probe: PhoneSensorProbeResult,
): LoggerCapabilities['accuracyGrade'] {
  switch (probe.phonePerformanceTier) {
    case 'phone-high':
      return 'medium';
    case 'phone-standard':
      return 'medium';
    case 'phone-low':
    default:
      return 'low';
  }
}

/** プローブ結果からスマホ用 LoggerCapabilities を生成 */
export function buildPhoneCapabilitiesFromProbe(
  probe: PhoneSensorProbeResult,
): LoggerCapabilities {
  if (!probe.motionAvailable && !probe.locationGranted) {
    return { ...PHONE_CAPABILITIES };
  }

  const accuracyGrade = resolvePhoneAccuracyGrade(probe);
  const motionHz = probe.motionAvailable
    ? Math.max(probe.motionSampleRateHz, 1)
    : PHONE_CAPABILITIES.gSampleRateHz;
  const gpsHz = probe.locationGranted
    ? (probe.gpsSampleRateHz > 0
        ? probe.gpsSampleRateHz
        : PHONE_CAPABILITIES.gpsSampleRateHz)
    : PHONE_CAPABILITIES.gpsSampleRateHz;

  const hasReliableGpsSpeed =
    probe.locationGranted &&
    probe.avgGpsAccuracyM != null &&
    probe.avgGpsAccuracyM <= 15 &&
    gpsHz >= 1;

  return {
    tier: 'phone',
    hasHighFidelityG: probe.phonePerformanceTier === 'phone-high',
    hasDirectSlipAngle: false,
    hasWheelSpeed: hasReliableGpsSpeed,
    hasHighRateGps: gpsHz >= 4,
    gSampleRateHz: motionHz,
    gpsSampleRateHz: gpsHz,
    accuracyGrade,
    phonePerformanceTier: probe.phonePerformanceTier,
  };
}

/** UI 表示用 — 端末プロファイルの説明 */
export function describePhoneCapabilities(
  probe: PhoneSensorProbeResult,
  caps: LoggerCapabilities,
): string[] {
  const lines: string[] = [];

  lines.push(
    `現在の端末プロファイル: ${formatPhoneProfileSummary(probe)}`,
    `性能区分: ${phonePerformanceTierLabelJa(probe.phonePerformanceTier)} (${phonePerformanceTierLabel(probe.phonePerformanceTier)})`,
  );

  if (probe.motionAvailable) {
    lines.push(
      `モーション ${caps.gSampleRateHz} Hz（安定 ${probe.motionStableIntervalMs} ms · ジッタ ±${probe.motionJitterMs.toFixed(1)} ms）`,
    );
    if (probe.motionStageResults.length > 0) {
      const passed = probe.motionStageResults.filter((s) => s.stable);
      const maxStage = passed[passed.length - 1];
      if (maxStage) {
        lines.push(
          `限界テスト: ${maxStage.requestedIntervalMs} ms まで安定（${maxStage.effectiveHz} Hz 実効）`,
        );
      }
    }
  } else {
    lines.push('モーションセンサー: 利用不可');
  }

  if (probe.locationGranted) {
    const acc =
      probe.avgGpsAccuracyM != null
        ? ` · 精度 ±${probe.avgGpsAccuracyM.toFixed(0)} m`
        : ' · 精度未計測';
    const jitter =
      probe.gpsJitterMs != null
        ? ` · ジッタ ±${probe.gpsJitterMs.toFixed(0)} ms`
        : '';
    lines.push(`GPS ${caps.gpsSampleRateHz} Hz${acc}${jitter}`);
    if (probe.gpsAggressiveHz != null) {
      lines.push(
        `GPS アグレッシブ ${probe.gpsAggressiveIntervalMs} ms → ${probe.gpsAggressiveHz} Hz`,
      );
    }
  } else {
    lines.push('GPS: 権限なし（固定推定値）');
  }

  if (probe.gpsOutdoorTestRecommended) {
    lines.push('⚠ GPS 高精度テストは屋外での実行を推奨します');
  }

  switch (probe.phonePerformanceTier) {
    case 'phone-high':
      lines.push('現車セッティング: タイトカルマン · ジャイロ優先 · 採点厳密');
      break;
    case 'phone-standard':
      lines.push('現車セッティング: 標準スムージング · GPS補正中程度');
      break;
    case 'phone-low':
      lines.push('現車セッティング: 強スムージング · 採点緩和 · ノイズ誤減点防止');
      break;
  }

  return lines;
}
