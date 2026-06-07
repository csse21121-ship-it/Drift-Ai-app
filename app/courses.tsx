import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import MapView, {
  Callout,
  Circle,
  Marker,
  Polygon,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { openCourseTrack, openPitLane } from '@/lib/navigation';
import { ZoneBestStats } from '@/components/course/ZoneBestStats';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { clearAllCourses, deleteCourse, loadCourses } from '@/lib/courseStore';
import { boundingRegion, detectCorners, detectCourseType, detectScoringProfile, distanceMeters, estimateCourseLengthM, estimateRoadWidthM } from '@/lib/geofence';
import type { Course, CourseType, ScoringProfile } from '@/types/course';

const SCREEN_H  = Dimensions.get('window').height;
const MAP_HEIGHT = Math.round(SCREEN_H * 0.42);

// ── コース統計 ────────────────────────────────────────────────────

/** コースロード時に一度だけ計算してキャッシュするデータ */
export type CourseStats = {
  lengthM:     number;                          // 走行距離 (m)
  roadWidthM:  number;                          // 平均道幅 (m)
  cornerCount: number;                          // 検知コーナー数
  courseType:  CourseType;
  difficulty:  ScoringProfile['gradeDifficulty'];
};

/**
 * コースの幾何データから統計を算出する。
 * courses.tsx のロード時に呼び出し、結果をキャッシュする。
 */
function computeCourseStats(course: Course): CourseStats {
  const ct = course.courseType ?? detectCourseType(course);
  // 道幅・走行距離（境界ポリゴンから推定）
  const roadWidthM = course.boundary.length >= 3 ? estimateRoadWidthM(course.boundary) : 6;
  const lengthM    = course.boundary.length >= 3 ? estimateCourseLengthM(course.boundary) : 0;
  // コーナー数（境界が 6点以上のときだけ実行してコストを抑える）
  const corners    = course.boundary.length >= 6 ? detectCorners(course.boundary) : [];
  // 難易度（保存済みプロファイル優先 → なければ AI 推定）
  const profile    = course.scoringProfile ?? detectScoringProfile(course);

  return { lengthM, roadWidthM, cornerCount: corners.length, courseType: ct, difficulty: profile.gradeDifficulty };
}

// ── ユーティリティ ──────────────────────────────────────────────
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function formatLength(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/**
 * コース全体がちょうど収まるリージョンを計算する。
 * 境界ポリゴン・スタート・ゴール・スコアゾーンをすべて含む。
 * 余白は 30% 付加（境界ぴったりでなく、周囲が少し見える程度）。
 */
function courseRegion(course: Course) {
  // すべての重要な点を集める
  const pts: { latitude: number; longitude: number }[] = [
    ...course.boundary,
    course.startPoint,
  ];
  if (course.endPoint) pts.push(course.endPoint);
  for (const z of course.scoringZones) {
    if (z.zoneShape === 'circle' && z.center) {
      pts.push(z.center);
    } else {
      pts.push(...z.polygon);
    }
  }

  if (pts.length >= 2) {
    const r = boundingRegion(pts);
    // コースが縦長か横長かに関わらず適切な余白を付加
    const pad = 1.35;
    return {
      ...r,
      latitudeDelta:  Math.max(r.latitudeDelta  * pad, 0.001),
      longitudeDelta: Math.max(r.longitudeDelta * pad, 0.001),
    };
  }
  return { ...course.startPoint, latitudeDelta: 0.003, longitudeDelta: 0.003 };
}

// ── サブコンポーネント ────────────────────────────────────────────

function CourseMapOverlay({ course, roadWidthM }: { course: Course; roadWidthM?: number }) {
  const ov = useOv();
  const { colors } = useTheme();
  // コーナー検知（境界が十分ある場合のみ）
  const corners = useMemo(
    () => (course.boundary.length >= 6 ? detectCorners(course.boundary) : []),
    [course.boundary],
  );

  // コーナーごとの表示色と難易度テキスト
  const cornerColor = (angle: number) =>
    angle > 120 ? colors.recRed : angle > 70 ? colors.amber : '#00BFFF';
  const cornerTightness = (angle: number) =>
    angle > 120 ? '急コーナー' : angle > 70 ? '中コーナー' : '緩コーナー';

  return (
    <>
      {/* 境界ポリゴン */}
      {course.boundary.length >= 3 && (
        <Polygon
          coordinates={course.boundary}
          fillColor={colors.neonGreen + '18'}
          strokeColor={colors.neonGreen + '99'}
          strokeWidth={2}
        />
      )}
      {/* スコアゾーン */}
      {course.scoringZones.map((z) =>
        z.zoneShape === 'circle' && z.center ? (
          <Circle key={z.id} center={z.center} radius={z.radius ?? 20}
            fillColor={z.color + '44'} strokeColor={z.color + 'CC'} strokeWidth={2} />
        ) : z.polygon.length >= 3 ? (
          <Polygon key={z.id} coordinates={z.polygon}
            fillColor={z.color + '44'} strokeColor={z.color + 'CC'} strokeWidth={2} />
        ) : null,
      )}

      {/* ── コーナーマーカー ── */}
      {corners.map((c, i) => {
        const angle     = c.totalTurnAngle;
        const col       = cornerColor(angle);
        const label     = `C${i + 1}`;
        const tight     = cornerTightness(angle);
        // スコアゾーン名（インデックスが一致すれば優先表示）
        const matchZone = course.scoringZones[i];
        const zoneName  = matchZone?.name && matchZone.name !== label ? matchZone.name : null;

        return (
          <Marker
            key={`corner-${i}`}
            coordinate={c.apexPoint}
            anchor={{ x: 0.5, y: 0.5 }}
            // tracksViewChanges を省略（デフォルト true）→ Callout が確実に表示される
          >
            {/* ピン本体 */}
            <View style={[ov.cornerPin, { borderColor: col, backgroundColor: '#050505' }]}>
              <Text style={[ov.cornerPinText, { color: col }]}>{label}</Text>
            </View>

            {/* タップで表示されるコールアウト（tooltip なし = プラットフォーム標準バブル） */}
            <Callout>
              <View style={ov.callout}>
                {/* ヘッダー: 左カラー帯 + 名前 */}
                <View style={[ov.calloutHeader, { borderLeftColor: col }]}>
                  <Text style={ov.calloutName}>
                    {zoneName ?? label}
                  </Text>
                  <View style={[ov.calloutTightBadge, { backgroundColor: col + '25', borderColor: col + '88' }]}>
                    <Text style={[ov.calloutTight, { color: col }]}>{tight}</Text>
                  </View>
                </View>
                {/* データ行 */}
                <View style={ov.calloutBody}>
                  <View style={ov.calloutDataRow}>
                    <Text style={ov.calloutKey}>旋回角</Text>
                    <Text style={[ov.calloutVal, { color: col }]}>{Math.round(angle)}°</Text>
                  </View>
                  {roadWidthM != null && (
                    <View style={ov.calloutDataRow}>
                      <Text style={ov.calloutKey}>道幅（推定）</Text>
                      <Text style={ov.calloutVal}>{roadWidthM.toFixed(1)} m</Text>
                    </View>
                  )}
                  <View style={ov.calloutDataRow}>
                    <Text style={ov.calloutKey}>ゾーン半径</Text>
                    <Text style={ov.calloutVal}>{Math.round(c.suggestedRadius)} m</Text>
                  </View>
                  <View style={ov.calloutDataRow}>
                    <Text style={ov.calloutKey}>コーナー番号</Text>
                    <Text style={ov.calloutVal}>{i + 1} / {corners.length}</Text>
                  </View>
                  {matchZone ? <ZoneBestStats zone={matchZone} /> : null}
                </View>
              </View>
            </Callout>
          </Marker>
        );
      })}

      {/* スタートマーカー */}
      <Marker coordinate={course.startPoint} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
        <View style={ov.startPin}>
          <Text style={ov.startPinText}>S</Text>
        </View>
      </Marker>
      {/* ゴールマーカー */}
      {course.endPoint && (
        <Marker coordinate={course.endPoint} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <View style={ov.goalPin}>
            <Text style={ov.goalPinText}>G</Text>
          </View>
        </Marker>
      )}
    </>
  );
}

function createOv(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  // スタート／ゴール
  startPin:     { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.neonGreen, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  startPinText: { color: colors.background, fontWeight: '900', fontSize: 10 },
  goalPin:      { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.recRed, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  goalPinText:  { color: '#fff', fontWeight: '900', fontSize: 10 },

  // コーナーピン
  cornerPin:     { minWidth: 26, height: 26, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  cornerPinText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  // コールアウト（tooltip なし: プラットフォームのバブル内に描画）
  // 背景は白（iOS/Android 標準バブル）なので文字は暗色で
  callout:           { width: 190, paddingBottom: 2 },
  calloutHeader:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        borderLeftWidth: 4, paddingLeft: 8, paddingRight: 8, paddingVertical: 8,
                        borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  calloutName:       { fontSize: 13, fontWeight: '800', color: '#111', letterSpacing: 0.5, flex: 1 },
  calloutTightBadge: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  calloutTight:      { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  calloutBody:       { paddingHorizontal: 10, paddingVertical: 8, gap: 5 },
  calloutDataRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calloutKey:        { fontSize: 11, color: '#666', fontFamily: 'monospace' },
  calloutVal:        { fontSize: 12, color: '#111', fontWeight: '700', fontFamily: 'monospace' },
});
}

function useOv() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createOv(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

// ── 難易度バッジ ────────────────────────────────────────────────
function diffColors(colors: import('@/constants/uiThemes').ThemeColors): Record<ScoringProfile['gradeDifficulty'], string> {
  return {
    easy:   '#00BFFF',
    normal: colors.neonGreen,
    hard:   colors.amber,
    pro:    '#FF4444',
  };
}
const DIFF_LABELS: Record<ScoringProfile['gradeDifficulty'], string> = {
  easy: 'EASY', normal: 'NORMAL', hard: 'HARD', pro: 'PRO',
};

// ── コースカード ─────────────────────────────────────────────────
function CourseCard({
  course, stats, selected, onSelect, onRun, onEdit, onDelete, onFlyTo,
}: {
  course:   Course;
  stats:    CourseStats;
  selected: boolean;
  onSelect: () => void;
  onRun:    () => void;
  onEdit:   () => void;
  onDelete: () => void;
  onFlyTo:  () => void;
}) {
  const cc = useCc();
  const { colors } = useTheme();
  const diffColorMap = diffColors(colors);
  const zoneCount   = course.scoringZones.length;
  const diffColor   = diffColorMap[stats.difficulty];
  const typeLabel   = stats.courseType === 'circuit' ? '⟳ CIRCUIT' : stats.courseType === 'street' ? '↔ STREET' : null;
  const widthLabel  = stats.roadWidthM < 4 ? '〔狭〕' : stats.roadWidthM > 7 ? '〔広〕' : null;

  return (
    <GamePressable onPress={onSelect}
      style={({ pressed }) => [cc.card, selected && cc.cardSelected, pressed && { opacity: 0.85 }]}>

      {/* 左カラー帯（難易度カラー） */}
      <View style={[cc.colorBar, { backgroundColor: selected ? diffColor : colors.border }]} />

      <View style={cc.body}>
        {/* ── 行1: コース名 + タイプ ── */}
        <View style={cc.nameRow}>
          <Text style={[cc.name, selected && cc.nameActive]} numberOfLines={1}>{course.name}</Text>
          {typeLabel && (
            <View style={[cc.typeBadge, selected && { borderColor: diffColor + '88' }]}>
              <Text style={[cc.typeBadgeText, selected && { color: diffColor }]}>{typeLabel}</Text>
            </View>
          )}
        </View>

        {/* ── 行2: 距離・道幅・コーナー数 ── */}
        <View style={cc.statsRow}>
          {stats.lengthM > 0 && (
            <View style={cc.statCell}>
              <Text style={cc.statLabel}>LENGTH</Text>
              <Text style={[cc.statVal, selected && { color: colors.neonGreen }]}>{formatLength(stats.lengthM)}</Text>
            </View>
          )}
          <View style={cc.statCell}>
            <Text style={cc.statLabel}>WIDTH</Text>
            <Text style={[cc.statVal, selected && { color: colors.neonGreen }]}>
              {stats.roadWidthM.toFixed(1)} m{widthLabel ? `  ${widthLabel}` : ''}
            </Text>
          </View>
          {stats.cornerCount > 0 && (
            <View style={cc.statCell}>
              <Text style={cc.statLabel}>CORNERS</Text>
              <Text style={[cc.statVal, selected && { color: colors.neonGreen }]}>{stats.cornerCount}</Text>
            </View>
          )}
        </View>

        {/* ── 行3: 難易度 + ゾーン数 + ベストスコア ── */}
        <View style={cc.metaRow}>
          {/* 難易度バッジ */}
          <View style={[cc.diffBadge, { borderColor: diffColor + '99', backgroundColor: diffColor + '18' }]}>
            <Text style={[cc.diffBadgeText, { color: diffColor }]}>{DIFF_LABELS[stats.difficulty]}</Text>
          </View>
          {zoneCount > 0 && (
            <View style={cc.zoneBadge}>
              <Text style={cc.zoneBadgeText}>{zoneCount} ZONE{zoneCount > 1 ? 'S' : ''}</Text>
            </View>
          )}
          <Text style={cc.metaDate}>{formatDate(course.savedAt)}</Text>
          {course.bestScore !== undefined && (
            <Text style={cc.bestScore}>BEST {course.bestScore.toLocaleString()} pt</Text>
          )}
        </View>
      </View>

      {/* アクションボタン */}
      <View style={cc.actions}>
        <GamePressable uiSound="nav" onPress={onRun} hitSlop={6}
          style={({ pressed }) => [cc.actionBtn, cc.actionBtnRun, pressed && { opacity: 0.6 }]}>
          <Text style={cc.actionBtnRunText}>RUN</Text>
        </GamePressable>
        <GamePressable uiSound="nav" onPress={onFlyTo} hitSlop={6}
          style={({ pressed }) => [cc.actionBtn, cc.actionBtnMap, pressed && { opacity: 0.6 }]}>
          <Text style={cc.actionBtnMapText}>📍</Text>
        </GamePressable>
        <GamePressable uiSound="nav" onPress={onEdit} hitSlop={6}
          style={({ pressed }) => [cc.actionBtn, cc.actionBtnEdit, pressed && { opacity: 0.6 }]}>
          <Text style={cc.actionBtnEditText}>EDIT</Text>
        </GamePressable>
        <GamePressable onPress={onDelete} hitSlop={6}
          style={({ pressed }) => [cc.actionBtn, pressed && { opacity: 0.6 }]}>
          <Text style={cc.actionBtnDelText}>✕</Text>
        </GamePressable>
      </View>
    </GamePressable>
  );
}

function createCc(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  card:            { flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.surface, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  cardSelected:    { borderColor: colors.neonGreen + '55', backgroundColor: colors.neonGreen + '06' },
  colorBar:        { width: 4 },
  body:            { flex: 1, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, gap: 4 },

  nameRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name:            { ...typography.label, color: colors.textPrimary, fontSize: 13, letterSpacing: 0.8, flex: 1 },
  nameActive:      { color: colors.neonGreen },
  typeBadge:       { borderWidth: 1, borderColor: colors.border, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  typeBadgeText:   { ...typography.label, color: colors.textMuted, fontSize: 7 },

  statsRow:        { flexDirection: 'row', gap: 10 },
  statCell:        { gap: 1 },
  statLabel:       { ...typography.label, color: colors.textMuted, fontSize: 7, letterSpacing: 0.8 },
  statVal:         { ...typography.mono, color: colors.textSecondary, fontSize: 10, fontWeight: '700' },

  metaRow:         { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  metaDate:        { ...typography.mono, color: colors.textMuted, fontSize: 8, marginLeft: 'auto' },
  diffBadge:       { paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderRadius: 3 },
  diffBadgeText:   { ...typography.label, fontSize: 7, fontWeight: '700' },
  zoneBadge:       { paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: colors.amber + '88', borderRadius: 2 },
  zoneBadgeText:   { ...typography.label, color: colors.amber, fontSize: 7 },
  bestScore:       { ...typography.mono, color: colors.neonGreenDim, fontSize: 9 },

  actions:         { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, paddingRight: spacing.sm, paddingVertical: spacing.sm },
  actionBtn:       { borderWidth: 1, borderColor: colors.border, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center' },
  actionBtnRun:    { borderColor: colors.neonGreen + '99', backgroundColor: colors.neonGreen + '18' },
  actionBtnRunText:{ ...typography.label, color: colors.neonGreen, fontSize: 8, fontWeight: '800' },
  actionBtnMap:    { backgroundColor: 'transparent', borderColor: 'transparent' },
  actionBtnMapText:{ fontSize: 16 },
  actionBtnEdit:   { borderColor: colors.neonGreen + '88', backgroundColor: colors.neonGreen + '11' },
  actionBtnEditText:{ ...typography.label, color: colors.neonGreen, fontSize: 8 },
  actionBtnDelText:{ color: colors.textMuted, fontSize: 11 },
});
}

function useCc() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createCc(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

// ── メインスクリーン ──────────────────────────────────────────────
export default function CoursesScreen() {
  const styles = useStyles();
  const { colors, spacing } = useTheme();
  const mapRef = useRef<MapView>(null);
  const { select: selectParam } = useLocalSearchParams<{ select?: string | string[] }>();
  const selectCourseId =
    typeof selectParam === 'string' ? selectParam : selectParam?.[0];
  const [courses, setCourses]             = useState<Course[]>([]);
  const [statsMap, setStatsMap]           = useState<Record<string, CourseStats>>({});
  const [loading, setLoading]             = useState(true);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [mapExpanded, setMapExpanded]     = useState(true);

  const selectedCourse = courses.find((c) => c.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await loadCourses();
    // ── コース統計を一括計算（非同期で UI ブロックを避ける）──
    const map: Record<string, CourseStats> = {};
    for (const c of data) {
      map[c.id] = computeCourseStats(c);
    }
    setCourses(data);
    setStatsMap(map);
    setLoading(false);
    // リフレッシュ後、選択が消えた場合はリセット
    setSelectedId((prev) => (data.find((c) => c.id === prev) ? prev : null));
  }, []);

  useFocusEffect(
    useCallback(() => { void refresh(); }, [refresh]),
  );

  // ホームから select 指定で開いた場合はマップ上で選択
  useEffect(() => {
    if (!selectCourseId || courses.length === 0) return;
    const course = courses.find((c) => c.id === selectCourseId);
    if (!course) return;
    setSelectedId(course.id);
    const region = courseRegion(course);
    mapRef.current?.animateToRegion(region, 500);
  }, [selectCourseId, courses]);

  // ── 選択してマップフォーカス ──
  const selectAndFly = useCallback((course: Course) => {
    setSelectedId((prev) => {
      if (prev === course.id) { return null; }  // 再タップで解除
      return course.id;
    });
    const region = courseRegion(course);
    mapRef.current?.animateToRegion(region, 500);
  }, []);

  const flyToSelected = useCallback((course: Course) => {
    const region = courseRegion(course);
    mapRef.current?.animateToRegion(region, 400);
  }, []);

  // ── 削除 ──
  const handleDelete = useCallback((id: string) => {
    const course = courses.find((c) => c.id === id);
    Alert.alert(`「${course?.name ?? 'このコース'}」を削除`, '削除すると元に戻せません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await deleteCourse(id);
          if (selectedId === id) setSelectedId(null);
          await refresh();
        },
      },
    ]);
  }, [courses, refresh, selectedId]);

  const handleClearAll = useCallback(() => {
    Alert.alert('全コースを削除', 'すべてのコースを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '全削除',
        style: 'destructive',
        onPress: async () => {
          await clearAllCourses();
          setSelectedId(null);
          await refresh();
        },
      },
    ]);
  }, [refresh]);

  // ── 全コースが見える初期リージョン ──
  const allCoursesRegion = courses.length === 0
    ? { latitude: 35.6762, longitude: 139.6503, latitudeDelta: 0.05, longitudeDelta: 0.05 }
    : courses.length === 1
      ? courseRegion(courses[0])
      : boundingRegion(courses.map((c) => c.startPoint));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* ── ヘッダー ── */}
      <View style={styles.header}>
        <GamePressable uiSound="back" onPress={() => openPitLane()} hitSlop={8}
          style={({ pressed }) => [styles.hBtn, pressed && { opacity: 0.5 }]}>
          <Text style={styles.hBtnBack}>← PIT LANE</Text>
        </GamePressable>
        <Text style={styles.title}>MY COURSES</Text>
        <GamePressable onPress={handleClearAll} hitSlop={8}
          style={({ pressed }) => [styles.hBtn, { alignItems: 'flex-end' }, pressed && { opacity: 0.5 }]}>
          <Text style={styles.hBtnClear}>{courses.length > 0 ? 'CLEAR' : ''}</Text>
        </GamePressable>
      </View>

      {/* ── マップパネル ── */}
      <View style={[styles.mapWrap, !mapExpanded && styles.mapWrapCollapsed]}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          mapType="hybrid"
          initialRegion={allCoursesRegion}
          showsUserLocation
          showsCompass={false}
          showsScale
        >
          {/* 全コースのスタートピン（未選択） */}
          {courses.filter((c) => c.id !== selectedId).map((c) => (
            <Marker
              key={c.id}
              coordinate={c.startPoint}
              onPress={() => selectAndFly(c)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.coursePin}>
                <View style={styles.coursePinDot} />
              </View>
            </Marker>
          ))}
          {/* 選択コースのオーバーレイ */}
          {selectedCourse && (
            <CourseMapOverlay
              course={selectedCourse}
              roadWidthM={statsMap[selectedCourse.id]?.roadWidthM}
            />
          )}
        </MapView>

        {/* 展開/折りたたみトグル */}
        <GamePressable onPress={() => setMapExpanded((v) => !v)} style={styles.mapToggle}>
          <Text style={styles.mapToggleText}>{mapExpanded ? '▲ 地図を小さく' : '▼ 地図を広げる'}</Text>
        </GamePressable>

        {/* 選択コース情報バナー */}
        {selectedCourse && (() => {
          const st = statsMap[selectedCourse.id] ?? computeCourseStats(selectedCourse);
          const diffColor = diffColors(colors)[st.difficulty];
          return (
            <View style={styles.selectedBanner}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.selectedBannerName} numberOfLines={1}>{selectedCourse.name}</Text>
                <Text style={[styles.selectedBannerMeta, { color: diffColor }]}>
                  {DIFF_LABELS[st.difficulty]}
                  {st.lengthM > 0 ? `  ·  ${formatLength(st.lengthM)}` : ''}
                  {`  ·  W ${st.roadWidthM.toFixed(1)}m`}
                  {st.cornerCount > 0 ? `  ·  ${st.cornerCount} corners` : ''}
                  {selectedCourse.bestScore != null ? `  ·  BEST ${selectedCourse.bestScore.toLocaleString()}pt` : ''}
                </Text>
              </View>
              <GamePressable
                uiSound="nav"
                onPress={() => openCourseTrack(selectedCourse.id)}
                style={({ pressed }) => [styles.selectedBannerStart, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.selectedBannerStartText}>計測 START</Text>
              </GamePressable>
              <GamePressable onPress={() => setSelectedId(null)} hitSlop={8}>
                <Text style={styles.selectedBannerDismiss}>✕</Text>
              </GamePressable>
            </View>
          );
        })()}
      </View>

      {/* ── コースリスト ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.neonGreen} />
        </View>
      ) : courses.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>コースがありません</Text>
          <Text style={styles.emptySub}>
            下の「＋ NEW COURSE」からコースの{'\n'}境界・スタート地点を設定してください。
          </Text>
        </View>
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <CourseCard
              course={item}
              stats={statsMap[item.id] ?? computeCourseStats(item)}
              selected={selectedId === item.id}
              onSelect={() => selectAndFly(item)}
              onRun={() => openCourseTrack(item.id)}
              onEdit={() => router.navigate({ pathname: '/course-editor', params: { id: item.id } })}
              onDelete={() => handleDelete(item.id)}
              onFlyTo={() => { setSelectedId(item.id); flyToSelected(item); }}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      {/* ── 新規作成ボタン ── */}
      <View style={styles.footer}>
        {/* AI 自動生成（ウィザード） */}
        <GamePressable onPress={() => router.navigate('/course-wizard')}
          style={({ pressed }) => [styles.autoBtn, pressed && { opacity: 0.85 }]}>
          <Text style={styles.autoBtnText}>🤖  AI 自動生成</Text>
        </GamePressable>
        {/* 手動作成 */}
        <GamePressable onPress={() => router.navigate('/course-editor')}
          style={({ pressed }) => [styles.newBtn, pressed && { opacity: 0.85 }]}>
          <Text style={styles.newBtnText}>＋  手動作成</Text>
        </GamePressable>
      </View>
    </SafeAreaView>
  );
}

