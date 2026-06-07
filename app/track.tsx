import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { router, useLocalSearchParams } from 'expo-router';
import { NeonButton } from '@/components/ui/NeonButton';
import { DriftIndicator } from '@/components/telemetry/DriftIndicator';
import { GMeter } from '@/components/telemetry/GMeter';
import { GpsPanel } from '@/components/telemetry/GpsPanel';
import { GyroReadout } from '@/components/telemetry/GyroReadout';
import { Header } from '@/components/telemetry/Header';
import { MountStabilityBanner } from '@/components/telemetry/MountStabilityBanner';
import { StartSequenceOverlay } from '@/components/telemetry/StartSequenceOverlay';
import { MountSetupOnboarding } from '@/components/onboarding/MountSetupOnboarding';
import { LiveScoreBanner } from '@/components/telemetry/LiveScoreBanner';
import { LiveScoreStrip } from '@/components/telemetry/LiveScoreStrip';
import { LoggerStatusBanner } from '@/components/logger/LoggerStatusBanner';
import { QualityIndicator } from '@/components/telemetry/QualityIndicator';
import { GpsIntegrityBanner } from '@/components/telemetry/GpsIntegrityBanner';
import { SurfaceConditionToggle } from '@/components/settings/SurfaceConditionToggle';
import { useSettings } from '@/contexts/SettingsContext';
import { useSessionLogUpload } from '@/contexts/SessionLogUploadContext';
import { useLogger } from '@/contexts/LoggerContext';
import { useDriftDetection } from '@/hooks/useDriftDetection';
import { useDriftFeedback } from '@/hooks/useDriftFeedback';
import { useGpsTrackRecord } from '@/hooks/useGpsTrackRecord';
import { useLineEvalTrackRecord } from '@/hooks/useLineEvalTrackRecord';
import { useTelemetryLogRecord } from '@/hooks/useTelemetryLogRecord';
import { useLiveScore } from '@/hooks/useLiveScore';
import { useSessionPreflight } from '@/hooks/useSessionPreflight';
import { useCalibration } from '@/hooks/useCalibration';
import { isMountSetupComplete } from '@/lib/onboardingStore';
import { useStopBgmOnFocus } from '@/hooks/useStopBgmOnFocus';
import { useMergedTelemetry } from '@/hooks/useMergedTelemetry';
import { loadCourses, updateCourseBestScore, updateCourseLearnedIdealLines, updateCourseZoneBestRecords } from '@/lib/courseStore';
import {
  detectCourseType,
  detectScoringProfile,
  distanceMeters,
  isInScoringZone,
  isNearPoint,
  isPointInPolygon,
} from '@/lib/geofence';
import { scoreSession, enrichZoneCrossingsWithScoring, finalizeZoneCrossings } from '@/lib/scoring';
import { computeZoneTraceSummary } from '@/lib/zoneTrace';
import { computeLineEvalSummary } from '@/lib/idealLineEval';
import { learnIdealLinesFromTrack } from '@/lib/idealLineLearn';
import { openCourseEditor, openCourses, openPitLane } from '@/lib/navigation';
import { saveSession } from '@/lib/sessionStore';
import type { Course, CourseType, ScoringProfile, ScoringZone } from '@/types/course';
import type { LapSummary, SessionResult, ZoneBestUpdate, ZoneCrossing } from '@/types/score';

// ────────────────────────────────────────────────────────────────
// 定数
// ────────────────────────────────────────────────────────────────
const LS_LEFT_WIDTH = 204;
const LS_METER_SIZE = 160;
const AUTO_START_COUNTDOWN = 5; // 秒

