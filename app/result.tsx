import { useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import { useTheme } from '@/contexts/ThemeContext';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { SessionReplaySection } from '@/components/result/SessionReplaySection';
import { ResultShareCard } from '@/components/result/ResultShareCard';
import { ZoneBestStats } from '@/components/course/ZoneBestStats';
import { ZoneTracePanel } from '@/components/result/ZoneTracePanel';
import { IdealLinePanel } from '@/components/result/IdealLinePanel';
import { GamificationResultBanner } from '@/components/gamification/GamificationResultBanner';
import { GpsQualityTimeline } from '@/components/result/GpsQualityTimeline';
import { practiceReasonLabel } from '@/lib/gpsIntegrityMonitor';
import { DriverRankHero } from '@/components/gamification/DriverRankHero';
import { formatDriftDuration } from '@/lib/driftDetection';
import { formatSessionDuration, getGradeThresholds, normalizeScore } from '@/lib/scoring';
import { captureAndShareResultImage } from '@/lib/shareResultImage';
import { computeZoneTraceFromCrossings } from '@/lib/zoneTrace';
import { processSessionGamification } from '@/lib/gamification';
import { clearSession, getLastSession, loadHistory, persistSession } from '@/lib/sessionStore';

import type { DriftEvent } from '@/types/drift';
import type { GamificationUpdate } from '@/types/gamification';
import type { SessionResult, ZoneTraceSummary } from '@/types/score';

const SCORE_ANIM_DURATION_MS = 1800;

function resolveZoneTrace(result: SessionResult): ZoneTraceSummary | null {
  if (result.zoneTrace) return result.zoneTrace;
  if (result.zoneCrossings && result.courseZoneTotal && result.courseZoneTotal > 0) {
    return computeZoneTraceFromCrossings(result.zoneCrossings, result.courseZoneTotal);
  }
  return null;
}

export default function ResultScreen() {
  const styles = useStyles();
  const { colors, gradeColor: gradeColors } = useTheme();
  const result = getLastSession();

  const [displayScore, setDisplayScore] = useState(0);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gradeOpacity = useRef(new Animated.Value(0)).current;
  const gradeScale = useRef(new Animated.Value(0.5)).current;
  const shareRef = useRef<ViewShot>(null);
  const [sharingImage, setSharingImage] = useState(false);
  const [gamificationUpdate, setGamificationUpdate] = useState<GamificationUpdate | null>(null);

  // ── AsyncStorage へ永続化 + 称号・デイリー判定 ──
  useEffect(() => {
    if (!result) return;
    persistSession(result)
      .then(async (entry) => {
        const history = await loadHistory();
        return processSessionGamification(entry, history);
      })
      .then(setGamificationUpdate)
      .catch(() => {
        // 保存・判定失敗は UI に影響させない
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!result) return;

    const target = result.totalPoints;
    const stepMs = 16; // ~60fps
    const steps = SCORE_ANIM_DURATION_MS / stepMs;
    let current = 0;

    animRef.current = setInterval(() => {
      current += 1;
      // イーズアウト: 終盤でゆっくり収束
      const progress = current / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.floor(eased * target));

      if (current >= steps) {
        setDisplayScore(target);
        if (animRef.current) clearInterval(animRef.current);

        // スコア確定後にグレードを演出
        Animated.parallel([
          Animated.spring(gradeScale, {
            toValue: 1,
            useNativeDriver: true,
            tension: 60,
            friction: 7,
          }),
          Animated.timing(gradeOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      }
    }, stepMs);

    return () => {
      if (animRef.current) clearInterval(animRef.current);
    };
  }, [result, gradeOpacity, gradeScale]);

  const handleRetry = () => {
    clearSession();
    router.replace('/home');
  };

  const handleShareText = async () => {
    if (!result) return;
    try {
      await Share.share({
        message: `DriftScore AI — ${result.totalPoints.toLocaleString()} pt (${result.grade})\nドリフト ${result.driftScores.length} 回 / 最高速度 ${Math.round(result.maxSpeedKmh)} km/h`,
      });
    } catch {
      // ユーザーがキャンセルした場合など
    }
  };

  const handleShareImage = async () => {
    if (!result || sharingImage) return;

    setSharingImage(true);
    try {
      const outcome = await captureAndShareResultImage(shareRef);
      if (outcome === 'failed') {
        Alert.alert('画像の生成に失敗しました', 'もう一度お試しください。');
      } else if (outcome === 'unavailable') {
        Alert.alert('共有できません', 'この端末では画像共有に対応していません。');
      }
    } finally {
      setSharingImage(false);
    }
  };

  const handleHome = () => {
    clearSession();
    router.replace('/home');
  };

  if (!result) {
    return <NoDataFallback onBack={() => router.replace('/home')} />;
  }

  const gradeTint = gradeColors[result.grade] ?? colors.textSecondary;
  // 難易度判定（result に profile がない場合は 'normal'）
  const difficulty  = (result as unknown as { difficulty?: string }).difficulty as
    ('easy' | 'normal' | 'hard' | 'pro') | undefined ?? 'normal';
  const evalScore   = normalizeScore(result.totalPoints, difficulty);
  const thresholds  = getGradeThresholds(difficulty);
  const sMin        = thresholds[0].min;
  const zoneTrace   = resolveZoneTrace(result);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>DRIFTSCORE</Text>
          <Text style={styles.brandAccent}> AI</Text>
        </View>
        <View style={styles.headerRight}>
          {gamificationUpdate ? (
            <DriverRankHero
              rank={gamificationUpdate.driverRank}
              variant="chip"
              onPress={() => router.push('/achievements')}
            />
          ) : null}
          <Text style={styles.headerSub}>SESSION COMPLETE</Text>
          <GamePressable
            onPress={() => router.push('/history')}
            style={({ pressed }) => [styles.historyBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.historyBtnLabel}>HISTORY</Text>
          </GamePressable>
          <GamePressable
            onPress={() => router.push('/scoring-guide')}
            style={({ pressed }) => [styles.guideBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.guideBtnLabel}>？ GUIDE</Text>
          </GamePressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── スコア & グレード ── */}
        <View style={styles.heroSection}>
          <Text style={styles.scoreLabel}>TOTAL SCORE</Text>
          <Text style={styles.scoreValue}>
            {displayScore.toLocaleString()}
          </Text>

          <Animated.View
            style={[
              styles.gradeBadge,
              { borderColor: gradeTint },
              { opacity: gradeOpacity, transform: [{ scale: gradeScale }] },
            ]}
          >
            <Text style={[styles.gradeText, { color: gradeTint }]}>
              {result.grade}
            </Text>
          </Animated.View>

          {result.scoringMode === 'practice' || result.gpsIntegrity?.isPracticeMode ? (
            <View style={styles.practiceBadge}>
              <Text style={styles.practiceBadgeText}>
                PRACTICE — 参考記録（ランキング対象外）
              </Text>
              {result.gpsIntegrity?.practiceReason ? (
                <Text style={styles.practiceBadgeSub}>
                  {practiceReasonLabel(result.gpsIntegrity.practiceReason)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {result.telemetryQuality?.isReferenceOnly ? (
            <View style={styles.referenceBadge}>
              <Text style={styles.referenceBadgeText}>
                ※ センサー精度低下のため参考値
              </Text>
              <Text style={styles.referenceBadgeSub}>
                計測品質 {Math.round(result.telemetryQuality.averageScore)}%（
                {result.telemetryQuality.sampleCount} samples）
              </Text>
            </View>
          ) : null}

          {/* 100点満点バー */}
          <View style={styles.evalWrap}>
            <View style={styles.evalLabelRow}>
              <Text style={styles.evalLabel}>EVALUATION SCORE</Text>
              <Text style={[styles.evalScore, { color: gradeTint }]}>
                {evalScore}
                <Text style={styles.evalScoreDenom}> / 100</Text>
              </Text>
            </View>
            <View style={styles.evalBarTrack}>
              {/* グレード境界線 */}
              {thresholds.slice(1).map((t) => {
                if (t.min === 0) return null;
                const pct = (t.min / sMin) * 100;
                return (
                  <View
                    key={t.grade}
                    style={[styles.evalBarTick, { left: `${pct}%` as unknown as number }]}
                  />
                );
              })}
              {/* 塗り */}
              <View style={[
                styles.evalBarFill,
                {
                  width: `${Math.min(100, evalScore)}%` as unknown as number,
                  backgroundColor: gradeTint,
                },
              ]} />
            </View>
            <View style={styles.evalHintRow}>
              <Text style={styles.evalHint}>D</Text>
              <Text style={styles.evalHint}>C</Text>
              <Text style={styles.evalHint}>B</Text>
              <Text style={styles.evalHint}>A</Text>
              <Text style={[styles.evalHintS, { color: colors.gold }]}>S</Text>
            </View>
          </View>
        </View>

        <GamificationResultBanner update={gamificationUpdate} />

        {result.gpsIntegrity && result.gpsIntegrity.timeline.length > 0 ? (
          <GpsQualityTimeline
            integrity={result.gpsIntegrity}
            sessionDurationMs={result.sessionDurationMs}
          />
        ) : null}

        {/* ── セッション統計 ── */}
        <TelemetryFrame style={styles.statsFrame}>
          <View style={styles.statsLabelBar}>
            <Text style={styles.sectionLabel}>SESSION STATS</Text>
          </View>
          <View style={styles.statsGrid}>
            <StatCell
              label="DRIFTS"
              value={`${result.driftScores.length}`}
            />
            <StatCell
              label="BEST TIME"
              value={`${formatDriftDuration(result.bestDriftDurationMs)}s`}
            />
            <StatCell
              label="PEAK G"
              value={`${result.maxLateralG.toFixed(2)}G`}
              highlight
            />
            <StatCell
              label="MAX SPEED"
              value={`${Math.round(result.maxSpeedKmh)}`}
              unit="km/h"
            />
            {/* スリップアングル最大値（GPS 取得時のみ意味を持つ） */}
            <StatCell
              label="BEST ANGLE"
              value={
                result.events.length > 0
                  ? `${Math.round(
                      Math.max(...result.events.map((e) => e.peakSlipAngleDeg)),
                    )}°`
                  : '—'
              }
              highlight={
                result.events.length > 0 &&
                Math.max(...result.events.map((e) => e.peakSlipAngleDeg)) >= 20
              }
            />
            <StatCell
              label="MAX COMBO"
              value={
                result.driftScores.length > 0
                  ? `×${Math.max(...result.driftScores.map((d) => d.combo))}`
                  : '—'
              }
            />
            <StatCell
              label="SESSION"
              value={formatSessionDuration(result.sessionDurationMs)}
              wide
            />
          </View>
        </TelemetryFrame>

        {/* ── テレメトリー / GPS 再生 ── */}
        <SessionReplaySection result={result} />

        {!result.telemetryLog && !result.gpsTrack ? (
          <TelemetryFrame style={styles.trackEmptyFrame}>
            <View style={styles.trackEmpty}>
              <Text style={styles.trackEmptyTitle}>REPLAY</Text>
              <Text style={styles.trackEmptyBody}>
                テレメトリーまたは GPS ログが記録されませんでした。{'\n'}
                セッション中にセンサーと GPS が有効な状態で走行してください。
              </Text>
            </View>
          </TelemetryFrame>
        ) : null}

        {/* ── ドリフトログ ── */}
        {result.driftScores.length > 0 ? (
          <TelemetryFrame style={styles.logFrame}>
            <View style={styles.statsLabelBar}>
              <Text style={styles.sectionLabel}>DRIFT LOG</Text>
              <Text style={styles.sectionSub}>
                {result.driftScores.length} EVENTS
              </Text>
            </View>

            {/* ログヘッダー行 */}
            <View style={styles.logHeader}>
              <Text style={[styles.logCell, styles.logColNo]}>#</Text>
              <Text style={[styles.logCell, styles.logColTime]}>TIME</Text>
              <Text style={[styles.logCell, styles.logColAngle]}>ANGLE/A+</Text>
              <Text style={[styles.logCell, styles.logColG]}>G</Text>
              <Text style={[styles.logCell, styles.logColCombo]}>CMB</Text>
              <Text style={[styles.logCell, styles.logColZone]}>ZONE</Text>
              <Text style={[styles.logCell, styles.logColPts, styles.logAlignRight]}>PTS</Text>
            </View>

            {result.driftScores.map((ds, i) => (
              <DriftLogRow
                key={ds.eventId}
                index={i + 1}
                score={ds}
                event={result.events[i]}
                isLast={i === result.driftScores.length - 1}
              />
            ))}

            {/* 合計行 */}
            <View style={styles.logTotal}>
              <Text style={styles.logTotalLabel}>TOTAL</Text>
              <Text style={styles.logTotalValue}>
                {result.totalPoints.toLocaleString()} pt
              </Text>
            </View>
          </TelemetryFrame>
        ) : (
          <TelemetryFrame style={styles.logFrame}>
            <View style={styles.emptyLog}>
              <Text style={styles.emptyLogText}>NO DRIFT EVENTS RECORDED</Text>
              <Text style={styles.emptyLogSub}>
                設定画面の閾値を下回ると検知されません。{'\n'}
                スコアはスリップアングルが深いほど A+ ボーナスが上がります。
              </Text>
            </View>
          </TelemetryFrame>
        )}

        {/* ── ゾーンなぞり達成率 ── */}
        {zoneTrace ? (
          <ZoneTracePanel trace={zoneTrace} courseName={result.courseName} />
        ) : null}

        {result.lineEval ? (
          <IdealLinePanel lineEval={result.lineEval} courseName={result.courseName} />
        ) : null}

        {/* ── コーナー別ベスト更新 ── */}
        {result.zoneBestUpdates && result.zoneBestUpdates.length > 0 && (
          <TelemetryFrame style={styles.logFrame}>
            <View style={styles.zoneBestHeader}>
              <Text style={styles.zoneBestTitle}>NEW CORNER RECORD</Text>
              <Text style={styles.zoneBestSub}>コーナー別ベストを更新しました</Text>
            </View>
            {result.zoneBestUpdates.map((update) => (
              <View key={update.zoneId} style={styles.zoneBestRow}>
                <Text style={styles.zoneBestName} numberOfLines={1}>{update.zoneName}</Text>
                <ZoneBestStats zone={{ bestRecord: update.bestRecord }} />
              </View>
            ))}
          </TelemetryFrame>
        )}

        {/* ── ゾーン通過ログ ── */}
        {result.zoneCrossings && result.zoneCrossings.length > 0 && (
          <TelemetryFrame style={styles.logFrame}>
            <View style={styles.logHeader}>
              <Text style={[styles.logCell, { flex: 1 }]}>ZONE</Text>
              <Text style={[styles.logCell, { width: 44 }]}>TIME</Text>
              <Text style={[styles.logCell, { width: 36 }]}>STAY</Text>
              <Text style={[styles.logCell, { width: 32, textAlign: 'right' }]}>×</Text>
              <Text style={[styles.logCell, { width: 32, textAlign: 'right' }]}>本</Text>
              <Text style={[styles.logCell, { width: 48, textAlign: 'right' }]}>PT</Text>
            </View>
            {result.zoneCrossings.map((zc, i) => {
              const enteredSec = (zc.enteredAtMs / 1000).toFixed(1);
              const durSec     = zc.durationMs != null ? (zc.durationMs / 1000).toFixed(1) : '—';
              return (
                <View key={i} style={[styles.logRow, i % 2 === 1 && styles.logRowAlt]}>
                  <Text style={[styles.logCell, { flex: 1, color: colors.amber }]} numberOfLines={1}>{zc.zoneName}</Text>
                  <Text style={[styles.logCell, { width: 44, color: colors.textMuted }]}>{enteredSec}s</Text>
                  <Text style={[styles.logCell, { width: 36, color: colors.textMuted }]}>{durSec}s</Text>
                  <Text style={[styles.logCell, { width: 32, textAlign: 'right', color: colors.amber, fontWeight: '700' }]}>×{zc.multiplier}</Text>
                  <Text style={[styles.logCell, { width: 32, textAlign: 'right', color: colors.textSecondary }]}>
                    {zc.driftHits ?? '—'}
                  </Text>
                  <Text style={[styles.logCell, { width: 48, textAlign: 'right', color: colors.neonGreen, fontWeight: '700' }]}>
                    {zc.pointsEarned != null ? zc.pointsEarned.toLocaleString() : '—'}
                  </Text>
                </View>
              );
            })}
            <View style={styles.logTotal}>
              <Text style={styles.logTotalLabel}>ZONE PT</Text>
              <Text style={[styles.logTotalValue, { color: colors.neonGreen }]}>
                {result.zoneCrossings
                  .reduce((sum, zc) => sum + (zc.pointsEarned ?? 0), 0)
                  .toLocaleString()}{' '}
                pt
              </Text>
            </View>
          </TelemetryFrame>
        )}

        {/* ── 周回 / 本数ログ ── */}
        {result.laps && result.laps.length > 0 && (
          <TelemetryFrame style={styles.logFrame}>
            <View style={styles.logHeader}>
              <Text style={[styles.logCell, { flex: 1 }]}>
                {result.courseType === 'street' ? 'RUN' : 'LAP'}
              </Text>
              <Text style={[styles.logCell, { width: 36 }]}>DIR</Text>
              <Text style={[styles.logCell, { width: 52, textAlign: 'right' }]}>TIME</Text>
              <Text style={[styles.logCell, { width: 44, textAlign: 'right' }]}>DRIFT</Text>
            </View>
            {result.laps.map((lap) => (
              <View key={`${lap.lapNumber}-${lap.direction}`} style={styles.logRow}>
                <Text style={[styles.logCell, { flex: 1, color: colors.neonGreen }]}>
                  #{lap.lapNumber}
                </Text>
                <Text style={[styles.logCell, { width: 36, color: colors.amber }]}>
                  {result.courseType === 'street'
                    ? lap.direction === 'reverse' ? '↩' : '→'
                    : '⟳'}
                </Text>
                <Text style={[styles.logCell, { width: 52, textAlign: 'right' }]}>
                  {(lap.durationMs / 1000).toFixed(1)}s
                </Text>
                <Text style={[styles.logCell, { width: 44, textAlign: 'right', color: colors.neonGreenDim }]}>
                  {lap.driftCount}本
                </Text>
              </View>
            ))}
            <View style={styles.logTotal}>
              <Text style={styles.logTotalLabel}>
                {result.courseType === 'street' ? 'TOTAL RUNS' : 'TOTAL LAPS'}
              </Text>
              <Text style={[styles.logTotalValue, { color: colors.neonGreen }]}>
                {result.laps.length} 回
              </Text>
            </View>
          </TelemetryFrame>
        )}
      </ScrollView>

      {/* 共有用カード（画面外にレンダリングしてキャプチャ） */}
      <View style={styles.shareCaptureHost} pointerEvents="none" collapsable={false}>
        <ViewShot ref={shareRef} options={{ format: 'png', quality: 1 }}>
          <ResultShareCard result={result} />
        </ViewShot>
      </View>

      {/* フッターボタン — ゲームリザルト風 */}
      <View style={styles.footer}>
        <View style={styles.actionRow}>
          <ResultActionButton label="もう一度" onPress={handleRetry} accent />
          <ResultActionButton label="Pit Lane" onPress={handleHome} />
        </View>
        <View style={[styles.actionRow, styles.actionRowSecondary]}>
          <ResultActionButton label="テキスト共有" onPress={handleShareText} />
          <ResultActionButton
            label={sharingImage ? '生成中…' : '画像共有'}
            onPress={handleShareImage}
            disabled={sharingImage}
            accent
          />
        </View>
        {sharingImage ? (
          <ActivityIndicator style={styles.shareSpinner} color={colors.neonGreen} size="small" />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

// ── サブコンポーネント ────────────────────────────────────────

function StatCell({
  label,
  value,
  unit,
  highlight = false,
  wide = false,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
  wide?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.statCell, wide && styles.statCellWide]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, highlight && styles.statValueHighlight]}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function DriftLogRow({
  index,
  score,
  event,
  isLast,
}: {
  index: number;
  score: import('@/types/score').DriftScore;
  event: DriftEvent;
  isLast: boolean;
}) {
  const styles = useStyles();
  const isCombo = score.combo > 1;
  // angleBonus: undefined は旧データ互換で 1.0 扱い
  const bonus      = score.angleBonus ?? 1.0;
  const hasBonus   = bonus >= 1.05;   // 表示するか否かの閾値
  const slipAngle  = event.peakSlipAngleDeg > 0.5
    ? `${Math.round(event.peakSlipAngleDeg)}°`
    : `~${Math.round(event.peakAngleDeg)}°`;

  return (
    <View style={[styles.logRow, isLast && styles.logRowLast]}>
      <Text style={[styles.logCell, styles.logColNo, styles.logCellMuted]}>
        {index.toString().padStart(2, '0')}
      </Text>
      <Text style={[styles.logCell, styles.logColTime]}>
        {formatDriftDuration(event.durationMs)}s
      </Text>

      {/* ANGLE / A+ 列: スリップ角 + ボーナス倍率を2行表示 */}
      <View style={[styles.logColAngle]}>
        <Text style={styles.logAngleValue}>{slipAngle}</Text>
        {hasBonus ? (
          <Text style={styles.logAngleBonusText}>
            ×{bonus.toFixed(2)}
          </Text>
        ) : (
          <Text style={styles.logAngleBonusNone}>—</Text>
        )}
      </View>

      <Text style={[styles.logCell, styles.logColG]}>
        {event.peakLateralG.toFixed(2)}
      </Text>
      <Text style={[styles.logCell, styles.logColCombo, isCombo && styles.logComboActive]}>
        ×{score.combo}
      </Text>
      {/* ZONE 列: ゾーン倍率（1.0 超のときのみ色付き表示） */}
      {score.zoneMultiplier && score.zoneMultiplier > 1.0 ? (
        <Text style={[styles.logCell, styles.logColZone, styles.logZoneActive]}>
          ×{score.zoneMultiplier.toFixed(1)}
        </Text>
      ) : (
        <Text style={[styles.logCell, styles.logColZone, styles.logCellMuted]}>—</Text>
      )}
      <Text style={[styles.logCell, styles.logColPts, styles.logAlignRight, styles.logPtsValue]}>
        {score.finalPoints.toLocaleString()}
      </Text>
    </View>
  );
}

function ResultActionButton({
  label,
  onPress,
  accent = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <GamePressable
      style={({ pressed }) => [
        styles.actionBtn,
        accent && styles.actionBtnAccent,
        disabled && styles.actionBtnDisabled,
        pressed && !disabled && styles.actionBtnPressed,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.actionBtnLabel, accent && styles.actionBtnLabelAccent]}>
        {label}
      </Text>
    </GamePressable>
  );
}

function NoDataFallback({ onBack }: { onBack: () => void }) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.noDataContainer}>
        <Text style={styles.noDataText}>NO SESSION DATA</Text>
        <GamePressable style={styles.newSessionBtn} onPress={onBack}>
          <Text style={styles.newSessionLabel}>BACK</Text>
        </GamePressable>
      </View>
    </SafeAreaView>
  );
}

// ── スタイル ────────────────────────────────────────────────

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brand: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 16,
  },
  brandAccent: {
    ...typography.title,
    color: colors.neonGreen,
    fontSize: 16,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  headerSub: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },
  historyBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  historyBtnLabel: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 8,
    letterSpacing: 1.5,
  },
  guideBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.amber + '66',
    borderRadius: 2,
    backgroundColor: colors.amber + '10',
  },
  guideBtnLabel: {
    ...typography.label,
    color: colors.amber,
    fontSize: 8,
    letterSpacing: 1.5,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },

  // ── ヒーロー ──
  heroSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  scoreLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
    marginBottom: spacing.xs,
  },
  scoreValue: {
    fontFamily: 'monospace',
    fontSize: 64,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  gradeBadge: {
    marginTop: spacing.lg,
    width: 80,
    height: 80,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    fontFamily: 'monospace',
    fontSize: 48,
    fontWeight: '700',
  },
  referenceBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.amber + 'AA',
    backgroundColor: colors.amber + '14',
    borderRadius: 4,
    maxWidth: 320,
  },
  referenceBadgeText: {
    ...typography.label,
    color: colors.amber,
    fontSize: 9,
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'none',
  },
  referenceBadgeSub: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textAlign: 'center',
    marginTop: 4,
    textTransform: 'none',
  },
  practiceBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.recRed + '88',
    backgroundColor: colors.recRed + '12',
    borderRadius: 4,
    maxWidth: 320,
  },
  practiceBadgeText: {
    ...typography.label,
    color: colors.recRed,
    fontSize: 9,
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'none',
  },
  practiceBadgeSub: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textAlign: 'center',
    marginTop: 4,
    textTransform: 'none',
  },

  // ── 100点満点バー ──
  evalWrap: {
    width: '100%',
    marginTop: spacing.lg,
    gap: 6,
  },
  evalLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  evalLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    letterSpacing: 2,
  },
  evalScore: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
  },
  evalScoreDenom: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '400',
  },
  evalBarTrack: {
    height: 12,
    backgroundColor: colors.border,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  evalBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 12,
    borderRadius: 6,
  },
  evalBarTick: {
    position: 'absolute',
    top: 0,
    width: 1,
    height: 12,
    backgroundColor: colors.background + 'CC',
    zIndex: 1,
  },
  evalHintRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  evalHint: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
  },
  evalHintS: {
    ...typography.label,
    fontSize: 7,
    fontWeight: '900',
  },

  // ── 統計 ──
  statsFrame: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  trackEmptyFrame: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  trackEmpty: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  trackEmptyTitle: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },
  trackEmptyBody: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 14,
    textTransform: 'none',
    textAlign: 'center',
  },
  statsLabelBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.neonGreen,
  },
  sectionSub: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCell: {
    width: '50%',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
  },
  statCellWide: {
    width: '100%',
    borderRightWidth: 0,
  },
  statLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    marginBottom: 4,
  },
  statValue: {
    ...typography.mono,
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  statValueHighlight: {
    color: colors.neonGreen,
  },
  statUnit: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '400',
  },

  // ── ドリフトログ ──
  logFrame: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  logHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logRowAlt: {
    backgroundColor: colors.surfaceElevated,
  },
  logRowLast: {
    borderBottomWidth: 0,
  },
  logCell: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 11,
  },
  logCellMuted: {
    color: colors.textMuted,
  },
  logColNo:    { width: 28 },
  logColTime:  { flex: 1 },
  logColAngle: { flex: 1.4 },
  logColG:     { flex: 1 },
  logColCombo: { flex: 0.9 },
  logColZone:  { flex: 0.9 },
  logColPts:   { flex: 1 },
  logAlignRight: { textAlign: 'right' },
  logComboActive: { color: colors.neonGreen },
  logZoneActive:  { color: colors.amber, fontWeight: '700' },
  logPtsValue: { color: colors.textPrimary, fontWeight: '700' },
  logAngleValue: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.neonGreen,
    fontWeight: '700',
    letterSpacing: 1,
  },
  logAngleBonusText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: colors.neonGreenDim,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  logAngleBonusNone: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 1,
  },
  logTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  logTotalLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },
  logTotalValue: {
    ...typography.mono,
    color: colors.neonGreen,
    fontSize: 14,
    fontWeight: '700',
  },

  zoneBestHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: 2,
  },
  zoneBestTitle: {
    ...typography.label,
    color: colors.amber,
    fontSize: 9,
    letterSpacing: 1,
  },
  zoneBestSub: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.2,
  },
  zoneBestRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 4,
  },
  zoneBestName: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
  },

  // ── 空のログ ──
  emptyLog: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyLogText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
  },
  emptyLogSub: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textAlign: 'center',
    lineHeight: 14,
    textTransform: 'none',
    letterSpacing: 0.3,
  },

  // ── フッター ──
  footer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 1,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  actionRowSecondary: {
    marginTop: 1,
  },
  shareCaptureHost: {
    position: 'absolute',
    left: -5000,
    top: 0,
  },
  shareSpinner: {
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  actionBtnAccent: {
    backgroundColor: colors.pitBoard,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnPressed: {
    opacity: 0.7,
  },
  actionBtnLabel: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'none',
  },
  actionBtnLabelAccent: {
    color: colors.neonGreen,
  },
  newSessionBtn: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.neonGreen,
    borderRadius: 4,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  newSessionLabel: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 14,
    letterSpacing: 3,
  },

  // ── フォールバック ──
  noDataContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  noDataText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 12,
  },
});
}

function useStyles() {
  const { colors, typography, spacing, gradeColor } = useTheme();
  return useMemo(
    () => createStyles(colors, typography, spacing),
    [colors, typography, spacing, gradeColor],
  );
}
