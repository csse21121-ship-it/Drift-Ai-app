import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import MapView, {
  Circle,
  MapPressEvent,
  Marker,
  Polygon,
  Polyline,
  PROVIDER_DEFAULT,
  Region,
} from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { router, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { hasZoneBestRecord } from '@/lib/zoneBestRecords';
import { loadCourseById, saveCourse } from '@/lib/courseStore';
import { MapSearchBar } from '@/components/map/MapSearchBar';
import { analyzeInterCornerDistances, boundingRegion, chaikinSmooth, corridorArcLength, createCornerCorridor, detectCorners, detectCourseType, detectScoringProfile, distanceMeters, estimateRoadWidthM, nudgeGeoPoint, polygonCentroid, simplifyPath } from '@/lib/geofence';
import type { CornerInfo } from '@/lib/geofence';
import { ZoneBestStats } from '@/components/course/ZoneBestStats';
import type { Course, GeoPoint, ScoringProfile, ScoringZone, ZoneShape } from '@/types/course';
import { DEFAULT_SCORING_PROFILE } from '@/types/course';
import { getGradeThresholds } from '@/lib/scoring';

// ────────────────────────────────────────────────────────────────
// 定数
// ────────────────────────────────────────────────────────────────
type EditorMode = 'boundary' | 'start' | 'end' | 'zone' | 'scoring';
type DrawMode = 'trace' | 'polygon' | 'circle';
type MapTypeOption = 'standard' | 'satellite' | 'hybrid';

const MODE_LABELS: Record<EditorMode, string> = {
  boundary: '境界線',
  start: 'START',
  end: 'END',
  zone: 'スコアゾーン',
  scoring: '採点設定',
};
const DRAW_MODE_LABELS: Record<DrawMode, string> = {
  trace: '✏ なぞり',
  polygon: '◼ 点打ち',
  circle: '● サークル',
};
const MAP_TYPE_SEQ: MapTypeOption[] = ['standard', 'hybrid', 'satellite'];
const MAP_TYPE_LABELS: Record<MapTypeOption, string> = {
  standard: '地図', hybrid: 'ハイブリッド', satellite: '衛星',
};
const ZONE_COLORS = ['#FF4444', '#FFAA00', '#00AAFF', '#CC44FF', '#FF6688'];

const DEFAULT_START_RADIUS = 30;
const DEFAULT_ZONE_RADIUS  = 50;
const RADIUS_MIN = 5;
const RADIUS_MAX = 200;
const ZONE_RADIUS_MAX = 500;
const MIN_PIXEL_DIST_SQ   = 36;    // 6px^2 — より密にサンプリング
const SIMPLIFY_EPSILON    = 0.5;   // meters (Douglas-Peucker): 細部を保持
const CHAIKIN_ITERATIONS  = 2;     // Chaikin スムージング繰り返し回数
const CORRIDOR_HALF_WIDTH = 1.0;   // コーナーコリドー片側幅 (m) — 総幅 2m

function uid() { return Math.random().toString(36).slice(2, 10); }

// ────────────────────────────────────────────────────────────────
// ゾーン名・倍率ダイアログ
// ────────────────────────────────────────────────────────────────
function ZoneDialog({
  visible, defaultName, onConfirm, onCancel,
}: {
  visible: boolean; defaultName?: string;
  onConfirm: (name: string, multiplier: number) => void;
  onCancel: () => void;
}) {
  const dlg = useDlg();
  const { colors } = useTheme();
  const [name, setName] = useState(defaultName ?? '');
  const [multiplier, setMultiplier] = useState(1.5);
  useEffect(() => { if (visible) setName(defaultName ?? ''); }, [visible, defaultName]);

  return (
    <Modal transparent visible={visible} animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={dlg.overlay}>
        <View style={dlg.box}>
          <Text style={dlg.title}>スコアゾーン設定</Text>
          <Text style={dlg.label}>ゾーン名</Text>
          <TextInput style={dlg.input} value={name} onChangeText={setName}
            placeholder="例: ヘアピン / S字 / 最終コーナー"
            placeholderTextColor={colors.textMuted} autoFocus />
          <Text style={dlg.label}>スコア倍率</Text>
          <View style={dlg.multRow}>
            {[1.2, 1.5, 2.0, 3.0].map((v) => (
              <GamePressable key={v} onPress={() => setMultiplier(v)}
                style={[dlg.multBtn, multiplier === v && dlg.multBtnActive]}>
                <Text style={[dlg.multText, multiplier === v && dlg.multTextActive]}>×{v}</Text>
              </GamePressable>
            ))}
          </View>
          <View style={dlg.actions}>
            <GamePressable onPress={onCancel} style={dlg.cancelBtn}>
              <Text style={dlg.cancelText}>キャンセル</Text>
            </GamePressable>
            <GamePressable onPress={() => { onConfirm(name.trim() || 'ZONE', multiplier); setMultiplier(1.5); }}
              style={dlg.confirmBtn}>
              <Text style={dlg.confirmText}>追加</Text>
            </GamePressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createDlg(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center' },
  box: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: spacing.lg, width: '82%', gap: spacing.sm },
  title: { ...typography.label, color: colors.neonGreen, fontSize: 12, marginBottom: spacing.sm },
  label: { ...typography.label, color: colors.textMuted, fontSize: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 3, padding: spacing.sm, color: colors.textPrimary, fontFamily: 'monospace', fontSize: 14, backgroundColor: colors.surface },
  multRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  multBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 3, paddingVertical: 6, alignItems: 'center' },
  multBtnActive: { borderColor: colors.amber, backgroundColor: colors.amber + '22' },
  multText: { ...typography.mono, color: colors.textMuted, fontSize: 12 },
  multTextActive: { color: colors.amber, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 3, paddingVertical: 10, alignItems: 'center' },
  cancelText: { ...typography.label, color: colors.textSecondary, fontSize: 10 },
  confirmBtn: { flex: 1, backgroundColor: colors.neonGreen, borderRadius: 3, paddingVertical: 10, alignItems: 'center' },
  confirmText: { ...typography.label, color: colors.background, fontSize: 10 },
});
}