// ────────────────────────────────────────────────────────────────
// 距離フォーマット
// ────────────────────────────────────────────────────────────────
function formatDist(m: number): string {
  if (!isFinite(m)) return '— km';
  if (m < 50) return 'HERE';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// ────────────────────────────────────────────────────────────────
// ピットボード — 近くのコース一覧
// ────────────────────────────────────────────────────────────────
type CourseWithDist = Course & { dist: number };

function PitBoardPanel({
  courses,
  gps,
  compact = false,
  selectedId,
  onSelect,
  onCreate,
}: {
  courses: Course[];
  gps: { latitude: number; longitude: number } | null;
  /** Landscape フッター用コンパクト表示 */
  compact?: boolean;
  /** 選択中コース（ホーム / URL からの事前選択） */
  selectedId?: string | null;
  onSelect: (course: Course) => void;
  onCreate: () => void;
}) {
  const pbStyles = usePbStyles();
  const { colors } = useTheme();
  const sorted: CourseWithDist[] = courses
    .map((c) => ({
      ...c,
      dist: gps
        ? distanceMeters(
            { latitude: gps.latitude, longitude: gps.longitude },
            c.startPoint,
          )
        : Infinity,
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 4);

  if (compact) {
    // Landscape: 横一列にコース名 + "+" ボタンのみ
    return (
      <View style={pbStyles.compactRow}>
        <Text style={pbStyles.compactLabel}>COURSES</Text>
        {sorted.slice(0, 2).map((c) => (
          <GamePressable
            key={c.id}
            onPress={() => onSelect(c)}
            style={({ pressed }) => [
              pbStyles.compactChip,
              c.id === selectedId && pbStyles.compactChipSelected,
              pressed && { opacity: 0.6 },
            ]}
          >
            <View
              style={[
                pbStyles.compactDot,
                c.dist < c.startRadius && pbStyles.compactDotHere,
              ]}
            />
            <Text style={pbStyles.compactChipText} numberOfLines={1}>
              {c.name}
            </Text>
            <Text style={pbStyles.compactDist}>{formatDist(c.dist)}</Text>
          </GamePressable>
        ))}
        <GamePressable
          onPress={onCreate}
          style={({ pressed }) => [pbStyles.compactCreateBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={pbStyles.compactCreateText}>＋</Text>
        </GamePressable>
      </View>
    );
  }

  return (
    <View style={pbStyles.panel}>
      {/* ヘッダー */}
      <View style={pbStyles.header}>
        <View style={pbStyles.headerLeft}>
          <Text style={pbStyles.headerIcon}>◈</Text>
          <Text style={pbStyles.headerLabel}>PIT BOARD</Text>
          <Text style={pbStyles.headerSub}> NEARBY COURSES</Text>
        </View>
        <GamePressable
          onPress={onCreate}
          style={({ pressed }) => [pbStyles.createBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={pbStyles.createBtnText}>＋ CREATE</Text>
        </GamePressable>
      </View>

      {/* コース一覧 */}
      {sorted.length === 0 ? (
        <GamePressable
          onPress={onCreate}
          style={({ pressed }) => [pbStyles.emptyRow, pressed && { opacity: 0.7 }]}
        >
          <Text style={pbStyles.emptyIcon}>◈</Text>
          <View>
            <Text style={pbStyles.emptyTitle}>コースがまだありません</Text>
            <Text style={pbStyles.emptySub}>タップしてコースを作成する</Text>
          </View>
        </GamePressable>
      ) : (
        sorted.map((c) => {
          const isHere = c.dist < c.startRadius;
          const hasBest = c.bestScore !== undefined;
          const isSelected = c.id === selectedId;
          return (
            <GamePressable
              key={c.id}
              onPress={() => onSelect(c)}
              style={({ pressed }) => [
                pbStyles.row,
                isSelected && pbStyles.rowSelected,
                pressed && { backgroundColor: colors.neonGreen + '08' },
              ]}
            >
              <View style={[pbStyles.rowDot, isHere && pbStyles.rowDotHere]} />
              <View style={pbStyles.rowMain}>
                <Text style={[pbStyles.rowName, isHere && pbStyles.rowNameHere]} numberOfLines={1}>
                  {c.name}
                </Text>
                {c.scoringZones.length > 0 && (
                  <Text style={pbStyles.rowZones}>
                    {c.scoringZones.length} ZONE{c.scoringZones.length > 1 ? 'S' : ''}
                  </Text>
                )}
              </View>
              <Text style={[pbStyles.rowDist, isHere && pbStyles.rowDistHere]}>
                {formatDist(c.dist)}
              </Text>
              {hasBest ? (
                <Text style={pbStyles.rowBest}>
                  {c.bestScore!.toLocaleString()} pt
                </Text>
              ) : (
                <Text style={pbStyles.rowNoRecord}>NO RECORD</Text>
              )}
              <Text style={pbStyles.rowArrow}>▶</Text>
            </GamePressable>
          );
        })
      )}

      {courses.length > 4 && (
        <GamePressable
          onPress={() => openCourses()}
          style={({ pressed }) => [pbStyles.viewAllRow, pressed && { opacity: 0.6 }]}
        >
          <Text style={pbStyles.viewAllText}>全 {courses.length} コースを見る →</Text>
        </GamePressable>
      )}
    </View>
  );
}

function createPbStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  // ── フルパネル ──
  panel: {
    backgroundColor: colors.pitBoard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerIcon: {
    color: colors.neonGreen,
    fontSize: 12,
  },
  headerLabel: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 10,
  },
  headerSub: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neonGreen,
    borderRadius: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.neonGreen + '12',
  },
  createBtnText: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 9,
    letterSpacing: 1,
  },

  // 空の状態
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  emptyIcon: {
    color: colors.textMuted,
    fontSize: 24,
  },
  emptyTitle: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
  },
  emptySub: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    marginTop: 2,
    textTransform: 'none',
    letterSpacing: 0.5,
  },

  // コース行
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  rowSelected: {
    backgroundColor: colors.neonGreen + '10',
    borderLeftWidth: 3,
    borderLeftColor: colors.neonGreen,
  },
  rowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
    flexShrink: 0,
  },
  rowDotHere: {
    backgroundColor: colors.neonGreen,
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  rowMain: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  rowName: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  rowNameHere: {
    color: colors.neonGreen,
  },
  rowZones: {
    ...typography.label,
    color: colors.amber + 'AA',
    fontSize: 7,
  },
  rowDist: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 11,
    minWidth: 48,
    textAlign: 'right',
  },
  rowDistHere: {
    color: colors.neonGreen,
    fontWeight: '700',
  },
  rowBest: {
    ...typography.mono,
    color: colors.neonGreenDim,
    fontSize: 10,
    minWidth: 72,
    textAlign: 'right',
  },
  rowNoRecord: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
    minWidth: 72,
    textAlign: 'right',
  },
  rowArrow: {
    color: colors.textMuted,
    fontSize: 10,
    marginLeft: 2,
  },

  viewAllRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  viewAllText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.5,
  },

  // ── Landscape コンパクト ──
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  compactLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
    marginRight: 2,
  },
  compactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    backgroundColor: colors.pitBoard,
    maxWidth: 120,
  },
  compactChipSelected: {
    borderColor: colors.neonGreen + '99',
    backgroundColor: colors.neonGreen + '14',
  },
  compactDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
  },
  compactDotHere: {
    backgroundColor: colors.neonGreen,
  },
  compactChipText: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 8,
    flex: 1,
  },
  compactDist: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
  },
  compactCreateBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.neonGreen,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neonGreen + '12',
    marginLeft: 2,
  },
  compactCreateText: {
    color: colors.neonGreen,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
});
}

function usePbStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createPbStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

// ────────────────────────────────────────────────────────────────
// コース検知バナー (自動スタートカウントダウン)
// ────────────────────────────────────────────────────────────────
function CourseDetectedBanner({
  course,
  countdown,
  onStart,
  onDismiss,
  zoneMultiplier,
}: {
  course: Course;
  countdown: number;
  onStart: () => void;
  onDismiss: () => void;
  zoneMultiplier?: number;
}) {
  const bannerStyles = useBannerStyles();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <View style={bannerStyles.container}>
      <View style={bannerStyles.left}>
        <Animated.View style={[bannerStyles.dot, { opacity: pulseAnim }]} />
        <View>
          <Text style={bannerStyles.courseName}>{course.name}</Text>
          <Text style={bannerStyles.sub}>
            スタートゾーン検知 {zoneMultiplier ? `· ×${zoneMultiplier} ZONE` : ''}
          </Text>
        </View>
      </View>
      <View style={bannerStyles.right}>
        <Text style={bannerStyles.countdown}>{countdown}</Text>
        <GamePressable onPress={onStart} style={bannerStyles.startBtn}>
          <Text style={bannerStyles.startBtnText}>START</Text>
        </GamePressable>
        <GamePressable onPress={onDismiss} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }}>
          <Text style={bannerStyles.dismissText}>✕</Text>
        </GamePressable>
      </View>
    </View>
  );
}

function createBannerStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.neonGreen + '18',
    borderBottomWidth: 1,
    borderBottomColor: colors.neonGreen + '55',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neonGreen,
  },
  courseName: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 11,
  },
  sub: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 8,
    letterSpacing: 1,
    textTransform: 'none',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countdown: {
    ...typography.mono,
    color: colors.neonGreen,
    fontSize: 22,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },
  startBtn: {
    backgroundColor: colors.neonGreen,
    borderRadius: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  startBtnText: {
    ...typography.label,
    color: colors.background,
    fontSize: 9,
  },
  dismissText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
}

function useBannerStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createBannerStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

// ────────────────────────────────────────────────────────────────
// アクティブコースバナー (走行中) — 周回/方向 + ゾーンフラッシュ
// ────────────────────────────────────────────────────────────────
function ActiveCourseBanner({
  course, inBoundary, currentZone, zoneHitCount,
  courseType, lapNumber, runDirection, laps,
}: {
  course: Course; inBoundary: boolean; currentZone: ScoringZone | null; zoneHitCount: number;
  courseType: CourseType; lapNumber: number; runDirection: 'forward' | 'reverse'; laps: LapSummary[];
}) {
  const acStyles = useAcStyles();
  const { colors } = useTheme();
  const flashAnim = useRef(new Animated.Value(0)).current;
  const prevZoneId = useRef<string | null>(null);

  useEffect(() => {
    if (currentZone && currentZone.id !== prevZoneId.current) {
      flashAnim.setValue(1);
      Animated.timing(flashAnim, { toValue: 0, duration: 1200, useNativeDriver: false }).start();
    }
    prevZoneId.current = currentZone?.id ?? null;
  }, [currentZone, flashAnim]);

  const flashBg = flashAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['transparent', currentZone?.color ? currentZone.color + '44' : colors.amber + '44'],
  });

  return (
    <Animated.View style={[acStyles.container, !inBoundary && acStyles.containerWarn, { backgroundColor: flashBg }]}>
      {/* 行1: コース名 + ラップ/本数バッジ */}
      <View style={acStyles.row}>
        <Text style={[acStyles.name, !inBoundary && acStyles.nameWarn]} numberOfLines={1}>
          {inBoundary ? '●' : '⚠'} {course.name}
        </Text>
        {courseType === 'circuit' && (
          <View style={acStyles.lapBadge}>
            <Text style={acStyles.lapBadgeText}>LAP {lapNumber}</Text>
          </View>
        )}
        {courseType === 'street' && (
          <View style={[acStyles.lapBadge, { borderColor: colors.amber + '88' }]}>
            <Text style={[acStyles.lapBadgeText, { color: colors.amber }]}>
              RUN {lapNumber} {runDirection === 'reverse' ? '↩' : '→'}
            </Text>
          </View>
        )}
        {!inBoundary && <Text style={acStyles.warnText}>コース外</Text>}
      </View>

      {/* 行2: ゾーン + ヒット数 */}
      <View style={acStyles.row}>
        {currentZone ? (
          <View style={[acStyles.zonePill, { borderColor: currentZone.color }]}>
            <Text style={[acStyles.zonePillText, { color: currentZone.color }]}>
              ◈ {currentZone.name}  ×{currentZone.multiplier}
            </Text>
          </View>
        ) : (
          <Text style={acStyles.outsideZoneText}>ゾーン外</Text>
        )}
        {zoneHitCount > 0 && (
          <View style={acStyles.hitCountBadge}>
            <Text style={acStyles.hitCountText}>{zoneHitCount}HIT</Text>
          </View>
        )}
      </View>

      {/* 行3: 完了済みラップ一覧 */}
      {laps.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={acStyles.lapScroll}>
          {laps.map((lap) => (
            <View key={`${lap.lapNumber}-${lap.direction}`} style={acStyles.lapChip}>
              <Text style={acStyles.lapChipLabel}>
                {courseType === 'street'
                  ? `R${lap.lapNumber}${lap.direction === 'reverse' ? '↩' : '→'}`
                  : `L${lap.lapNumber}`}
              </Text>
              <Text style={acStyles.lapChipPts}>{lap.points.toLocaleString()}pt</Text>
              <Text style={acStyles.lapChipDur}>{(lap.durationMs / 1000).toFixed(0)}s</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </Animated.View>
  );
}

function createAcStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.neonGreen + '33', gap: 3 },
  containerWarn: { borderBottomColor: colors.amber + '55' },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  name: { ...typography.label, color: colors.neonGreenDim, fontSize: 9, flex: 1 },
  nameWarn: { color: colors.amber },
  lapBadge: { borderWidth: 1, borderColor: colors.neonGreen + '88', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  lapBadgeText: { ...typography.mono, color: colors.neonGreen, fontSize: 9, fontWeight: '700' },
  zonePill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  zonePillText: { ...typography.label, fontSize: 8 },
  outsideZoneText: { ...typography.label, color: colors.textMuted, fontSize: 8 },
  hitCountBadge: { backgroundColor: colors.amber + '22', borderWidth: 1, borderColor: colors.amber + '66', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 'auto' },
  hitCountText: { ...typography.mono, color: colors.amber, fontSize: 8, fontWeight: '700' },
  warnText: { ...typography.label, color: colors.amber, fontSize: 8 },
  lapScroll: { maxHeight: 28 },
  lapChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, marginRight: 4 },
  lapChipLabel: { ...typography.label, color: colors.neonGreenDim, fontSize: 8 },
  lapChipPts: { ...typography.mono, color: colors.neonGreen, fontSize: 8, fontWeight: '700' },
  lapChipDur: { ...typography.mono, color: colors.textMuted, fontSize: 8 },
});
}

function useAcStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createAcStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

