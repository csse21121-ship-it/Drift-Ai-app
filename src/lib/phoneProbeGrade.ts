/**
 * プローブ結果 — 端末性能ティア判定
 *
 * 段階テストで得た「最大安定 Hz」と「ジッタ」から
 * phone-high / phone-standard / phone-low を自動判定する。
 */

import type {
  PhonePerformanceTier,
  PhoneSensorProbeResult,
} from '@/types/phoneSensor';

const TIER_LABELS: Record<PhonePerformanceTier, string> = {
  'phone-high': 'HIGH',
  'phone-standard': 'STANDARD',
  'phone-low': 'LOW',
};

const TIER_LABELS_JA: Record<PhonePerformanceTier, string> = {
  'phone-high': '高性能',
  'phone-standard': '標準',
  'phone-low': 'エントリー',
};

export function phonePerformanceTierLabel(tier: PhonePerformanceTier): string {
  return TIER_LABELS[tier];
}

export function phonePerformanceTierLabelJa(tier: PhonePerformanceTier): string {
  return TIER_LABELS_JA[tier];
}

/** 設定画面用 — 端末プロファイル一行サマリー */
export function formatPhoneProfileSummary(probe: PhoneSensorProbeResult): string {
  const tier = probe.phonePerformanceTier;
  const hz = probe.motionAvailable ? probe.motionSampleRateHz : 0;
  const jitter = probe.motionJitterMs.toFixed(1);

  if (!probe.motionAvailable) {
    return `${tier}（モーションセンサー利用不可）`;
  }

  return `${tier}（${hz}Hz 計測可能 · ジッタ ±${jitter} ms）`;
}

/** ティア判定の根拠（設定 UI 用） */
export function describePhoneTierRationale(
  probe: PhoneSensorProbeResult,
): string[] {
  const lines: string[] = [];

  if (!probe.motionAvailable) {
    lines.push('モーションセンサー不可 → phone-low に分類');
    return lines;
  }

  const hz = probe.motionSampleRateHz;
  const jitter = probe.motionJitterMs;
  const interval = probe.motionStableIntervalMs;

  if (hz >= 55 && jitter <= 6) {
    lines.push(`安定 ${interval} ms 間隔 · ${hz} Hz · ジッタ ±${jitter.toFixed(1)} ms → 60Hz クラス（HIGH）`);
  } else if (hz >= 35 && jitter <= 10) {
    lines.push(`安定 ${interval} ms · ${hz} Hz · ジッタ ±${jitter.toFixed(1)} ms → 40Hz クラス（STANDARD）`);
  } else if (hz >= 28 && jitter <= 12) {
    lines.push(`安定 ${interval} ms · ${hz} Hz · ジッタ ±${jitter.toFixed(1)} ms → 標準下限（STANDARD）`);
  } else {
    lines.push(`安定 ${interval} ms · ${hz} Hz · ジッタ ±${jitter.toFixed(1)} ms → 低レート端末（LOW）`);
  }

  if (probe.locationGranted && probe.gpsSampleRateHz > 0) {
    const gpsJ = probe.gpsJitterMs ?? 0;
    lines.push(
      `GPS ${probe.gpsSampleRateHz} Hz · ジッタ ±${gpsJ.toFixed(0)} ms` +
        (probe.avgGpsAccuracyM != null
          ? ` · 精度 ±${probe.avgGpsAccuracyM.toFixed(0)} m`
          : ''),
    );
  }

  return lines;
}

/** 安定最大 Hz とジッタから端末ティアを判定 */
export function classifyPhonePerformanceTier(
  probe: Pick<
    PhoneSensorProbeResult,
    | 'motionAvailable'
    | 'motionSampleRateHz'
    | 'motionStableIntervalMs'
    | 'motionJitterMs'
    | 'locationGranted'
    | 'gpsSampleRateHz'
    | 'gpsJitterMs'
    | 'avgGpsAccuracyM'
  >,
): PhonePerformanceTier {
  if (!probe.motionAvailable) return 'phone-low';

  const motionHz = probe.motionSampleRateHz;
  const motionJitter = probe.motionJitterMs;
  const intervalMs = probe.motionStableIntervalMs;

  let tier: PhonePerformanceTier;

  if (
    (motionHz >= 55 && motionJitter <= 6) ||
    (intervalMs <= 18 && motionJitter <= 5)
  ) {
    tier = 'phone-high';
  } else if (
    (motionHz >= 35 && motionJitter <= 10) ||
    (motionHz >= 28 && intervalMs <= 36 && motionJitter <= 12)
  ) {
    tier = 'phone-standard';
  } else if (motionHz >= 18 && motionJitter <= 14) {
    tier = 'phone-low';
  } else {
    tier = 'phone-low';
  }

  if (tier === 'phone-high' && probe.locationGranted) {
    const gpsJitter = probe.gpsJitterMs ?? 0;
    const acc = probe.avgGpsAccuracyM;
    if (
      probe.gpsSampleRateHz < 2 ||
      gpsJitter > 250 ||
      (acc != null && acc > 30)
    ) {
      tier = 'phone-standard';
    }
  }

  return tier;
}

export function normalizePhoneProbeResult(
  raw: Partial<PhoneSensorProbeResult>,
): PhoneSensorProbeResult {
  const merged: PhoneSensorProbeResult = {
    motionAvailable: raw.motionAvailable ?? true,
    motionSampleRateHz: raw.motionSampleRateHz ?? 20,
    motionStableIntervalMs: raw.motionStableIntervalMs ?? 50,
    motionJitterMs: raw.motionJitterMs ?? 0,
    motionStageResults: raw.motionStageResults ?? [],
    locationGranted: raw.locationGranted ?? false,
    gpsSampleRateHz: raw.gpsSampleRateHz ?? 0,
    gpsBaselineIntervalMs: raw.gpsBaselineIntervalMs ?? 500,
    gpsAggressiveIntervalMs: raw.gpsAggressiveIntervalMs ?? null,
    gpsAggressiveHz: raw.gpsAggressiveHz ?? null,
    gpsJitterMs: raw.gpsJitterMs ?? null,
    avgGpsAccuracyM: raw.avgGpsAccuracyM ?? null,
    gpsOutdoorTestRecommended: raw.gpsOutdoorTestRecommended ?? false,
    phonePerformanceTier:
      raw.phonePerformanceTier ??
      classifyPhonePerformanceTier({
        motionAvailable: raw.motionAvailable ?? true,
        motionSampleRateHz: raw.motionSampleRateHz ?? 20,
        motionStableIntervalMs: raw.motionStableIntervalMs ?? 50,
        motionJitterMs: raw.motionJitterMs ?? 0,
        locationGranted: raw.locationGranted ?? false,
        gpsSampleRateHz: raw.gpsSampleRateHz ?? 0,
        gpsJitterMs: raw.gpsJitterMs ?? null,
        avgGpsAccuracyM: raw.avgGpsAccuracyM ?? null,
      }),
    probedAt: raw.probedAt ?? 0,
  };

  if (!raw.phonePerformanceTier) {
    merged.phonePerformanceTier = classifyPhonePerformanceTier(merged);
  }

  return merged;
}