function useDlg() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createDlg(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

// ────────────────────────────────────────────────────────────────
// スコアリングプロファイルパネル
// ────────────────────────────────────────────────────────────────
function ScoringProfilePanel({
  profile, onChange, onAutoDetect,
}: {
  profile: ScoringProfile;
  onChange: (p: ScoringProfile) => void;
  onAutoDetect: () => void;
}) {
  const sp = useSp();
  const set = <K extends keyof ScoringProfile>(key: K, val: ScoringProfile[K]) =>
    onChange({ ...profile, [key]: val });

  const thresholds = getGradeThresholds(profile.gradeDifficulty);

  return (
    <View style={sp.container}>
      {/* AI 自動検出ボタン */}
      <GamePressable onPress={onAutoDetect} style={({ pressed }) => [sp.autoBtn, pressed && { opacity: 0.7 }]}>
        <Text style={sp.autoBtnText}>⟳ AI 自動検出</Text>
      </GamePressable>

      {/* ── 速度参照値 ── */}
      <View style={sp.row}>
        <View style={sp.rowLabel}>
          <Text style={sp.label}>SPEED REF</Text>
          <Text style={sp.desc}>スピードボーナス基準速度 (km/h)</Text>
        </View>
        <View style={sp.stepper}>
          {[40, 60, 80, 100, 120].map((v) => (
            <GamePressable key={v} onPress={() => set('speedReferenceKmh', v)}
              style={[sp.stepBtn, profile.speedReferenceKmh === v && sp.stepBtnActive]}>
              <Text style={[sp.stepBtnText, profile.speedReferenceKmh === v && sp.stepBtnTextActive]}>
                {v}
              </Text>
            </GamePressable>
          ))}
        </View>
      </View>

      {/* ── スリップアングルスケール ── */}
      <View style={sp.row}>
        <View style={sp.rowLabel}>
          <Text style={sp.label}>ANGLE SCALE</Text>
          <Text style={sp.desc}>角度ボーナス最大化基準 (°)</Text>
        </View>
        <View style={sp.stepper}>
          {[45, 60, 90, 120].map((v) => (
            <GamePressable key={v} onPress={() => set('angleScaleDeg', v)}
              style={[sp.stepBtn, profile.angleScaleDeg === v && sp.stepBtnActive]}>
              <Text style={[sp.stepBtnText, profile.angleScaleDeg === v && sp.stepBtnTextActive]}>
                {v}°
              </Text>
            </GamePressable>
          ))}
        </View>
        <Text style={sp.hint}>
          {profile.angleScaleDeg <= 45 ? 'ヘアピン主体' : profile.angleScaleDeg <= 60 ? 'タイトコーナー' : profile.angleScaleDeg <= 90 ? '標準コーナー' : '高速スイーパー'}
        </Text>
      </View>

      {/* ── コンボウィンドウ ── */}
      <View style={sp.row}>
        <View style={sp.rowLabel}>
          <Text style={sp.label}>COMBO WINDOW</Text>
          <Text style={sp.desc}>コンボ継続時間 (ms)</Text>
        </View>
        <View style={sp.stepper}>
          {[2000, 3000, 4000, 5000].map((v) => (
            <GamePressable key={v} onPress={() => set('comboWindowMs', v)}
              style={[sp.stepBtn, profile.comboWindowMs === v && sp.stepBtnActive]}>
              <Text style={[sp.stepBtnText, profile.comboWindowMs === v && sp.stepBtnTextActive]}>
                {v / 1000}s
              </Text>
            </GamePressable>
          ))}
        </View>
      </View>

      {/* ── 傾斜補正 ── */}
      <View style={sp.row}>
        <View style={sp.rowLabel}>
          <Text style={sp.label}>GRADIENT COMP</Text>
          <Text style={sp.desc}>傾斜による横G補正係数</Text>
        </View>
        <View style={sp.stepper}>
          {([['急坂', 0.70], ['坂あり', 0.85], ['平坦', 1.00]] as [string, number][]).map(([lbl, v]) => (
            <GamePressable key={v} onPress={() => set('gradientCompensation', v)}
              style={[sp.stepBtn, profile.gradientCompensation === v && sp.stepBtnActive]}>
              <Text style={[sp.stepBtnText, profile.gradientCompensation === v && sp.stepBtnTextActive]}>
                {lbl}
              </Text>
            </GamePressable>
          ))}
        </View>
      </View>

      {/* ── グレード難易度 ── */}
      <View style={sp.row}>
        <View style={sp.rowLabel}>
          <Text style={sp.label}>DIFFICULTY</Text>
          <Text style={sp.desc}>グレードしきい値</Text>
        </View>
        <View style={sp.stepper}>
          {(['easy', 'normal', 'hard', 'pro'] as ScoringProfile['gradeDifficulty'][]).map((d) => (
            <GamePressable key={d} onPress={() => set('gradeDifficulty', d)}
              style={[sp.stepBtn, profile.gradeDifficulty === d && sp.stepBtnActive]}>
              <Text style={[sp.stepBtnText, profile.gradeDifficulty === d && sp.stepBtnTextActive]}>
                {d.toUpperCase()}
              </Text>
            </GamePressable>
          ))}
        </View>
      </View>

      {/* グレードプレビュー */}
      <View style={sp.gradePreview}>
        {thresholds.filter((t) => t.grade !== 'D').map((t) => (
          <View key={t.grade} style={sp.gradeRow}>
            <Text style={[sp.gradeLabel, { color: t.grade === 'S' ? '#FFD700' : t.grade === 'A' ? '#39ff14' : t.grade === 'B' ? '#00BFFF' : '#FF9900' }]}>
              {t.grade}
            </Text>
            <Text style={sp.gradeVal}>{t.min.toLocaleString()} pt〜</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function createSp(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  container:        { padding: 10, gap: 10 },
  aiSummary:        { margin: 10, marginBottom: 0, padding: 8, borderWidth: 1, borderColor: '#333', borderRadius: 6, gap: 4 },
  aiSummaryTitle:   { color: '#39ff14', fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  aiRow:            { flexDirection: 'row', justifyContent: 'space-between' },
  aiLabel:          { color: '#666', fontSize: 8 },
  aiVal:            { color: '#aaa', fontSize: 8 },
  autoBtn:          { backgroundColor: '#39ff1420', borderWidth: 1, borderColor: '#39ff1466', borderRadius: 6, paddingVertical: 8, alignItems: 'center' },
  autoBtnText:      { color: '#39ff14', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  row:              { gap: 4 },
  rowLabel:         { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  label:            { color: '#39ff14', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  desc:             { color: '#666', fontSize: 8 },
  hint:             { color: '#FF9900', fontSize: 8, marginTop: 1 },
  stepper:          { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  stepBtn:          { borderWidth: 1, borderColor: '#333', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  stepBtnActive:    { borderColor: '#39ff14', backgroundColor: '#39ff1422' },
  stepBtnText:      { color: '#666', fontSize: 10 },
  stepBtnTextActive:{ color: '#39ff14', fontWeight: '700' },
  gradePreview:     { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 8, flexWrap: 'wrap' },
  gradeRow:         { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  gradeLabel:       { fontSize: 12, fontWeight: '900' },
  gradeVal:         { color: '#666', fontSize: 8 },
});
}

function useSp() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createSp(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

// ────────────────────────────────────────────────────────────────
// 半径調整コントロール
// ────────────────────────────────────────────────────────────────
function RadiusControl({
  label, value, onChange, min, max,
}: {
  label: string; value: number;
  onChange: (v: number) => void;
  min: number; max: number;
}) {
  const rc = useRc();
  const steps = [[-20, '-20m'], [-5, '-5m'], [+5, '+5m'], [+20, '+20m']] as const;
  return (
    <View style={rc.row}>
      <Text style={rc.label}>{label}</Text>
      {steps.map(([d, lbl]) => (
        <GamePressable key={d}
          onPress={() => onChange(Math.max(min, Math.min(max, value + d)))}
          style={({ pressed }) => [rc.btn, pressed && { opacity: 0.6 }]}>
          <Text style={rc.btnText}>{lbl}</Text>
        </GamePressable>
      ))}
      <View style={rc.valBox}>
        <Text style={rc.val}>{value}m</Text>
      </View>
    </View>
  );
}

function createRc(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  label: { ...typography.label, color: colors.textMuted, fontSize: 8, marginRight: 2 },
  btn: { paddingHorizontal: 6, paddingVertical: 5, borderWidth: 1, borderColor: colors.neonGreen + '66', borderRadius: 3, backgroundColor: colors.neonGreen + '0D' },
  btnText: { ...typography.mono, color: colors.neonGreen, fontSize: 9 },
  valBox: { borderWidth: 1, borderColor: colors.neonGreen, borderRadius: 3, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: colors.neonGreen + '18', minWidth: 52, alignItems: 'center' },
  val: { ...typography.mono, color: colors.neonGreen, fontSize: 13, fontWeight: '700' },
});
}

function useRc() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createRc(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

// ────────────────────────────────────────────────────────────────
// メイン画面
// ────────────────────────────────────────────────────────────────
export default function CourseEditorScreen() {
  const s = useS();
  const sp = useSp();
  const dlg = useDlg();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!params.id;
  const mapRef = useRef<MapView>(null);

  // ── 編集状態 ──
  const [mode, setMode]         = useState<EditorMode>('boundary');
  const [drawMode, setDrawMode] = useState<DrawMode>('trace');
  const [mapType, setMapType]   = useState<MapTypeOption>('hybrid');
  const [scoringProfile, setScoringProfile] = useState<ScoringProfile>(DEFAULT_SCORING_PROFILE);

  const [boundary, setBoundary]     = useState<GeoPoint[]>([]);
  const [startPoint, setStartPoint] = useState<GeoPoint | null>(null);
  const [startRadius, setStartRadius] = useState(DEFAULT_START_RADIUS);
  const [endPoint, setEndPoint]     = useState<GeoPoint | null>(null);
  const [endRadius, setEndRadius]   = useState(DEFAULT_START_RADIUS);
  const [zones, setZones]           = useState<ScoringZone[]>([]);

  // ゾーン描画
  const [polygonPoints, setPolygonPoints] = useState<GeoPoint[]>([]);
  const [circleCenter, setCircleCenter]   = useState<GeoPoint | null>(null);
  const [circleRadius, setCircleRadius]   = useState(DEFAULT_ZONE_RADIUS);

  // なぞり描き
  const [isDrawingTrace, setIsDrawingTrace]   = useState(false);
  /** D-P 簡略化済みパス — コーナー検知・ゾーン保存に使用 */
  const [tracePath, setTracePath]             = useState<GeoPoint[]>([]);
  /** Chaikin スムージング済みパス — マップ表示専用（滑らかな曲線） */
  const [traceDisplayPath, setTraceDisplayPath] = useState<GeoPoint[]>([]);
  const [traceFinished, setTraceFinished]     = useState(false);

  // コーナー検知結果
  const [detectedCorners, setDetectedCorners]     = useState<CornerInfo[]>([]);
  const [showCornerPreview, setShowCornerPreview] = useState(false);
  const [canUndoTrace, setCanUndoTrace]           = useState(false);

  // ゾーン選択・調整
  const [selectedZoneId, setSelectedZoneId]       = useState<string | null>(null);
  // ゾーン名インライン編集
  const [editingZoneName, setEditingZoneName]     = useState<string | null>(null); // 編集中の名前 (null=非編集)

  /** ゾーンが見える位置にマップをアニメーション移動 */
  const flyToZone = useCallback((zone: ScoringZone) => {
    if (zone.zoneShape === 'circle' && zone.center) {
      const r = (zone.radius ?? 30) * 0.00001 * 3;
      mapRef.current?.animateToRegion({
        ...zone.center,
        latitudeDelta: r, longitudeDelta: r,
      }, 400);
    } else if (zone.polygon.length > 0) {
      const region = boundingRegion(zone.polygon);
      const pad = 2.5;
      mapRef.current?.animateToRegion({
        ...region,
        latitudeDelta:  Math.max(0.0005, region.latitudeDelta  * pad),
        longitudeDelta: Math.max(0.0005, region.longitudeDelta * pad),
      }, 400);
    }
  }, []);

  /**
   * "コーナー N" 形式の自動命名ゾーンを削除後に連番し直す。
   * カスタム名のゾーンはそのまま維持する。
   */
  const renumberCornerZones = useCallback((zonesArr: ScoringZone[]): ScoringZone[] => {
    let counter = 0;
    return zonesArr.map((z) => {
      if (/^コーナー\s*\d+$/.test(z.name)) {
        counter++;
        return { ...z, name: `コーナー ${counter}` };
      }
      return z;
    });
  }, []);

  const [showZoneDialog, setShowZoneDialog] = useState(false);
  const [showNameInput, setShowNameInput]   = useState(false);
  const [isSaving, setIsSaving]             = useState(false);
  const [courseName, setCourseName]         = useState('');
  const [userLocation, setUserLocation]     = useState<GeoPoint | null>(null);

  // refs (PanResponder 用)
  const mapRegionRef    = useRef<Region>({ latitude: 35.6762, longitude: 139.6503, latitudeDelta: 0.002, longitudeDelta: 0.002 });
  const mapLayoutRef    = useRef<{ width: number; height: number }>({ width: 1, height: 1 });
  const lastScreenRef   = useRef<{ x: number; y: number } | null>(null);
  const mapReadyRef     = useRef(false);
  /** マップ準備前にコースデータが到着した場合の保留フォーカス先 */
  const pendingRegionRef = useRef<Region | null>(null);
  /** 確定済みセグメントの累積パス（複数ストロークを追記） */
  const tracePathRef     = useRef<GeoPoint[]>([]);
  /** 現在のストロークのみ（まだ確定していない点列） */
  const currentStrokeRef = useRef<GeoPoint[]>([]);
  /** アンドゥ用の累積パス履歴スタック（ストローク確定前の状態を保存） */
  const traceHistoryRef  = useRef<GeoPoint[][]>([]);

  // ── 初期化 ──
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        const pos = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setUserLocation(pos);
        mapRegionRef.current = { ...pos, latitudeDelta: 0.002, longitudeDelta: 0.002 };
      }
    })();

    if (params.id) {
      loadCourseById(params.id).then((course) => {
        if (!course) return;
        setCourseName(course.name);
        setBoundary(course.boundary);
        setStartPoint(course.startPoint);
        setStartRadius(course.startRadius ?? DEFAULT_START_RADIUS);
        setEndPoint(course.endPoint ?? null);
        setEndRadius(course.endRadius ?? DEFAULT_START_RADIUS);
        setZones(course.scoringZones);
        if (course.scoringProfile) setScoringProfile(course.scoringProfile);
        else {
          // 保存データにプロファイルがない場合は AI 自動生成
          setScoringProfile(detectScoringProfile(course));
        }
        // コース全体が見えるリージョンを計算
        const allPoints = [
          ...course.boundary,
          course.startPoint,
          ...(course.endPoint ? [course.endPoint] : []),
          ...course.scoringZones.flatMap((z) =>
            z.zoneShape === 'circle' && z.center ? [z.center] : z.polygon,
          ),
        ];
        if (allPoints.length >= 2) {
          const r = boundingRegion(allPoints);
          const target: Region = {
            ...r,
            latitudeDelta:  Math.max(0.001, r.latitudeDelta  * 2.0),
            longitudeDelta: Math.max(0.001, r.longitudeDelta * 2.0),
          };
          if (mapReadyRef.current) {
            mapRef.current?.animateToRegion(target, 600);
          } else {
            pendingRegionRef.current = target;   // マップ準備完了後に飛ぶ
          }
        }
      });
    }
  }, [params.id]);

  // ── PanResponder (なぞり描き) ──
  const drawPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        lastScreenRef.current = { x: locationX, y: locationY };
        // 現在ストロークのみリセット — 累積パスは保持
        currentStrokeRef.current = [];
        const r = mapRegionRef.current, l = mapLayoutRef.current;
        const pt: GeoPoint = {
          latitude:  r.latitude  + r.latitudeDelta  * (0.5 - locationY / l.height),
          longitude: r.longitude + r.longitudeDelta * (locationX / l.width - 0.5),
        };
        currentStrokeRef.current = [pt];
        // 表示: 累積 + 現在ストロークの先頭点
        setTracePath([...tracePathRef.current, pt]);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const last = lastScreenRef.current;
        if (last) {
          const dx = locationX - last.x, dy = locationY - last.y;
          if (dx * dx + dy * dy < MIN_PIXEL_DIST_SQ) return;
        }
        lastScreenRef.current = { x: locationX, y: locationY };
        const r = mapRegionRef.current, l = mapLayoutRef.current;
        const pt: GeoPoint = {
          latitude:  r.latitude  + r.latitudeDelta  * (0.5 - locationY / l.height),
          longitude: r.longitude + r.longitudeDelta * (locationX / l.width - 0.5),
        };
        currentStrokeRef.current = [...currentStrokeRef.current, pt];
        // 表示: 累積 + 現在ストローク (リアルタイム)
        setTracePath([...tracePathRef.current, ...currentStrokeRef.current]);
      },
      onPanResponderRelease: () => {
        lastScreenRef.current = null;
        const simplifiedStroke = simplifyPath(currentStrokeRef.current, SIMPLIFY_EPSILON);
        if (simplifiedStroke.length === 0) { setIsDrawingTrace(false); setTraceFinished(tracePathRef.current.length > 0); return; }

        // ── アンドゥ用に確定前の状態を保存 ──
        traceHistoryRef.current = [...traceHistoryRef.current, [...tracePathRef.current]];

        // ── 継ぎ目ブリッジ補間 ──
        // 前のストローク終端と新ストローク先端の間に補間点を挿入し、
        // Chaikin がなめらかに丸めることでズレを自然に吸収する
        let combined: GeoPoint[];
        const acc = tracePathRef.current;
        if (acc.length > 0) {
          const lastPt  = acc[acc.length - 1];
          const firstPt = simplifiedStroke[0];
          const gap = distanceMeters(lastPt, firstPt);
          if (gap > 0.3 && gap < 60) {
            // ギャップをほぼ埋める補間点 (1.5m 間隔)
            const n = Math.max(1, Math.round(gap / 1.5));
            const bridge: GeoPoint[] = [];
            for (let k = 1; k <= n; k++) {
              bridge.push({
                latitude:  lastPt.latitude  + (firstPt.latitude  - lastPt.latitude)  * k / (n + 1),
                longitude: lastPt.longitude + (firstPt.longitude - lastPt.longitude) * k / (n + 1),
              });
            }
            combined = [...acc, ...bridge, ...simplifiedStroke];
          } else {
            combined = [...acc, ...simplifiedStroke];
          }
        } else {
          combined = simplifiedStroke;
        }

        // ── Chaikin で全体をスムージング ──
        const smoothed = chaikinSmooth(combined, CHAIKIN_ITERATIONS);
        tracePathRef.current  = combined;
        currentStrokeRef.current = [];
        setTracePath(combined);
        setTraceDisplayPath(smoothed);
        setIsDrawingTrace(false);
        setTraceFinished(true);
        setShowCornerPreview(false);
        setDetectedCorners([]);
        setCanUndoTrace(true);
      },
    }),
  ).current;

  // ── マップタップ ──
  const handleMapPress = useCallback((e: MapPressEvent) => {
    if (isDrawingTrace) return;
    const coord = e.nativeEvent.coordinate;
    switch (mode) {
      case 'boundary': setBoundary((p) => [...p, coord]); break;
      case 'start':    setStartPoint(coord); break;
      case 'end':      setEndPoint(coord); break;
      case 'zone':
        if (drawMode === 'polygon') {
          setPolygonPoints((p) => [...p, coord]);
        } else if (drawMode === 'circle' && !circleCenter) {
          setCircleCenter(coord);
        }
        break;
    }
  }, [mode, drawMode, circleCenter, isDrawingTrace]);

  // ── なぞり操作 ──

  /** 完全に新規開始（既存パスをすべてクリア） */
  const startTrace = useCallback(() => {
    tracePathRef.current = []; currentStrokeRef.current = [];
    traceHistoryRef.current = [];
    setTracePath([]); setTraceDisplayPath([]);
    setTraceFinished(false); setIsDrawingTrace(true);
    setDetectedCorners([]); setShowCornerPreview(false);
    setCanUndoTrace(false);
  }, []);

  /** 続きを描く（累積パスを保持したまま次のストロークを開始） */
  const continueTrace = useCallback(() => {
    currentStrokeRef.current = [];
    setTraceFinished(false); setIsDrawingTrace(true);
    setShowCornerPreview(false); setDetectedCorners([]);
  }, []);

  /** すべてクリアしてリセット */
  const cancelTrace = useCallback(() => {
    tracePathRef.current = []; currentStrokeRef.current = [];
    traceHistoryRef.current = [];
    setTracePath([]); setTraceDisplayPath([]);
    setTraceFinished(false); setIsDrawingTrace(false);
    setDetectedCorners([]); setShowCornerPreview(false);
    setCanUndoTrace(false);
  }, []);

  /** 1ストローク前の状態に戻す */
  const undoLastSegment = useCallback(() => {
    const history = traceHistoryRef.current;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    traceHistoryRef.current = history.slice(0, -1);
    tracePathRef.current = previous;
    currentStrokeRef.current = [];
    const smoothed = previous.length >= 2 ? chaikinSmooth(previous, CHAIKIN_ITERATIONS) : [];
    setTracePath(previous);
    setTraceDisplayPath(smoothed);
    setTraceFinished(previous.length > 0);
    setCanUndoTrace(traceHistoryRef.current.length > 0);
    setShowCornerPreview(false);
    setDetectedCorners([]);
  }, []);

  // ── ゾーン調整ヘルパー ──

  /** ゾーンを部分更新し map を再レンダリングする */
  const updateZone = useCallback((id: string, patch: Partial<ScoringZone>) => {
    setZones((prev) => prev.map((z) => z.id === id ? { ...z, ...patch } : z));
  }, []);

  /**
   * コリドーのメタデータを変更し、polygon を再生成して保存する。
   * halfWidth / startIdx / endIdx / pathOffset を受け付ける。
   */
  const adjustCorridor = useCallback((
    zone: ScoringZone,
    changes: {
      halfWidth?:  number;
      startIdx?:   number;
      endIdx?:     number;
      northM?:     number;   // 北方向移動 (m)
      eastM?:      number;   // 東方向移動 (m)
    },
  ) => {
    if (!zone.corridorPath) return;

    const path     = zone.corridorPath;
    let   hw       = changes.halfWidth  ?? zone.corridorHalfWidth ?? CORRIDOR_HALF_WIDTH;
    let   si       = changes.startIdx  ?? zone.corridorStartIdx  ?? 0;
    let   ei       = changes.endIdx    ?? zone.corridorEndIdx    ?? path.length - 1;

    hw = Math.max(0.25, Math.min(8, hw));
    si = Math.max(0, Math.min(ei - 1, si));
    ei = Math.min(path.length - 1, Math.max(si + 1, ei));

    // 位置移動: corridorPath 全体をオフセット
    let newPath = path;
    if ((changes.northM ?? 0) !== 0 || (changes.eastM ?? 0) !== 0) {
      newPath = path.map((p) => nudgeGeoPoint(p, changes.northM ?? 0, changes.eastM ?? 0));
    }

    const slice   = newPath.slice(si, ei + 1);
    const polygon = createCornerCorridor(slice, hw);

    updateZone(zone.id, {
      polygon,
      corridorPath:      newPath,
      corridorHalfWidth: hw,
      corridorStartIdx:  si,
      corridorEndIdx:    ei,
    });
  }, [updateZone]);

  // ── AI コーナー検知 ──
  const analyzeCorners = useCallback(() => {
    // 閾値 1.2°/m: 緩やかなコーナーも検知できる感度
    // smoothWindow 6m: 短いコースでも安定した曲率推定
    // minCornerLength 3m: 小さいコーナーも取りこぼさない
    // mergeDistance 15m: 近接コーナーをまとめすぎない
    const corners = detectCorners(tracePath, 1.2, 6, 3, 15);
    setDetectedCorners(corners);
    setShowCornerPreview(true);
  }, [tracePath]);

  const autoCreateZones = useCallback(() => {
    if (detectedCorners.length === 0) return;

    const newZones: ScoringZone[] = detectedCorners
      .map((c, i) => {
        // コーナーの点列から 2m 幅のコリドー・ポリゴンを生成
        const corridor = createCornerCorridor(c.points, CORRIDOR_HALF_WIDTH);
        if (corridor.length < 4) return null;   // 点が少なすぎる場合はスキップ
        return {
          id: uid(),
          name: `コーナー ${i + 1}`,
          zoneShape: 'polygon' as const,
          polygon: corridor,
          multiplier: 1.5,
          color: ZONE_COLORS[i % ZONE_COLORS.length],
          // 調整用メタデータ
          corridorPath:      c.points,
          corridorHalfWidth: CORRIDOR_HALF_WIDTH,
          corridorStartIdx:  0,
          corridorEndIdx:    c.points.length - 1,
        } satisfies ScoringZone;
      })
      .filter((z): z is ScoringZone => z !== null);

    setZones((prev) => [...prev, ...newZones]);
    cancelTrace();
    setDetectedCorners([]);
    setShowCornerPreview(false);
    Alert.alert(
      'ゾーン自動作成',
      `${newZones.length} つのコーナーゾーン（幅 ${CORRIDOR_HALF_WIDTH * 2}m）を作成しました。\n各ゾーンの倍率は個別に調整できます。`,
    );
  }, [detectedCorners, cancelTrace]);

  // ── ゾーン確定 ──
  const handleFinalizeZone = useCallback(() => {
    if (drawMode === 'trace') {
      if (tracePath.length < 3) { Alert.alert('ゾーン設定', 'もう少し長くなぞってください。'); return; }
    } else if (drawMode === 'polygon') {
      if (polygonPoints.length < 3) { Alert.alert('ゾーン設定', '3点以上タップしてください。'); return; }
    } else {
      if (!circleCenter) { Alert.alert('ゾーン設定', 'マップをタップして中心を設定してください。'); return; }
    }
    setShowZoneDialog(true);
  }, [drawMode, tracePath, polygonPoints, circleCenter]);

  const handleZoneConfirm = useCallback((name: string, multiplier: number) => {
    const color = ZONE_COLORS[zones.length % ZONE_COLORS.length];
    let newZone: ScoringZone;
    if (drawMode === 'trace') {
      // 表示パス (Chaikin 済み) をゾーンポリゴンとして保存 → なめらかな境界
      newZone = { id: uid(), name, zoneShape: 'polygon', polygon: traceDisplayPath.length > 2 ? traceDisplayPath : tracePath, multiplier, color };
    } else if (drawMode === 'polygon') {
      newZone = { id: uid(), name, zoneShape: 'polygon', polygon: polygonPoints, multiplier, color };
    } else {
      newZone = { id: uid(), name, zoneShape: 'circle', polygon: [], center: circleCenter!, radius: circleRadius, multiplier, color };
    }
    setZones((p) => [...p, newZone]);
    tracePathRef.current = []; currentStrokeRef.current = [];
    traceHistoryRef.current = [];
    setTracePath([]); setTraceDisplayPath([]); setTraceFinished(false);
    setCanUndoTrace(false);
    setPolygonPoints([]);
    setCircleCenter(null); setCircleRadius(DEFAULT_ZONE_RADIUS);
    setDetectedCorners([]); setShowCornerPreview(false);
    setShowZoneDialog(false);
  }, [drawMode, tracePath, polygonPoints, circleCenter, circleRadius, zones.length]);

  // ── アンドゥ ──
  const handleUndo = useCallback(() => {
    switch (mode) {
      case 'boundary': setBoundary((p) => p.slice(0, -1)); break;
      case 'start':    setStartPoint(null); break;
      case 'end':      setEndPoint(null); break;
      case 'zone':
        if (drawMode === 'trace')   { cancelTrace(); break; }
        if (drawMode === 'polygon') { setPolygonPoints((p) => p.slice(0, -1)); break; }
        setCircleCenter(null); break;
    }
  }, [mode, drawMode, cancelTrace]);

  // ── 保存 ──
  const handleSave = useCallback(() => {
    if (!startPoint) { Alert.alert('保存エラー', 'スタート地点（START）を設定してください。'); return; }
    setShowNameInput(true);
  }, [startPoint]);

  const handleNameConfirm = useCallback(async () => {
    if (!startPoint || isSaving) return;
    setIsSaving(true);
    try {
      const name = courseName.trim() || `コース ${new Date().toLocaleDateString('ja-JP')}`;
      const draft: Course = {
        id: params.id ?? uid(), name, boundary, startPoint, startRadius,
        endPoint: endPoint ?? undefined, endRadius: endPoint ? endRadius : undefined,
        scoringZones: zones, savedAt: new Date().toISOString(),
        scoringProfile,   // 手動調整済みまたは AI 生成済みプロファイル
      };
      // AI でコースタイプを自動判定して保存
      const course: Course = { ...draft, courseType: detectCourseType(draft) };
      await saveCourse(course);
      setShowNameInput(false);
      Alert.alert(
        isEdit ? '更新完了' : '保存完了',
        `「${name}」を${isEdit ? '更新' : '保存'}しました。`,
        [{
          text: 'OK',
          onPress: () => {
            // courses 一覧へ確実に戻る（スタックをクリーンに保つ）
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/courses');
            }
          },
        }],
      );
    } catch (err) {
      Alert.alert('保存エラー', `保存に失敗しました。\n${String(err)}`);
    } finally {
      setIsSaving(false);
    }
  }, [courseName, boundary, startPoint, startRadius, endPoint, endRadius, zones, params.id, isEdit, isSaving]);

  const cycleMapType = useCallback(() => {
    setMapType((p) => MAP_TYPE_SEQ[(MAP_TYPE_SEQ.indexOf(p) + 1) % MAP_TYPE_SEQ.length]);
  }, []);

  const goToMyLocation = useCallback(() => {
    if (!userLocation) return;
    mapRef.current?.animateToRegion({ ...userLocation, latitudeDelta: 0.001, longitudeDelta: 0.001 }, 400);
  }, [userLocation]);

  const handleDrawModeChange = useCallback((dm: DrawMode) => {
    setDrawMode(dm);
    setPolygonPoints([]); setCircleCenter(null); setCircleRadius(DEFAULT_ZONE_RADIUS);
    cancelTrace();
  }, [cancelTrace]);

  const zoneColor = ZONE_COLORS[zones.length % ZONE_COLORS.length];

  // ヒント
  const hintText = (() => {
  const s = useS();
    if (mode === 'boundary') return 'タップして境界点を追加（3点以上で境界確定）';
    if (mode === 'start') return startPoint ? '半径を調整 — この円内でセッションが自動スタート' : 'タップしてスタート地点を設定';
    if (mode === 'end')   return endPoint   ? '半径を調整 — この円内でゴール判定' : 'タップしてゴール地点を設定（省略可）';
    if (drawMode === 'trace') {
      if (isDrawingTrace) return '指を離してもOK — ズームして「続きを描く」で追記できます';
      if (showCornerPreview) return `${detectedCorners.length} コーナーを検知 — AUTO ZONES で一括作成`;
      if (traceFinished) return `パス確定 (${tracePath.length}pt) — 続きを追記 / AI検知 / ゾーン確定`;
      return '地図を拡大 → DRAW START でなぞる（複数回に分けてOK）';
    }
    if (drawMode === 'polygon') return 'タップで多角形ゾーンを描く（3点以上）';
    if (drawMode === 'circle') return circleCenter ? '半径を調整して確定' : 'コーナー中心をタップ';
    return '';
  })();

  const initialRegion = userLocation
    ? { ...userLocation, latitudeDelta: 0.002, longitudeDelta: 0.002 }
    : { latitude: 35.6762, longitude: 139.6503, latitudeDelta: 0.002, longitudeDelta: 0.002 };

  return (
    <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
      {/* ── ツールバー ── */}
      <View style={s.toolbar}>
        <GamePressable onPress={() => router.back()} style={({ pressed }) => [s.tbBtn, pressed && { opacity: 0.5 }]} hitSlop={8}>
          <Text style={s.backText}>← BACK</Text>
        </GamePressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={s.tbTitle}>{isEdit ? 'EDIT COURSE' : 'NEW COURSE'}</Text>
          {/* AI コースタイプバッジ (リアルタイムプレビュー) */}
          {(startPoint || boundary.length > 0) && (() => {
            const draft: Course = {
              id: 'preview', name: '', boundary, startPoint: startPoint ?? boundary[0] ?? { latitude: 0, longitude: 0 },
              startRadius: 30, endPoint: endPoint ?? undefined,
              scoringZones: [], savedAt: '',
            };
            const ct = detectCourseType(draft);
            if (ct === 'unknown') return null;
            const isCircuit = ct === 'circuit';
            return (
              <View style={[s.typeBadge, { borderColor: isCircuit ? colors.neonGreen + '99' : colors.amber + '99' }]}>
                <Text style={[s.typeBadgeText, { color: isCircuit ? colors.neonGreen : colors.amber }]}>
                  {isCircuit ? '⟳ CIRCUIT' : '↔ STREET'}
                </Text>
              </View>
            );
          })()}
        </View>
        <GamePressable onPress={handleSave} disabled={isSaving}
          style={({ pressed }) => [s.tbBtn, { alignItems: 'flex-end' }, (pressed || isSaving) && { opacity: 0.6 }]}>
          <Text style={s.saveText}>{isSaving ? '保存中…' : isEdit ? '更新' : 'SAVE'}</Text>
        </GamePressable>
      </View>

      {/* ── モードタブ ── */}
      <View style={s.modeBar}>
        {(['boundary', 'start', 'end', 'zone'] as EditorMode[]).map((m) => (
          <GamePressable key={m} onPress={() => setMode(m)} style={[s.modeTab, mode === m && s.modeTabActive]}>
            <Text style={[s.modeTabText, mode === m && s.modeTabTextActive]}>{MODE_LABELS[m]}</Text>
          </GamePressable>
        ))}
      </View>

      {/* ── ゾーン描画モード (zone タブ時のみ) ── */}
      {mode === 'zone' && (
        <View style={s.shapeBar}>
          {(['trace', 'polygon', 'circle'] as DrawMode[]).map((dm) => (
            <GamePressable key={dm} onPress={() => handleDrawModeChange(dm)}
              style={[s.shapeBtn, drawMode === dm && s.shapeBtnActive]}>
              <Text style={[s.shapeBtnText, drawMode === dm && s.shapeBtnTextActive]}>
                {DRAW_MODE_LABELS[dm]}
              </Text>
              {dm === 'trace' && <Text style={s.shapeSub}>コーナーAI検知</Text>}
              {dm === 'circle' && <Text style={s.shapeSub}>コーナー向け</Text>}
            </GamePressable>
          ))}
        </View>
      )}

      {/* ── ヒント ── */}
      <View style={[s.hint, isDrawingTrace && s.hintActive]}>
        <Text style={[s.hintText, isDrawingTrace && s.hintTextActive]}>{hintText}</Text>
      </View>

      {/* ── マップ ── */}
      <View style={s.mapContainer}
        onLayout={(e) => {
          mapLayoutRef.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
        }}
      >
        <MapView
          ref={mapRef}
          style={s.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={initialRegion}
          onPress={handleMapPress}
          onRegionChange={(r) => { mapRegionRef.current = r; }}
          onMapReady={() => {
            mapReadyRef.current = true;
            if (pendingRegionRef.current) {
              mapRef.current?.animateToRegion(pendingRegionRef.current, 600);
              pendingRegionRef.current = null;
            }
          }}
          showsUserLocation
          showsMyLocationButton={false}
          mapType={mapType}
          scrollEnabled={!isDrawingTrace}
          zoomEnabled={!isDrawingTrace}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          {/* 境界 */}
          {boundary.length >= 3 && (
            <Polygon coordinates={boundary} fillColor="rgba(0,255,136,0.08)" strokeColor="rgba(0,255,136,0.75)" strokeWidth={2} />
          )}
          {boundary.length >= 2 && boundary.length < 3 && (
            <Polyline coordinates={boundary} strokeColor="rgba(0,255,136,0.75)" strokeWidth={2} />
          )}
          {boundary.map((pt, i) => (
            <Marker key={`b${i}`} coordinate={pt} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={s.bdDot} />
            </Marker>
          ))}

          {/* START */}
          {startPoint && (
            <>
              <Circle center={startPoint} radius={startRadius}
                fillColor="rgba(0,255,136,0.12)" strokeColor="rgba(0,255,136,0.70)" strokeWidth={2} />
              <Marker coordinate={startPoint} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={s.startMarker}><Text style={s.startText}>S</Text></View>
              </Marker>
            </>
          )}

          {/* END */}
          {endPoint && (
            <>
              <Circle center={endPoint} radius={endRadius}
                fillColor="rgba(255,68,68,0.12)" strokeColor="rgba(255,68,68,0.70)" strokeWidth={2} />
              <Marker coordinate={endPoint} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={s.endMarker}><Text style={s.endText}>G</Text></View>
              </Marker>
            </>
          )}

          {/* 保存済みゾーン */}
          {zones.map((zone) => {
            const isSelected = selectedZoneId === zone.id;
            const fill   = isSelected ? zone.color + '55' : zone.color + '33';
            const stroke = isSelected ? zone.color        : zone.color + 'CC';
            const sw     = isSelected ? 3.5 : 2.5;
            return zone.zoneShape === 'circle' && zone.center && zone.radius ? (
              <Circle key={zone.id} center={zone.center} radius={zone.radius}
                fillColor={fill} strokeColor={stroke} strokeWidth={sw}
                onPress={() => setSelectedZoneId((id) => id === zone.id ? null : zone.id)} />
            ) : (
              <Polygon key={zone.id} coordinates={zone.polygon}
                fillColor={fill} strokeColor={stroke} strokeWidth={sw}
                tappable onPress={() => setSelectedZoneId((id) => id === zone.id ? null : zone.id)} />
            );
          })}
          {zones.map((zone) => {
            const center = zone.zoneShape === 'circle' && zone.center
              ? zone.center
              : zone.polygon[Math.floor(zone.polygon.length / 2)];
            if (!center) return null;
            return (
              <Marker key={`zl${zone.id}`} coordinate={center} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={[s.zoneLabel, { backgroundColor: zone.color + 'DD' }]}>
                  <Text style={s.zoneLabelText}>×{zone.multiplier}</Text>
                </View>
              </Marker>
            );
          })}

          {/* なぞりパス: 描画中は生データ、完了後は Chaikin スムーズ曲線 */}
          {isDrawingTrace && tracePath.length >= 2 && (
            <Polyline coordinates={tracePath}
              strokeColor={zoneColor} strokeWidth={3} />
          )}
          {!isDrawingTrace && traceDisplayPath.length >= 2 && (
            <Polyline coordinates={traceDisplayPath}
              strokeColor={zoneColor + 'DD'} strokeWidth={3} />
          )}
          {/* なぞり両端マーカー */}
          {!isDrawingTrace && tracePath.length > 0 && [tracePath[0], tracePath[tracePath.length - 1]].map((pt, i) => (
            <Marker key={`te${i}`} coordinate={pt} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={[s.traceEndDot, { borderColor: zoneColor }]} />
            </Marker>
          ))}

          {/* AI 検知コーナー — コリドー形状プレビュー */}
          {showCornerPreview && detectedCorners.map((c, i) => {
            const corridor = createCornerCorridor(c.points, CORRIDOR_HALF_WIDTH);
            return corridor.length >= 4 ? (
              <Polygon key={`ca${i}`}
                coordinates={corridor}
                fillColor={colors.amber + '50'}
                strokeColor={colors.amber + 'EE'}
                strokeWidth={2} />
            ) : null;
          })}
          {showCornerPreview && detectedCorners.map((c, i) => (
            <Marker key={`cl${i}`} coordinate={c.apexPoint} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={s.cornerLabel}>
                <Text style={s.cornerLabelText}>C{i + 1}  {Math.round(c.totalTurnAngle)}°</Text>
              </View>
            </Marker>
          ))}

          {/* 点打ちゾーン */}
          {drawMode === 'polygon' && polygonPoints.length >= 2 && (
            <Polyline coordinates={polygonPoints} strokeColor={zoneColor + 'CC'} strokeWidth={2} lineDashPattern={[6, 4]} />
          )}
          {drawMode === 'polygon' && polygonPoints.map((pt, i) => (
            <Marker key={`zp${i}`} coordinate={pt} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={[s.zoneDot, { backgroundColor: zoneColor }]} />
            </Marker>
          ))}

          {/* サークルゾーン */}
          {drawMode === 'circle' && circleCenter && (
            <>
              <Circle center={circleCenter} radius={circleRadius}
                fillColor={zoneColor + '30'} strokeColor={zoneColor + 'CC'} strokeWidth={2.5} />
              <Marker coordinate={circleCenter} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                <View style={[s.circleDot, { borderColor: zoneColor }]} />
              </Marker>
            </>
          )}
        </MapView>

        {/* ── マップ検索 ── */}
        {!isDrawingTrace && (
          <MapSearchBar
            top={12}
            right={12}
            onResult={(lat, lon) => {
              mapRef.current?.animateToRegion(
                { latitude: lat, longitude: lon, latitudeDelta: 0.008, longitudeDelta: 0.008 },
                500,
              );
            }}
          />
        )}

        {/* なぞり描きオーバーレイ */}
        {isDrawingTrace && (
          <View style={s.drawOverlay} {...drawPanResponder.panHandlers}>
            <View style={s.drawBadge}>
              <Text style={s.drawBadgeText}>✏ DRAWING — 指でコースをなぞる</Text>
            </View>
          </View>
        )}

        {/* マップコントロール */}
        <View style={s.mapBtns}>
          <GamePressable onPress={cycleMapType} style={({ pressed }) => [s.mapBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.mapBtnText}>{MAP_TYPE_LABELS[mapType]}</Text>
          </GamePressable>
          <GamePressable onPress={goToMyLocation} style={({ pressed }) => [s.mapBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.mapBtnText}>◎</Text>
          </GamePressable>
        </View>
      </View>

      {/* ── ボトムコントロール ── */}
      <View style={s.controls}>
        {/* UNDO は常に表示 */}
        <GamePressable onPress={handleUndo} disabled={isDrawingTrace}
          style={({ pressed }) => [s.ctrlBtn, pressed && { opacity: 0.6 }, isDrawingTrace && s.ctrlBtnDim]}>
          <Text style={[s.ctrlBtnText, isDrawingTrace && s.ctrlBtnTextDim]}>↩ UNDO</Text>
        </GamePressable>

        {/* START モード: 半径調整 */}
        {mode === 'start' && startPoint && (
          <View style={{ flex: 1 }}>
            <RadiusControl label="START 半径" value={startRadius}
              onChange={setStartRadius} min={RADIUS_MIN} max={RADIUS_MAX} />
          </View>
        )}

        {/* END モード: 半径調整 */}
        {mode === 'end' && endPoint && (
          <View style={{ flex: 1 }}>
            <RadiusControl label="GOAL 半径" value={endRadius}
              onChange={setEndRadius} min={RADIUS_MIN} max={RADIUS_MAX} />
          </View>
        )}

        {/* なぞりモード制御 */}
        {mode === 'zone' && drawMode === 'trace' && !traceFinished && !isDrawingTrace && (
          <>
            <GamePressable onPress={startTrace} style={({ pressed }) => [s.ctrlBtnPrimary, pressed && { opacity: 0.8 }]}>
              <Text style={s.ctrlBtnPrimaryText}>✏  DRAW START</Text>
            </GamePressable>
          </>
        )}
        {/* 描画中 — ストローク数表示 */}
        {mode === 'zone' && drawMode === 'trace' && isDrawingTrace && (
          <Text style={s.drawingLabel}>
            ✏ DRAWING{tracePath.length > 0 ? `  (${tracePath.length} pts)` : ''}
          </Text>
        )}
        {mode === 'zone' && drawMode === 'trace' && traceFinished && !showCornerPreview && (
          <>
            {/* 続きを描く — 拡大して追記可能 */}
            <GamePressable onPress={continueTrace} style={({ pressed }) => [s.ctrlBtnPrimary, pressed && { opacity: 0.8 }]}>
              <Text style={s.ctrlBtnPrimaryText}>➕ 続きを描く</Text>
            </GamePressable>
            {/* 1ストローク前に戻る */}
            {canUndoTrace && (
              <GamePressable onPress={undoLastSegment} style={({ pressed }) => [s.ctrlBtnUndo, pressed && { opacity: 0.7 }]}>
                <Text style={s.ctrlBtnUndoText}>↩ 1つ戻る</Text>
              </GamePressable>
            )}
            <GamePressable onPress={analyzeCorners} style={({ pressed }) => [s.ctrlBtnAmber, pressed && { opacity: 0.8 }]}>
              <Text style={s.ctrlBtnAmberText}>🔍 AI検知</Text>
            </GamePressable>
            <GamePressable onPress={handleFinalizeZone} style={({ pressed }) => [s.ctrlBtnAccent, pressed && { opacity: 0.8 }]}>
              <Text style={s.ctrlBtnAccentText}>✓ 確定</Text>
            </GamePressable>
            <GamePressable onPress={cancelTrace} style={({ pressed }) => [s.ctrlBtn, pressed && { opacity: 0.6 }]}>
              <Text style={s.ctrlBtnText}>✕ 全消</Text>
            </GamePressable>
          </>
        )}
        {mode === 'zone' && drawMode === 'trace' && showCornerPreview && detectedCorners.length > 0 && (
          <>
            <GamePressable onPress={autoCreateZones} style={({ pressed }) => [s.ctrlBtnPrimary, pressed && { opacity: 0.8 }]}>
              <Text style={s.ctrlBtnPrimaryText}>⚡ AUTO ZONES ({detectedCorners.length})</Text>
            </GamePressable>
            <GamePressable onPress={() => setShowCornerPreview(false)} style={({ pressed }) => [s.ctrlBtn, pressed && { opacity: 0.6 }]}>
              <Text style={s.ctrlBtnText}>キャンセル</Text>
            </GamePressable>
          </>
        )}
        {mode === 'zone' && drawMode === 'trace' && showCornerPreview && detectedCorners.length === 0 && (
          <Text style={s.noCornerText}>コーナーが検知されませんでした。ゆっくりなぞり直してください。</Text>
        )}

        {/* 点打ちモード */}
        {mode === 'zone' && drawMode === 'polygon' && (
          <>
            {polygonPoints.length > 0 && (
              <GamePressable onPress={() => setPolygonPoints([])} style={({ pressed }) => [s.ctrlBtn, pressed && { opacity: 0.6 }]}>
                <Text style={s.ctrlBtnText}>✕ CLEAR</Text>
              </GamePressable>
            )}
            <GamePressable onPress={handleFinalizeZone} disabled={polygonPoints.length < 3}
              style={({ pressed }) => [s.ctrlBtnAccent, pressed && { opacity: 0.8 }, polygonPoints.length < 3 && s.ctrlBtnDim]}>
              <Text style={[s.ctrlBtnAccentText, polygonPoints.length < 3 && s.ctrlBtnTextDim]}>
                ✓ ゾーン確定 ({polygonPoints.length}pts)
              </Text>
            </GamePressable>
          </>
        )}

        {/* サークルモード */}
        {mode === 'zone' && drawMode === 'circle' && circleCenter && (
          <>
            <View style={{ flex: 1 }}>
              <RadiusControl label="半径" value={circleRadius}
                onChange={(v) => setCircleRadius(Math.max(5, Math.min(ZONE_RADIUS_MAX, v)))}
                min={5} max={ZONE_RADIUS_MAX} />
            </View>
            <GamePressable onPress={handleFinalizeZone} style={({ pressed }) => [s.ctrlBtnAccent, pressed && { opacity: 0.8 }]}>
              <Text style={s.ctrlBtnAccentText}>✓ 確定</Text>
            </GamePressable>
          </>
        )}

        {/* 境界クリア */}
        {mode === 'boundary' && boundary.length >= 3 && (
          <GamePressable onPress={() => setBoundary([])} style={({ pressed }) => [s.ctrlBtn, pressed && { opacity: 0.6 }]}>
            <Text style={s.ctrlBtnText}>✕ 境界クリア</Text>
          </GamePressable>
        )}

        {/* ── SCORING モード: プロファイル編集 ── */}
        {mode === 'scoring' && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {(() => {
              // AI 分析結果をリアルタイム計算してサマリー表示
              const roadW  = boundary.length >= 3 ? estimateRoadWidthM(boundary) : null;
              const crs    = boundary.length >= 6 ? detectCorners(boundary) : [];
              const icd    = crs.length >= 2 ? analyzeInterCornerDistances(boundary, crs) : null;
              return (
                <View style={sp.aiSummary}>
                  <Text style={sp.aiSummaryTitle}>AI 解析サマリー</Text>
                  <View style={sp.aiRow}>
                    <Text style={sp.aiLabel}>道幅（推定）</Text>
                    <Text style={sp.aiVal}>
                      {roadW != null ? `${roadW.toFixed(1)} m` : '— m'}
                      {roadW != null ? (roadW < 4 ? '  〔狭〕' : roadW > 7 ? '  〔広〕' : '  〔標準〕') : ''}
                    </Text>
                  </View>
                  <View style={sp.aiRow}>
                    <Text style={sp.aiLabel}>コーナー数</Text>
                    <Text style={sp.aiVal}>{crs.length} 個</Text>
                  </View>
                  {icd && (
                    <>
                      <View style={sp.aiRow}>
                        <Text style={sp.aiLabel}>コーナー間 中央値</Text>
                        <Text style={sp.aiVal}>{icd.medianM.toFixed(0)} m</Text>
                      </View>
                      <View style={sp.aiRow}>
                        <Text style={sp.aiLabel}>コーナー間 最大</Text>
                        <Text style={sp.aiVal}>{icd.maxM.toFixed(0)} m
                          {icd.maxM > 200 ? '  〔長い直線〕' : ''}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              );
            })()}
            <ScoringProfilePanel
              profile={scoringProfile}
              onChange={setScoringProfile}
              onAutoDetect={() => {
                const draft: Course = {
                  id: 'preview', name: '', boundary,
                  startPoint: startPoint ?? boundary[0] ?? { latitude: 0, longitude: 0 },
                  startRadius: 30, endPoint: endPoint ?? undefined,
                  scoringZones: zones, savedAt: '',
                };
                setScoringProfile(detectScoringProfile(draft));
              }}
            />
          </ScrollView>
        )}
      </View>

      {/* ── ゾーン調整パネル（選択中ゾーンがある場合） ── */}
      {(() => {
        const sel = selectedZoneId ? zones.find((z) => z.id === selectedZoneId) : null;
        if (!sel) return null;
        const isCorridor = !!sel.corridorPath;
        const hw    = sel.corridorHalfWidth ?? CORRIDOR_HALF_WIDTH;
        const si    = sel.corridorStartIdx  ?? 0;
        const ei    = sel.corridorEndIdx    ?? (sel.corridorPath?.length ?? 1) - 1;
        const arcM  = isCorridor ? corridorArcLength(sel.corridorPath!, si, ei) : 0;
        const NUDGE = 0.5;
        return (
          <View style={[s.adjustPanel, { borderColor: sel.color + '88' }]}>
            {/* ヘッダー: 名前インライン編集 */}
            <View style={s.adjustHeader}>
              <View style={[s.adjustColorDot, { backgroundColor: sel.color }]} />
              {editingZoneName !== null ? (
                <TextInput
                  style={[s.adjustNameInput, { borderColor: sel.color + '88', color: sel.color }]}
                  value={editingZoneName}
                  onChangeText={setEditingZoneName}
                  onBlur={() => {
                    const trimmed = editingZoneName.trim();
                    if (trimmed) updateZone(sel.id, { name: trimmed });
                    setEditingZoneName(null);
                  }}
                  onSubmitEditing={() => {
                    const trimmed = editingZoneName.trim();
                    if (trimmed) updateZone(sel.id, { name: trimmed });
                    setEditingZoneName(null);
                  }}
                  autoFocus
                  returnKeyType="done"
                  maxLength={24}
                />
              ) : (
                <GamePressable style={{ flex: 1 }} onPress={() => setEditingZoneName(sel.name)} hitSlop={4}>
                  <Text style={[s.adjustTitle, { color: sel.color }]}>{sel.name}  <Text style={s.adjustNameEditHint}>✎</Text></Text>
                </GamePressable>
              )}
              <GamePressable onPress={() => { setSelectedZoneId(null); setEditingZoneName(null); }} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }}>
                <Text style={s.adjustClose}>✕</Text>
              </GamePressable>
            </View>

            {/* 倍率 */}
            <View style={s.adjustRow}>
              <Text style={s.adjustLabel}>MULT</Text>
              <GamePressable onPress={() => updateZone(sel.id, { multiplier: Math.max(0.5, parseFloat((sel.multiplier - 0.5).toFixed(1))) })} style={s.adjBtn}><Text style={s.adjBtnTxt}>−</Text></GamePressable>
              <Text style={s.adjustValue}>×{sel.multiplier.toFixed(1)}</Text>
              <GamePressable onPress={() => updateZone(sel.id, { multiplier: Math.min(5.0, parseFloat((sel.multiplier + 0.5).toFixed(1))) })} style={s.adjBtn}><Text style={s.adjBtnTxt}>＋</Text></GamePressable>
            </View>

            {hasZoneBestRecord(sel) ? (
              <View style={s.adjustBestWrap}>
                <ZoneBestStats zone={sel} />
              </View>
            ) : null}

            {isCorridor && (<>
              {/* 幅 */}
              <View style={s.adjustRow}>
                <Text style={s.adjustLabel}>WIDTH</Text>
                <GamePressable onPress={() => adjustCorridor(sel, { halfWidth: hw - 0.25 })} style={s.adjBtn}><Text style={s.adjBtnTxt}>−</Text></GamePressable>
                <Text style={s.adjustValue}>{(hw * 2).toFixed(2)}m</Text>
                <GamePressable onPress={() => adjustCorridor(sel, { halfWidth: hw + 0.25 })} style={s.adjBtn}><Text style={s.adjBtnTxt}>＋</Text></GamePressable>
              </View>

              {/* 長さ（前後トリム） */}
              <View style={s.adjustRow}>
                <Text style={s.adjustLabel}>LENGTH</Text>
                <GamePressable onPress={() => adjustCorridor(sel, { startIdx: si + 1 })} style={s.adjBtn}><Text style={s.adjBtnTxt}>前◄</Text></GamePressable>
                <GamePressable onPress={() => adjustCorridor(sel, { startIdx: si - 1 })} style={[s.adjBtn, { marginRight: 2 }]}><Text style={s.adjBtnTxt}>◄伸</Text></GamePressable>
                <Text style={s.adjustValue}>{arcM.toFixed(1)}m</Text>
                <GamePressable onPress={() => adjustCorridor(sel, { endIdx: ei + 1 })} style={[s.adjBtn, { marginLeft: 2 }]}><Text style={s.adjBtnTxt}>伸►</Text></GamePressable>
                <GamePressable onPress={() => adjustCorridor(sel, { endIdx: ei - 1 })} style={s.adjBtn}><Text style={s.adjBtnTxt}>►後</Text></GamePressable>
              </View>

              {/* 位置微調整 */}
              <View style={s.adjustRow}>
                <Text style={s.adjustLabel}>MOVE</Text>
                <View style={s.nudgePad}>
                  <GamePressable onPress={() => adjustCorridor(sel, { northM: NUDGE })} style={s.nudgeBtn}><Text style={s.nudgeTxt}>↑</Text></GamePressable>
                  <View style={s.nudgeMidRow}>
                    <GamePressable onPress={() => adjustCorridor(sel, { eastM: -NUDGE })} style={s.nudgeBtn}><Text style={s.nudgeTxt}>←</Text></GamePressable>
                    <View style={s.nudgeCenter} />
                    <GamePressable onPress={() => adjustCorridor(sel, { eastM: NUDGE })} style={s.nudgeBtn}><Text style={s.nudgeTxt}>→</Text></GamePressable>
                  </View>
                  <GamePressable onPress={() => adjustCorridor(sel, { northM: -NUDGE })} style={s.nudgeBtn}><Text style={s.nudgeTxt}>↓</Text></GamePressable>
                </View>
                <Text style={s.nudgeStepLabel}>{NUDGE}m/tap</Text>
              </View>
            </>)}

            {/* 削除 */}
            <GamePressable
              onPress={() => {
                setZones((prev) => renumberCornerZones(prev.filter((z) => z.id !== sel.id)));
                setSelectedZoneId(null);
                setEditingZoneName(null);
              }}
              style={({ pressed }) => [s.adjustDeleteBtn, pressed && { opacity: 0.7 }]}>
              <Text style={s.adjustDeleteTxt}>🗑  このゾーンを削除</Text>
            </GamePressable>
          </View>
        );
      })()}

      {/* ── 保存済みゾーン一覧 ── */}
      {zones.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.zoneList} contentContainerStyle={s.zoneListContent}>
          {zones.map((zone) => (
            <GamePressable
              key={zone.id}
              onPress={() => {
                const isAlreadySelected = selectedZoneId === zone.id;
                setSelectedZoneId(isAlreadySelected ? null : zone.id);
                setEditingZoneName(null);
                if (!isAlreadySelected) flyToZone(zone);  // ← マップ移動
              }}
              style={[s.zoneChip, { borderColor: zone.color }, selectedZoneId === zone.id && s.zoneChipSelected]}>
              <Text style={s.zoneChipShape}>{zone.corridorPath ? '⬛' : zone.zoneShape === 'circle' ? '●' : '◼'}</Text>
              <Text style={[s.zoneChipName, { color: zone.color }]}>{zone.name}</Text>
              <Text style={[s.zoneChipMult, { color: zone.color }]}>×{zone.multiplier}</Text>
              {hasZoneBestRecord(zone) ? (
                <ZoneBestStats zone={zone} compact />
              ) : null}
              {!selectedZoneId && (
                <GamePressable
                  onPress={() => setZones((prev) => renumberCornerZones(prev.filter((z) => z.id !== zone.id)))}
                  hitSlop={6}
                  style={({ pressed }) => pressed && { opacity: 0.5 }}>
                  <Text style={[s.zoneChipDel, { color: zone.color }]}>✕</Text>
                </GamePressable>
              )}
            </GamePressable>
          ))}
        </ScrollView>
      )}

      {/* ダイアログ */}
      <ZoneDialog visible={showZoneDialog}
        defaultName={drawMode === 'trace' ? 'ゾーン' : drawMode === 'circle' ? 'コーナー' : ''}
        onConfirm={handleZoneConfirm} onCancel={() => setShowZoneDialog(false)} />

      <Modal transparent visible={showNameInput} animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={dlg.overlay}>
          <View style={dlg.box}>
            <Text style={dlg.title}>{isEdit ? 'コース名を更新' : 'コース名を入力'}</Text>
            <TextInput style={dlg.input} value={courseName} onChangeText={setCourseName}
              placeholder="例: 峠コースA" placeholderTextColor={colors.textMuted}
              autoFocus returnKeyType="done" onSubmitEditing={handleNameConfirm} />
            <View style={dlg.actions}>
              <GamePressable onPress={() => setShowNameInput(false)} disabled={isSaving} style={dlg.cancelBtn}>
                <Text style={dlg.cancelText}>キャンセル</Text>
              </GamePressable>
              <GamePressable onPress={handleNameConfirm} disabled={isSaving}
                style={[dlg.confirmBtn, isSaving && { opacity: 0.5 }]}>
                <Text style={dlg.confirmText}>{isSaving ? '保存中…' : isEdit ? '更新する' : '保存する'}</Text>
              </GamePressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────
// スタイル
// ────────────────────────────────────────────────────────────────
function createS(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },

  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  tbBtn: { minWidth: 60 },
  backText: { ...typography.label, color: colors.neonGreen, fontSize: 9 },
  tbTitle: { ...typography.label, color: colors.textPrimary, fontSize: 12 },
  saveText: { ...typography.label, color: colors.neonGreen, fontSize: 9 },
  typeBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  typeBadgeText: { ...typography.label, fontSize: 8, fontWeight: '700' },

  modeBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  modeTab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRightWidth: 1, borderRightColor: colors.border },
  modeTabActive: { backgroundColor: colors.neonGreen + '18', borderBottomWidth: 2, borderBottomColor: colors.neonGreen },
  modeTabText: { ...typography.label, color: colors.textMuted, fontSize: 8 },
  modeTabTextActive: { color: colors.neonGreen },

  shapeBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  shapeBtn: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRightWidth: 1, borderRightColor: colors.border },
  shapeBtnActive: { backgroundColor: colors.amber + '18', borderBottomWidth: 2, borderBottomColor: colors.amber },
  shapeBtnText: { ...typography.label, color: colors.textMuted, fontSize: 9 },
  shapeBtnTextActive: { color: colors.amber },
  shapeSub: { ...typography.label, color: colors.textMuted, fontSize: 7, marginTop: 1, textTransform: 'none', letterSpacing: 0 },

  hint: { paddingHorizontal: spacing.md, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  hintActive: { backgroundColor: colors.amber + '15', borderBottomColor: colors.amber + '44' },
  hintText: { ...typography.label, color: colors.textMuted, fontSize: 8, textTransform: 'none', letterSpacing: 0.3 },
  hintTextActive: { color: colors.amber },

  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },

  drawOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.06)', justifyContent: 'flex-start', alignItems: 'center', paddingTop: 12 },
  drawBadge: { backgroundColor: colors.amber + 'CC', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 5 },
  drawBadgeText: { ...typography.label, color: colors.background, fontSize: 10, textTransform: 'none', letterSpacing: 0.5 },

  mapBtns: { position: 'absolute', right: spacing.sm, bottom: spacing.sm, gap: spacing.xs },
  mapBtn: { minWidth: 58, height: 30, borderRadius: 4, backgroundColor: colors.surfaceElevated + 'EE', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  mapBtnText: { color: colors.neonGreen, fontSize: 10, fontWeight: '600' },

  bdDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.neonGreen, borderWidth: 2, borderColor: colors.background },
  startMarker: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.neonGreen, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  startText: { color: colors.background, fontWeight: '800', fontSize: 13 },
  endMarker: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.recRed, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  endText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  zoneDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.background },
  circleDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: 'transparent', borderWidth: 2 },
  zoneLabel: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  zoneLabelText: { color: '#fff', fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  traceEndDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'transparent', borderWidth: 2 },
  cornerLabel: { backgroundColor: colors.amber + 'EE', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  cornerLabelText: { color: colors.background, fontSize: 10, fontWeight: '800' },

  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', minHeight: 52 },
  ctrlBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 3, paddingVertical: 8, paddingHorizontal: spacing.sm, alignItems: 'center' },
  ctrlBtnDim: { opacity: 0.3 },
  ctrlBtnText: { ...typography.label, color: colors.textSecondary, fontSize: 9 },
  ctrlBtnTextDim: { color: colors.textMuted },
  ctrlBtnPrimary: { flex: 1, backgroundColor: colors.neonGreen, borderRadius: 3, paddingVertical: 10, alignItems: 'center' },
  ctrlBtnPrimaryText: { ...typography.label, color: colors.background, fontSize: 10, letterSpacing: 2 },
  ctrlBtnAmber: { flex: 1, backgroundColor: colors.amber, borderRadius: 3, paddingVertical: 10, alignItems: 'center' },
  ctrlBtnAmberText: { ...typography.label, color: colors.background, fontSize: 10 },
  ctrlBtnAccent: { flex: 1, backgroundColor: colors.amber + '22', borderWidth: 1, borderColor: colors.amber, borderRadius: 3, paddingVertical: 8, alignItems: 'center' },
  ctrlBtnAccentText: { ...typography.label, color: colors.amber, fontSize: 9 },
  noCornerText: { flex: 1, ...typography.label, color: colors.textMuted, fontSize: 8, textTransform: 'none', letterSpacing: 0.3 },
  drawingLabel: { flex: 1, ...typography.label, color: colors.neonGreen, fontSize: 9, textTransform: 'none', letterSpacing: 0.5 },
  ctrlBtnUndo: { borderWidth: 1, borderColor: '#6b7280', borderRadius: 3, paddingVertical: 8, paddingHorizontal: spacing.sm, alignItems: 'center', backgroundColor: '#6b728022' },
  ctrlBtnUndoText: { ...typography.label, color: '#9ca3af', fontSize: 9 },

  // ── ゾーン調整パネル ──
  adjustPanel: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface + 'EE', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  adjustHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  adjustColorDot: { width: 8, height: 8, borderRadius: 4 },
  adjustTitle: { flex: 1, ...typography.label, fontSize: 10 },
  adjustClose: { color: colors.textMuted, fontSize: 14, paddingHorizontal: 4 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  adjustLabel: { ...typography.label, color: colors.textMuted, fontSize: 8, width: 50 },
  adjustValue: { ...typography.mono, color: colors.textPrimary, fontSize: 10, minWidth: 46, textAlign: 'center' },
  adjBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 3, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: colors.background },
  adjBtnTxt: { ...typography.label, color: colors.textPrimary, fontSize: 9 },
  nudgePad: { alignItems: 'center', gap: 2 },
  nudgeMidRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  nudgeBtn: { width: 28, height: 24, borderWidth: 1, borderColor: colors.border, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  nudgeTxt: { color: colors.textPrimary, fontSize: 11 },
  nudgeCenter: { width: 16, height: 16 },
  nudgeStepLabel: { ...typography.mono, color: colors.textMuted, fontSize: 8, marginLeft: 4 },
  adjustDeleteBtn: { marginTop: 4, borderWidth: 1, borderColor: '#ef444455', borderRadius: 3, paddingVertical: 5, alignItems: 'center' },
  adjustDeleteTxt: { ...typography.label, color: '#ef4444', fontSize: 9 },
  adjustBestWrap: { marginBottom: 4 },
  adjustNameInput: { flex: 1, borderBottomWidth: 1, paddingVertical: 1, paddingHorizontal: 4, fontSize: 10, fontFamily: 'monospace' },
  adjustNameEditHint: { color: colors.textMuted, fontSize: 9 },
  zoneChipSelected: { backgroundColor: colors.surface },

  zoneList: { maxHeight: 44, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  zoneListContent: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.sm, alignItems: 'center' },
  zoneChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: spacing.sm, paddingVertical: 4, gap: 4 },
  zoneChipShape: { color: colors.textMuted, fontSize: 9 },
  zoneChipName: { ...typography.label, fontSize: 9 },
  zoneChipMult: { ...typography.mono, fontSize: 9, fontWeight: '700' },
  zoneChipR: { ...typography.mono, fontSize: 8 },
  zoneChipDel: { fontSize: 10 },
});
}

function useS() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createS(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