// ── スタイル ──────────────────────────────────────────────────────
function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },

  // ヘッダー
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  hBtn: { minWidth: 60 },
  hBtnBack: { ...typography.label, color: colors.neonGreen, fontSize: 9 },
  hBtnClear: { ...typography.label, color: colors.recRed, fontSize: 9 },
  title: { ...typography.title, color: colors.textPrimary, fontSize: 14 },

  // マップ
  mapWrap: { height: MAP_HEIGHT, borderBottomWidth: 1, borderBottomColor: colors.border },
  mapWrapCollapsed: { height: 44 },
  map: { ...StyleSheet.absoluteFillObject },
  coursePin: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.neonGreen, backgroundColor: colors.background + 'CC', alignItems: 'center', justifyContent: 'center' },
  coursePinDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.neonGreen },

  mapToggle: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 22, backgroundColor: colors.background + 'CC', alignItems: 'center', justifyContent: 'center' },
  mapToggleText: { ...typography.label, color: colors.textMuted, fontSize: 8 },

  selectedBanner: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background + 'EE', borderWidth: 1, borderColor: colors.neonGreen + '66', borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 5, gap: 6 },
  selectedBannerName: { ...typography.label, color: colors.neonGreen, fontSize: 10, flex: 1 },
  selectedBannerMeta: { ...typography.mono, color: colors.textMuted, fontSize: 9 },
  selectedBannerStart: { borderWidth: 1, borderColor: colors.neonGreen, borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.neonGreen + '18' },
  selectedBannerStartText: { ...typography.label, color: colors.neonGreen, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  selectedBannerDismiss: { color: colors.textMuted, fontSize: 13 },

  // リスト
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  emptyTitle: { ...typography.label, color: colors.textSecondary, fontSize: 12, marginBottom: spacing.sm },
  emptySub: { ...typography.label, color: colors.textMuted, fontSize: 9, textAlign: 'center', lineHeight: 16, textTransform: 'none', letterSpacing: 0.5 },
  listContent: { padding: spacing.md, gap: spacing.sm },

  // フッター
  footer:      { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  autoBtn:     { backgroundColor: colors.amber + '20', borderRadius: 4, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.amber + '66' },
  autoBtnText: { ...typography.label, color: colors.amber, fontSize: 11, letterSpacing: 2 },
  newBtn:      { backgroundColor: colors.neonGreen, borderRadius: 4, paddingVertical: spacing.md, alignItems: 'center' },
  newBtnText:  { ...typography.label, color: colors.background, fontSize: 13, letterSpacing: 3 },
});
}

function useStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