// ────────────────────────────────────────────────────────────────
// メインスクリーン
// ────────────────────────────────────────────────────────────────
export default function TelemetryScreen() {
  const lsStyles = useLsStyles();
  const styles = useStyles();
  const { colors } = useTheme();
  const { settings, setSurfaceCondition } = useSettings();
  const { uploadSessionLog } = useSessionLogUpload();
  const { device, isConnected } = useLogger();
  useStopBgmOnFocus();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { courseId: courseIdParam } = useLocalSearchParams<{ courseId?: string | string[] }>();
  const initialCourseId =
    typeof courseIdParam === 'string' ? courseIdParam : courseIdParam?.[0];

  const sessionStartRef = useRef<number>(0);
  const [gpsSessionStart, setGpsSessionStart] = useState(0);
  const maxSpeedRef = useRef<number>(0);

  // ── コース管理 ──
  const [courses, setCourses] = useState<Course[]>([]);
  const [nearCourse, setNearCourse] = useState<Course | null>(null);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [autoStartCountdown, setAutoStartCountdown] = useState(AUTO_START_COUNTDOWN);
  const [showMountSetup, setShowMountSetup] = useState(false);
  const { calibration } = useCalibration();

  // ── アクティブコースのスコアリングプロファイル (AI 判定 or 保存済み) ──
  const scoringProfile = useMemo<ScoringProfile | undefined>(() => {
    if (!activeCourse) return undefined;
    return activeCourse.scoringProfile ?? detectScoringProfile(activeCourse);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCourse?.id]);

  const {
    isActive: _sensorsOn,
    motion,
    gps,
    error,
    toggle,
    mountOrientation,
    mountOrientationUnstable,
    mountOrientationAuto,
    slipAngleDeg,
    effectiveThresholds,
    effectiveScoringProfile,
    telemetrySource,
    gpsMonitor,
    activeCapabilities,
    getRuntimeEffectiveProfile,
    getSlipFusionConsistency,
    getSessionQualitySummary,
    getGpsIntegritySummary,
    telemetryQuality,
    gpsIntegrity,
    grade,
    logger,
  } = useMergedTelemetry({
    mountOverride: settings.mountOverride,
    baseScoringProfile: scoringProfile,
    baseThresholds: settings.thresholds,
  });

  const resetGpsTrackRef = useRef<() => void>(() => undefined);
  const resetLineEvalTrackRef = useRef<() => void>(() => undefined);
  const resetTelemetryLogRef = useRef<() => void>(() => undefined);

  const beginRecording = useCallback(() => {
    const t = Date.now();
    sessionStartRef.current = t;
    lapStartTimeRef.current = t;
    lapStartEventsCountRef.current = 0;
    lapCooldownRef.current = 0;
    maxSpeedRef.current = 0;
    setGpsSessionStart(t);
    resetGpsTrackRef.current();
    resetLineEvalTrackRef.current();
    resetTelemetryLogRef.current();
    setZoneCrossings([]);
    prevZoneRef.current = null;
    setZoneHitCount(0);
    setCompletedLaps([]);
    setLapNumber(1);
    setRunDirection('forward');
  }, []);

  const {
    isPreflight,
    isRecording,
    metersLive,
    sequencePhase,
    systemLines,
    countdown,
    startPreflight,
    cancelPreflight,
    finishToIdle,
  } = useSessionPreflight({
    motion,
    gps,
    hasLogger: logger.isConnected,
    feedback: settings.feedback,
    mountOverride: settings.mountOverride,
    calibration,
    onGo: beginRecording,
  });

  const meterMode = isPreflight ? 'preflight' : isRecording ? 'live' : 'standby';
  const headerStatus = isRecording ? 'recording' : isPreflight ? 'arming' : 'idle';
  const sessionIdle = !isRecording && !isPreflight;

  const { status: driftStatus } = useDriftDetection({
    motion,
    gps,
    isActive: isRecording,
    slipAngleDeg,
    thresholds: effectiveThresholds,
    surfaceCondition: settings.surfaceCondition,
  });

  useDriftFeedback(driftStatus, isRecording, settings.feedback);

  const { reset: resetGpsTrack, getTrack: getGpsTrack } = useGpsTrackRecord(
    isRecording,
    gps,
    gpsSessionStart,
  );
  const { reset: resetLineEvalTrack, getTrack: getLineEvalTrack } = useLineEvalTrackRecord(
    isRecording,
    gps,
    logger.lastSample,
    activeCapabilities,
    gpsSessionStart,
  );
  const { reset: resetTelemetryLog, getLog: getTelemetryLog } = useTelemetryLogRecord(
    isRecording,
    motion,
    gps,
    gpsSessionStart,
    driftStatus,
  );
  resetGpsTrackRef.current = resetGpsTrack;
  resetLineEvalTrackRef.current = resetLineEvalTrack;
  resetTelemetryLogRef.current = resetTelemetryLog;

  // ── 周回 / 方向管理 ──
  const [courseType, setCourseType]         = useState<CourseType>('unknown');
  const [lapNumber, setLapNumber]           = useState(1);
  const [runDirection, setRunDirection]     = useState<'forward' | 'reverse'>('forward');
  const [completedLaps, setCompletedLaps]   = useState<LapSummary[]>([]);
  const lapStartTimeRef                     = useRef<number>(0);
  const lapStartEventsCountRef              = useRef<number>(0);   // ラップ開始時点のドリフト件数
  /** スタートゾーンのクールダウン（連続検知防止: 10秒） */
  const lapCooldownRef                      = useRef<number>(0);
  /** ストリート: 現在どちらの端がスタートか */
  const streetStartRef                      = useRef<'original' | 'reversed'>('original');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedCourseIdRef = useRef<string | null>(null);

  // コースを起動時にロード
  useEffect(() => {
    loadCourses().then(setCourses);
  }, []);

  // ホーム / コース一覧から courseId 指定で開いた場合は Pit Board で事前選択
  useEffect(() => {
    if (!initialCourseId || courses.length === 0) return;
    const match = courses.find((c) => c.id === initialCourseId);
    if (match) {
      setActiveCourse(match);
      dismissedCourseIdRef.current = match.id;
    }
  }, [initialCourseId, courses]);

  const handlePitBoardSelect = useCallback((course: Course) => {
    setActiveCourse((prev) => {
      if (prev?.id === course.id) {
        dismissedCourseIdRef.current = null;
        return null;
      }
      dismissedCourseIdRef.current = course.id;
      return course;
    });
  }, []);

  // ── アクティブコース設定時にコースタイプを AI 判定 ──
  useEffect(() => {
    if (!activeCourse) { setCourseType('unknown'); return; }
    const ct = activeCourse.courseType ?? detectCourseType(activeCourse);
    setCourseType(ct);
    setLapNumber(1);
    setRunDirection('forward');
    setCompletedLaps([]);
    lapStartTimeRef.current    = Date.now();
    lapStartEventsCountRef.current = 0;
    lapCooldownRef.current     = 0;
    streetStartRef.current     = 'original';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCourse?.id]);

  // ── ラップ / 折り返し検知 ──
  useEffect(() => {
    if (!isRecording || !gps || !activeCourse) return;
    const pt   = { latitude: gps.latitude, longitude: gps.longitude };
    const now  = Date.now();

    // クールダウン中はスキップ（最後のラップ検知から 10 秒以内）
    if (now - lapCooldownRef.current < 10_000) return;

    // ── サーキット: スタートゾーン通過でラップカウント ──
    if (courseType === 'circuit') {
      // 1周目はまだカウントしない（開始直後に即カウントを防ぐ）
      const lapElapsed = now - lapStartTimeRef.current;
      if (lapElapsed < 15_000) return;  // 15秒未満は無視

      if (isNearPoint(pt, activeCourse.startPoint, activeCourse.startRadius)) {
        const lapDriftCount = driftStatus.events.length - lapStartEventsCountRef.current;

        const lap: LapSummary = {
          lapNumber,
          direction: 'forward',
          startedAtMs: lapStartTimeRef.current - sessionStartRef.current,
          durationMs:  lapElapsed,
          points:      0,  // 本セッション終了時に確定
          driftCount:  lapDriftCount,
          bestDriftMs: 0,
        };
        setCompletedLaps((prev) => [...prev, lap]);
        setLapNumber((n) => n + 1);
        lapStartTimeRef.current    = now;
        lapStartEventsCountRef.current = driftStatus.events.length;
        lapCooldownRef.current     = now;
      }
    }

    // ── ストリート: ゴール到達で折り返し準備 ──
    if (courseType === 'street' && activeCourse.endPoint) {
      const effectiveGoal = streetStartRef.current === 'original'
        ? activeCourse.endPoint
        : activeCourse.startPoint;
      const effectiveGoalRadius = streetStartRef.current === 'original'
        ? (activeCourse.endRadius ?? activeCourse.startRadius)
        : activeCourse.startRadius;

      if (isNearPoint(pt, effectiveGoal, effectiveGoalRadius)) {
        const lapElapsed = now - lapStartTimeRef.current;
        if (lapElapsed < 5_000) return;

        const lap: LapSummary = {
          lapNumber,
          direction: runDirection,
          startedAtMs: lapStartTimeRef.current - sessionStartRef.current,
          durationMs:  lapElapsed,
          points:      0,
          driftCount:  driftStatus.events.length - lapStartEventsCountRef.current,
          bestDriftMs: 0,
        };
        setCompletedLaps((prev) => [...prev, lap]);

        // 折り返し
        const nextDir: 'forward' | 'reverse' = runDirection === 'forward' ? 'reverse' : 'forward';
        setRunDirection(nextDir);
        setLapNumber((n) => n + 1);
        streetStartRef.current = streetStartRef.current === 'original' ? 'reversed' : 'original';
        lapStartTimeRef.current    = now;
        lapStartEventsCountRef.current = driftStatus.events.length;
        lapCooldownRef.current     = now;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps, isRecording, courseType]);

  // ── ゾーン検知 ──
  const currentZone = useMemo<ScoringZone | null>(() => {
    if (!activeCourse || !gps) return null;
    const pt = { latitude: gps.latitude, longitude: gps.longitude };
    for (const zone of activeCourse.scoringZones) {
      if (isInScoringZone(pt, zone)) return zone;
    }
    return null;
  }, [activeCourse, gps]);

  const currentZoneMultiplier = currentZone?.multiplier;

  // ── ゾーン入退場イベント追跡 ──
  const prevZoneRef      = useRef<ScoringZone | null>(null);
  const zoneEnteredAtRef = useRef<number>(0);
  const [zoneCrossings, setZoneCrossings] = useState<ZoneCrossing[]>([]);
  const [zoneHitCount, setZoneHitCount] = useState(0);

  useEffect(() => {
    const prev = prevZoneRef.current;
    const curr = currentZone;

    // 退場: 前回のゾーンに滞在時間を記録
    if (prev && (!curr || curr.id !== prev.id) && isRecording) {
      const durationMs = Date.now() - zoneEnteredAtRef.current;
      setZoneCrossings((crossings) =>
        crossings.map((c) =>
          c.zoneId === prev.id && c.durationMs === undefined
            ? { ...c, durationMs }
            : c,
        ),
      );
    }

    // 入場: 新しいゾーンを記録
    if (curr && (!prev || curr.id !== prev.id) && isRecording) {
      zoneEnteredAtRef.current = Date.now();
      setZoneCrossings((crossings) => [
        ...crossings,
        {
          zoneId:      curr.id,
          zoneName:    curr.name,
          multiplier:  curr.multiplier,
          enteredAtMs: Date.now() - sessionStartRef.current,
        },
      ]);
      setZoneHitCount((n) => n + 1);
    }

    prevZoneRef.current = curr;
  }, [currentZone, isRecording]);

  // コース境界内かどうか
  const inBoundary = useMemo(() => {
    if (!activeCourse || !gps) return true;
    if (activeCourse.boundary.length < 3) return true;
    return isPointInPolygon(
      { latitude: gps.latitude, longitude: gps.longitude },
      activeCourse.boundary,
    );
  }, [activeCourse, gps]);

  // ゴール到達検知
  useEffect(() => {
    if (!isRecording || !activeCourse?.endPoint || !gps) return;
    const reached = isNearPoint(
      { latitude: gps.latitude, longitude: gps.longitude },
      activeCourse.endPoint,
      activeCourse.endRadius ?? 30,
    );
    if (reached) {
      // ゴール到達 → セッション終了を提案（自動で止めない）
      // 通知は UI 上で行う（アラートは走行中に邪魔なので省略）
    }
  }, [isRecording, activeCourse, gps]);

  // ── コース自動スタート検知 ──
  useEffect(() => {
    if (isRecording || isPreflight || !gps || courses.length === 0) {
      setNearCourse(null);
      return;
    }
    const pt = { latitude: gps.latitude, longitude: gps.longitude };
    for (const course of courses) {
      if (course.id === dismissedCourseIdRef.current) continue;
      if (isNearPoint(pt, course.startPoint, course.startRadius)) {
        if (nearCourse?.id !== course.id) {
          setNearCourse(course);
          setAutoStartCountdown(AUTO_START_COUNTDOWN);
        }
        return;
      }
    }
    setNearCourse(null);
  }, [gps, courses, isRecording, isPreflight, nearCourse]);

  // カウントダウンタイマー
  useEffect(() => {
    if (!nearCourse) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }
    countdownRef.current = setInterval(() => {
      setAutoStartCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          handleAutoStart();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearCourse]);

  const beginSessionStart = useCallback(async () => {
    const setupDone = await isMountSetupComplete();
    if (!setupDone) {
      setShowMountSetup(true);
      return false;
    }
    await toggle();
    startPreflight();
    return true;
  }, [toggle, startPreflight]);

  const handleAutoStart = useCallback(async () => {
    if (!nearCourse) return;
    setActiveCourse(nearCourse);
    setNearCourse(null);
    const started = await beginSessionStart();
    if (!started) {
      setActiveCourse(null);
    }
  }, [nearCourse, beginSessionStart]);

  const handleDismissAutoStart = useCallback(() => {
    dismissedCourseIdRef.current = nearCourse?.id ?? null;
    setNearCourse(null);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, [nearCourse]);

  // ── リアルタイムスコア計算 ──
  const liveScore = useLiveScore({
    isActive: isRecording,
    driftStatus,
    activeSpeedKmh: gps?.speedKmh ?? 0,
    activeZoneMultiplier: currentZoneMultiplier,
    zoneCrossings,
    sessionStartedAt: sessionStartRef.current,
    profile: effectiveScoringProfile,
  });

  if (isRecording && gps && gps.speedKmh > maxSpeedRef.current) {
    maxSpeedRef.current = gps.speedKmh;
  }

  const handlePress = useCallback(async () => {
    if (isRecording) {
      const sessionDurationMs = Date.now() - sessionStartRef.current;
      const sessionEndedAt = Date.now();
      const crossings = finalizeZoneCrossings(
        [...zoneCrossings],
        sessionStartRef.current,
        sessionEndedAt,
      );
      const result = scoreSession(
        driftStatus.events,
        sessionStartRef.current,
        sessionDurationMs,
        maxSpeedRef.current,
        crossings.length > 0 ? crossings : undefined,
        effectiveScoringProfile,
      );
      const scoredCrossings = crossings.length > 0
        ? enrichZoneCrossingsWithScoring(result, crossings)
        : crossings;
      const finalLaps = completedLaps.length > 0
        ? completedLaps.map((lap) => ({ ...lap, points: lap.points || result.totalPoints }))
        : undefined;
      const track = getGpsTrack();
      const lineEvalTrack = getLineEvalTrack();
      const telemetryLog = getTelemetryLog();
      const gpsIntegritySummary = getGpsIntegritySummary();
      const zoneTrace = activeCourse && activeCourse.scoringZones.length > 0
        ? computeZoneTraceSummary(
            activeCourse.scoringZones,
            track,
            scoredCrossings,
          ) ?? undefined
        : undefined;
      let lineEval = activeCourse && activeCourse.scoringZones.length > 0 && lineEvalTrack.length >= 2
        ? computeLineEvalSummary(activeCourse.scoringZones, lineEvalTrack) ?? undefined
        : undefined;
      const courseName = activeCourse?.name;
      const courseZoneTotal = activeCourse?.scoringZones.length;
      let zoneBestUpdates: ZoneBestUpdate[] | undefined;
      if (activeCourse) {
        await updateCourseBestScore(activeCourse.id, result.totalPoints);
        if (scoredCrossings.length > 0) {
          zoneBestUpdates = await updateCourseZoneBestRecords(activeCourse.id, {
            ...result,
            zoneCrossings: scoredCrossings,
          }, scoredCrossings);
        }
        if (lineEvalTrack.length >= 5) {
          const { zones: learnedZones, updatedZoneIds } = learnIdealLinesFromTrack(
            activeCourse.scoringZones,
            lineEvalTrack,
            {
              loggerPreferred: lineEval?.gpsSource !== 'phone',
              overallLineScore: lineEval?.overallScore,
            },
          );
          if (updatedZoneIds.length > 0) {
            const zonesLearned = await updateCourseLearnedIdealLines(
              activeCourse.id,
              learnedZones,
              updatedZoneIds,
            );
            if (lineEval && zonesLearned > 0) {
              lineEval = { ...lineEval, zonesLearned };
            }
          }
        }
        setActiveCourse(null);
      }
      const sessionPayload: SessionResult = {
        ...result,
        telemetrySource,
        runtimeEffectiveProfile: getRuntimeEffectiveProfile() ?? undefined,
        slipFusionConsistency: getSlipFusionConsistency() ?? undefined,
        telemetryQuality: getSessionQualitySummary() ?? undefined,
        scoringMode: gpsIntegritySummary?.isPracticeMode ? 'practice' : 'official',
        gpsIntegrity: gpsIntegritySummary ?? undefined,
        courseName,
        zoneCrossings: scoredCrossings.length > 0 ? scoredCrossings : undefined,
        courseZoneTotal,
        zoneTrace,
        lineEval,
        laps: finalLaps,
        courseType: courseType !== 'unknown' ? courseType : undefined,
        gpsTrack: track.length >= 2 ? track : undefined,
        telemetryLog: telemetryLog.length >= 2 ? telemetryLog : undefined,
        zoneBestUpdates: zoneBestUpdates && zoneBestUpdates.length > 0 ? zoneBestUpdates : undefined,
      };
      saveSession(sessionPayload);
      if (telemetryLog.length >= 2) {
        uploadSessionLog({
          result: sessionPayload,
          telemetryLog,
          vehicleLabel: isConnected && device?.name ? device.name : 'スマホ計測',
          locationLabel: courseName ?? activeCourse?.name ?? null,
        });
      }
      setZoneCrossings([]);
      prevZoneRef.current      = null;
      setZoneHitCount(0);
      setCompletedLaps([]);
      setLapNumber(1);
      setRunDirection('forward');
      await toggle();
      finishToIdle();
      dismissedCourseIdRef.current = null;
      router.push('/result');
    } else if (isPreflight) {
      await toggle();
      cancelPreflight();
    } else {
      setActiveCourse(null);
      await beginSessionStart();
    }
  }, [
    isRecording,
    isPreflight,
    driftStatus.events,
    toggle,
    activeCourse,
    completedLaps,
    courseType,
    zoneCrossings,
    effectiveScoringProfile,
    telemetrySource,
    getGpsTrack,
    getLineEvalTrack,
    getTelemetryLog,
    getRuntimeEffectiveProfile,
    getSlipFusionConsistency,
    getSessionQualitySummary,
    getGpsIntegritySummary,
    finishToIdle,
    cancelPreflight,
    beginSessionStart,
    uploadSessionLog,
    device,
    isConnected,
  ]);

  // ────────────────────────────────────────────────────────────────
  // 共通パーツ
  // ────────────────────────────────────────────────────────────────
  /** セッション中に MAP ボタンを押したときの処理 */
  const handleMapPress = useCallback(() => {
    if (sessionIdle) {
      if (activeCourse) {
        openCourses({ select: activeCourse.id });
      } else {
        openCourses();
      }
      return;
    }
    Alert.alert(
      isPreflight ? 'チェックを中止' : 'セッションを中断',
      isPreflight
        ? 'プリフライトを中止してマップ設定へ移動しますか？'
        : 'セッションを中断してマップ設定へ移動しますか？\n現在のセッションデータは保存されません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '中断してマップへ',
          style: 'destructive',
          onPress: async () => {
            if (activeCourse) setActiveCourse(null);
            dismissedCourseIdRef.current = null;
            await toggle();
            if (isPreflight) cancelPreflight();
            else finishToIdle();
            router.push('/courses');
          },
        },
      ],
    );
  }, [sessionIdle, isPreflight, activeCourse, toggle, cancelPreflight, finishToIdle]);

  const startSequenceOverlay = (
    <StartSequenceOverlay
      visible={isPreflight}
      sequencePhase={sequencePhase}
      systemLines={systemLines}
      countdown={countdown}
      onAbort={handlePress}
    />
  );

  const sessionButton = (
    <NeonButton
      label={
        isRecording
          ? 'STOP SESSION'
          : isPreflight
            ? 'ABORT CHECK'
            : 'START SESSION'
      }
      variant={isRecording ? 'danger' : isPreflight ? 'secondary' : 'primary'}
      onPress={handlePress}
    />
  );

  const headerBlock = (
    <Header
      status={headerStatus}
      mountOrientation={mountOrientation}
      mountOrientationAuto={mountOrientationAuto}
      mountOrientationUnstable={mountOrientationUnstable}
      subtitle="COURSE MODE"
      onBackPress={sessionIdle ? () => openPitLane() : undefined}
      onMapPress={handleMapPress}
      onSettingsPress={sessionIdle ? () => router.push('/settings') : undefined}
    />
  );

  const mountStabilityBanner =
    mountOrientationAuto && mountOrientationUnstable && metersLive ? (
      <MountStabilityBanner visible />
    ) : null;

  const courseDetectBanner = nearCourse && sessionIdle ? (
    <CourseDetectedBanner
      course={nearCourse}
      countdown={autoStartCountdown}
      onStart={handleAutoStart}
      onDismiss={handleDismissAutoStart}
      zoneMultiplier={currentZoneMultiplier}
    />
  ) : null;

  const activeCourseBanner = activeCourse && isRecording ? (
    <ActiveCourseBanner
      course={activeCourse}
      inBoundary={inBoundary}
      currentZone={currentZone}
      zoneHitCount={zoneHitCount}
      courseType={courseType}
      lapNumber={lapNumber}
      runDirection={runDirection}
      laps={completedLaps}
    />
  ) : null;

  const errorBlock = error ? (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{error}</Text>
    </View>
  ) : null;

  // ── VENUE バー: 近接コース名（非セッション時も常時表示） ──
  const venueBar = (() => {
    const course = activeCourse ?? nearCourse;
    if (!course) return null;
    const ct = course.courseType ?? detectCourseType(course);
    const typeLabel = ct === 'circuit' ? '⟳ CIRCUIT' : ct === 'street' ? '↔ STREET' : '';
    return (
      <View style={styles.venueBar}>
        <Text style={styles.venueLabel}>VENUE</Text>
        <Text style={styles.venueName} numberOfLines={1}>{course.name}</Text>
        {typeLabel ? <Text style={styles.venueType}>{typeLabel}</Text> : null}
      </View>
    );
  })();

  const hintBlock = sessionIdle && !error ? (
    <Text style={styles.hint}>
      START 後はマウント設定 → センサーチェック → 5-4-3-2-1 → 計測開始。端末をダッシュボードに固定し、屋外で GPS を安定させてください。
    </Text>
  ) : null;

  const surfaceConditionBlock = !isRecording ? (
    <View style={styles.surfaceToggleWrap}>
      <SurfaceConditionToggle
        compact
        value={settings.surfaceCondition}
        onChange={setSurfaceCondition}
      />
    </View>
  ) : settings.surfaceCondition === 'wet' ? (
    <View style={styles.surfaceWetBadge}>
      <Text style={styles.surfaceWetBadgeText}>WET MODE — 低μ路面</Text>
    </View>
  ) : null;

  // ────────────────────────────────────────────────────────────────
  // Portrait レイアウト
  // ────────────────────────────────────────────────────────────────
  if (!isLandscape) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {headerBlock}
        {mountStabilityBanner}
        <LoggerStatusBanner variant="inline" />
        {surfaceConditionBlock}
        <QualityIndicator quality={telemetryQuality} visible={metersLive} />
        <GpsIntegrityBanner integrity={gpsIntegrity} visible={metersLive} />
        {venueBar}
        {courseDetectBanner}
        {activeCourseBanner}

        {startSequenceOverlay}

        {isRecording ? (
          <LiveScoreBanner live={liveScore} driftPhase={driftStatus.phase} />
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.meterSection}>
            <GMeter motion={motion} isActive={metersLive} meterMode={meterMode} />
          </View>

          <DriftIndicator
            status={driftStatus}
            motion={motion}
            slipAngleDeg={slipAngleDeg}
            preflight={isPreflight}
          />
          <GpsPanel gps={gps} isActive={metersLive} gpsMonitor={gpsMonitor} grade={grade} />
          {!isPreflight ? <GyroReadout motion={motion} /> : null}

          {errorBlock}
          {hintBlock}
        </ScrollView>

        <View style={styles.footer}>
          {sessionButton}
        </View>

        {sessionIdle ? (
          <PitBoardPanel
            courses={courses}
            gps={gps}
            selectedId={activeCourse?.id}
            onSelect={handlePitBoardSelect}
            onCreate={() => openCourseEditor()}
          />
        ) : null}

        {sessionIdle ? (
          <View style={styles.footerLinks}>
            <GamePressable
              onPress={() => router.push('/history')}
              style={({ pressed }) => [styles.footerLink, pressed && { opacity: 0.5 }]}
            >
              <Text style={styles.footerLinkText}>VIEW HISTORY</Text>
            </GamePressable>
            <View style={styles.footerLinkDivider} />
            <GamePressable
              onPress={() => router.push('/scoring-guide')}
              style={({ pressed }) => [styles.footerLink, pressed && { opacity: 0.5 }]}
            >
              <Text style={[styles.footerLinkText, { color: colors.amber }]}>？ SCORING GUIDE</Text>
            </GamePressable>
          </View>
        ) : null}
        <MountSetupOnboarding
          visible={showMountSetup}
          onClose={() => setShowMountSetup(false)}
        />
      </SafeAreaView>
    );
  }

  // ────────────────────────────────────────────────────────────────
  // Landscape レイアウト
  // ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      {headerBlock}
      {mountStabilityBanner}
      <LoggerStatusBanner variant="inline" />
      {surfaceConditionBlock}
      <QualityIndicator quality={telemetryQuality} visible={metersLive} compact />
      <GpsIntegrityBanner integrity={gpsIntegrity} visible={metersLive} compact />
      {venueBar}
      {courseDetectBanner}
      {activeCourseBanner}

      {startSequenceOverlay}

      <View style={lsStyles.body}>
        <View style={lsStyles.leftCol}>
          <GMeter
            motion={motion}
            isActive={metersLive}
            meterMode={meterMode}
            meterSize={LS_METER_SIZE}
          />
        </View>

        <View style={lsStyles.rightCol}>
          {isRecording ? (
            <LiveScoreStrip live={liveScore} driftPhase={driftStatus.phase} />
          ) : null}

          <ScrollView
            style={lsStyles.rightScroll}
            contentContainerStyle={lsStyles.rightScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <DriftIndicator
              status={driftStatus}
              motion={motion}
              slipAngleDeg={slipAngleDeg}
              preflight={isPreflight}
              compact
            />
            <GpsPanel gps={gps} isActive={metersLive} gpsMonitor={gpsMonitor} grade={grade} />
            {errorBlock}
          </ScrollView>
        </View>
      </View>

      <View style={lsStyles.footer}>
        {sessionButton}
        {sessionIdle ? (
          <PitBoardPanel
            courses={courses}
            gps={gps}
            compact
            selectedId={activeCourse?.id}
            onSelect={handlePitBoardSelect}
            onCreate={() => openCourseEditor()}
          />
        ) : null}
        {sessionIdle ? (
          <View style={lsStyles.footerLinkRow}>
            <GamePressable
              onPress={() => router.push('/history')}
              style={({ pressed }) => [lsStyles.footerLink, pressed && { opacity: 0.5 }]}
            >
              <Text style={styles.footerLinkText}>VIEW HISTORY</Text>
            </GamePressable>
            <View style={styles.footerLinkDivider} />
            <GamePressable
              onPress={() => router.push('/scoring-guide')}
              style={({ pressed }) => [lsStyles.footerLink, pressed && { opacity: 0.5 }]}
            >
              <Text style={[styles.footerLinkText, { color: colors.amber }]}>？ GUIDE</Text>
            </GamePressable>
          </View>
        ) : null}
      </View>
      <MountSetupOnboarding
        visible={showMountSetup}
        onClose={() => setShowMountSetup(false)}
      />
    </SafeAreaView>
  );
}

// ── Portrait スタイル ──────────────────────────────────────────
function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  meterSection: {
    height: 360,
  },
  errorBox: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#FF4444',
    borderRadius: 4,
    backgroundColor: '#1A0A0A',
  },
  errorText: {
    ...typography.mono,
    color: '#FF6666',
    fontSize: 12,
    lineHeight: 18,
  },
  venueBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.neonGreen + '40',
    backgroundColor: colors.neonGreen + '0a',
  },
  venueLabel: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 8,
    letterSpacing: 2,
  },
  venueName: {
    ...typography.mono,
    color: colors.neonGreen,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  venueType: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 8,
    borderWidth: 1,
    borderColor: colors.neonGreen + '55',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  hint: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 14,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    textTransform: 'none',
    letterSpacing: 0.5,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  footerLinks: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  footerLink: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  footerLinkDivider: {
    width: 1,
    height: 10,
    backgroundColor: colors.border,
  },
  footerLinkText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 2,
  },
  surfaceToggleWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  surfaceWetBadge: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.amber + '88',
    borderRadius: 4,
    backgroundColor: colors.amber + '12',
    alignItems: 'center',
  },
  surfaceWetBadgeText: {
    ...typography.label,
    color: colors.amber,
    fontSize: 9,
    letterSpacing: 1,
  },
});
}

function useStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

// ── Landscape スタイル ─────────────────────────────────────────
function createLsStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  leftCol: {
    width: LS_LEFT_WIDTH,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  rightCol: {
    flex: 1,
    flexDirection: 'column',
  },
  rightScroll: {
    flex: 1,
  },
  rightScrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  footerLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
}

function useLsStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createLsStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
