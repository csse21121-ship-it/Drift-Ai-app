import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { practiceReasonLabel } from '@/lib/gpsIntegrityMonitor';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import type { SessionGpsIntegritySummary } from '@/types/score';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  integrity: SessionGpsIntegritySummary;
  sessionDurationMs: number;
};

function formatElapsed(tMs: number): string {
  const sec = Math.floor(tMs / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function GpsQualityTimeline({ integrity, sessionDurationMs }: Props) {
  const { colors, typography, spacing } = useTheme();
  const { timeline } = integrity;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        labelBar: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        sectionLabel: {
          ...typography.label,
          color: colors.textMuted,
          letterSpacing: 1.2,
          textTransform: 'none',
        },
        body: {
          padding: spacing.md,
          gap: spacing.sm,
        },
        metaRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
        },
        metaChip: {
          paddingHorizontal: spacing.sm,
          paddingVertical: 4,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: colors.border,
        },
        metaText: {
          ...typography.label,
          color: colors.textSecondary,
          textTransform: 'none',
          fontSize: 10,
        },
        timelineTrack: {
          flexDirection: 'row',
          height: 28,
          borderRadius: 4,
          overflow: 'hidden',
          backgroundColor: colors.surfaceElevated,
        },
        segment: {
          minWidth: 2,
        },
        legendRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.md,
          marginTop: spacing.xs,
        },
        legendItem: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        legendSwatch: {
          width: 10,
          height: 10,
          borderRadius: 2,
        },
        legendText: {
          ...typography.label,
          color: colors.textMuted,
          textTransform: 'none',
          fontSize: 10,
        },
        axisRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 4,
        },
        axisText: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 10,
          textTransform: 'none',
        },
        practiceNote: {
          ...typography.label,
          color: colors.amber,
          marginTop: spacing.xs,
          textTransform: 'none',
          fontSize: 10,
        },
      }),
    [colors, typography, spacing],
  );

  if (timeline.length === 0) return null;

  const durationMs = Math.max(sessionDurationMs, timeline[timeline.length - 1]?.tMs ?? 1);

  const qualityColor = (score: number, anomalous: boolean, mocked: boolean): string => {
    if (mocked || anomalous) return colors.recRed;
    if (score >= 75) return colors.neonGreen;
    if (score >= 50) return colors.amber;
    return colors.recRed;
  };

  const segments = timeline.map((point, i) => {
    const nextT = i < timeline.length - 1 ? timeline[i + 1].tMs : durationMs;
    const spanMs = Math.max(nextT - point.tMs, 1);
    const flex = spanMs / durationMs;
    return {
      key: `${point.tMs}-${i}`,
      flex,
      color: qualityColor(point.qualityScore, point.anomalous, point.mocked),
    };
  });

  const reason = practiceReasonLabel(integrity.practiceReason);

  return (
    <TelemetryFrame>
      <View style={styles.labelBar}>
        <Text style={styles.sectionLabel}>GPS QUALITY TIMELINE</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Text style={styles.metaText}>
              サンプル {integrity.totalGpsSamples}
            </Text>
          </View>
          {integrity.anomalySampleCount > 0 ? (
            <View style={styles.metaChip}>
              <Text style={[styles.metaText, { color: colors.recRed }]}>
                異常 {integrity.anomalySampleCount}
              </Text>
            </View>
          ) : null}
          {integrity.mockDetected ? (
            <View style={styles.metaChip}>
              <Text style={[styles.metaText, { color: colors.recRed }]}>
                モック検知
              </Text>
            </View>
          ) : null}
          <View style={styles.metaChip}>
            <Text style={styles.metaText}>
              屋内率 {Math.round(integrity.indoorSampleRate * 100)}%
            </Text>
          </View>
        </View>

        <View style={styles.timelineTrack}>
          {segments.map((seg) => (
            <View
              key={seg.key}
              style={[styles.segment, { flex: seg.flex, backgroundColor: seg.color }]}
            />
          ))}
        </View>
        <View style={styles.axisRow}>
          <Text style={styles.axisText}>0:00</Text>
          <Text style={styles.axisText}>{formatElapsed(durationMs)}</Text>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.neonGreen }]} />
            <Text style={styles.legendText}>良好</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.amber }]} />
            <Text style={styles.legendText}>注意</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.recRed }]} />
            <Text style={styles.legendText}>異常/モック</Text>
          </View>
        </View>

        {integrity.isPracticeMode && reason ? (
          <Text style={styles.practiceNote}>
            練習モード（{reason}）— デイリー・ランキング対象外
          </Text>
        ) : null}
      </View>
    </TelemetryFrame>
  );
}
