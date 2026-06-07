/**
 * course-wizard — AIコース自動生成ウィザード
 *
 * Step 1: スタートピンを置く
 * Step 2: ゴールピンを置く  → 既知サーキット候補を表示
 * Step 3: 採点スタイル選択（D1GP風 / FDJ風 / カジュアル）
 * Step 4: コース生成中（ローディング）
 * Step 5: プレビュー + 名前入力
 * Step 6: 保存完了
 */

import { useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import MapView, {
  Marker,
  Polygon,
  Polyline,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import { saveCourse } from '@/lib/courseStore';
import { extractCenterline, generateCourse } from '@/lib/courseGenerator';
import { ALL_PRESETS } from '@/lib/competitionPresets';
import { findNearbyLayouts } from '@/lib/circuitMatcher';
import { fetchRoute, RouteError } from '@/lib/routeService';
import { boundingRegion } from '@/lib/geofence';
import { MapSearchBar } from '@/components/map/MapSearchBar';
import type { CircuitCandidate } from '@/types/competition';
import type { CompetitionPreset } from '@/types/competition';
import { isGoogleMapsConfigured, isOrsConfigured } from '@/lib/appConfig';

// ────────────────────────────────────────────────────────────────
// 型 / 定数
// ────────────────────────────────────────────────────────────────

type WizardStep =
  | 'place_start'
  | 'place_goal'
  | 'select_style'
  | 'generating'
  | 'preview'
  | 'done';

const STEP_LABELS: Record<WizardStep, string> = {
  place_start:   '1 / 5  スタートを置く',
  place_goal:    '2 / 5  ゴールを置く',
  select_style:  '3 / 5  採点スタイル',
  generating:    '4 / 5  生成中…',
  preview:       '5 / 5  プレビュー & 保存',
  done:          '完了',
};

function diffColors(colors: import('@/constants/uiThemes').ThemeColors): Record<CompetitionPreset['gradeDifficulty'], string> {
  return {
    easy:   '#00BFFF',
    normal: colors.neonGreen,
    hard:   colors.amber,
    pro:    colors.recRed,
  };
}

function ApiConfigBanner() {
  const s = useS();
  const messages: string[] = [];

  if (!isOrsConfigured()) {
    messages.push('ORS API キー未設定 — .env に EXPO_PUBLIC_ORS_API_KEY を追加');
  }
  if (Platform.OS === 'android' && !isGoogleMapsConfigured()) {
    messages.push('Google Maps API キー未設定 — Android マップタイルが表示されません');
  }

  if (messages.length === 0) return null;

  return (
    <View style={s.configBanner}>
      <Text style={s.configBannerText}>{messages.join('\n')}</Text>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────────────────────

export default function CourseWizardScreen() {
  const p = useP();
  const s = useS();
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);

  const [step,            setStep]            = useState<WizardStep>('place_start');
  const [startPoint,      setStartPoint]      = useState<GeoPoint | null>(null);
  const [goalPoint,       setGoalPoint]       = useState<GeoPoint | null>(null);
  const [routePath,       setRoutePath]       = useState<GeoPoint[]>([]);
  const [selectedPreset,  setSelectedPreset]  = useState<CompetitionPreset | null>(null);
  const [generatedCourse, setGeneratedCourse] = useState<Course | null>(null);
  const [courseName,      setCourseName]      = useState('');
  const [nearbyCiircuits, setNearbyCircuits]  = useState<CircuitCandidate[]>([]);
  const [errorMsg,        setErrorMsg]        = useState<string | null>(null);

  // ── マップタップ ──
  const handleMapPress = (e: { nativeEvent: { coordinate: GeoPoint } }) => {
    const coord = e.nativeEvent.coordinate;
    if (step === 'place_start') {
      setStartPoint(coord);
      // スタートピン付近のサーキット候補を検索（バックグラウンド）
      const nearby = findNearbyLayouts(coord, 500);
      setNearbyCircuits(nearby);
    } else if (step === 'place_goal') {
      setGoalPoint(coord);
    }
  };

  // ── スタート確定 → ゴールへ ──
  const confirmStart = () => {
    if (!startPoint) return;
    setStep('place_goal');
    // マップをスタートピン中心に
    mapRef.current?.animateToRegion(
      { ...startPoint, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      400,
    );
  };

  // ── ゴール確定 → スタイル選択へ ──
  const confirmGoal = () => {
    if (!goalPoint || !startPoint) return;
    setStep('select_style');
    // 両ピンが収まるリージョンへ
    const r = boundingRegion([startPoint, goalPoint]);
    mapRef.current?.animateToRegion(
      { ...r, latitudeDelta: r.latitudeDelta * 1.8, longitudeDelta: r.longitudeDelta * 1.8 },
      400,
    );
  };

  // ── 既知サーキット選択 ──
  const selectCircuit = (circuit: CircuitCandidate) => {
  const p = useP();
    Alert.alert(
      `${circuit.name} を使用`,
      `登録済みレイアウト（${circuit.location}）でコースを作成します。\n採点プリセットは自動適用されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '使用する',
          onPress: () => {
            setGoalPoint(circuit.path[circuit.path.length - 1]);
            setRoutePath(circuit.path);
            // 推奨プリセット自動選択
            const preset = ALL_PRESETS.find((p) => p.id === circuit.recommendedPresetId) ?? null;
            setSelectedPreset(preset);
            setCourseName(circuit.name);
            handleGenerate(circuit.path, preset, circuit.name);
          },
        },
      ],
    );
  };

  // ── コース生成 ──
  const handleGenerate = async (
    path:   GeoPoint[] | null = null,
    preset: CompetitionPreset | null = selectedPreset,
    name:   string = courseName,
  ) => {
    if (!startPoint || !goalPoint) return;
    setStep('generating');
    setErrorMsg(null);

    try {
      let finalPath = path;
      if (!finalPath || finalPath.length < 2) {
        finalPath = await fetchRoute(startPoint, goalPoint);
        setRoutePath(finalPath);
      }

      const course = generateCourse(
        startPoint,
        goalPoint,
        finalPath,
        name || `コース ${new Date().toLocaleDateString('ja-JP')}`,
        preset,
      );
      // プレビューは整形済み中心線 + スナップ済み S/G を表示
      setRoutePath(extractCenterline(finalPath));
      setStartPoint(course.startPoint);
      setGoalPoint(course.endPoint ?? goalPoint);
      setGeneratedCourse(course);
      setCourseName(course.name);
      setStep('preview');

      // マップをコース全体に合わせる
      if (course.boundary.length >= 2) {
        const r = boundingRegion(course.boundary);
        mapRef.current?.animateToRegion(
          { ...r, latitudeDelta: r.latitudeDelta * 1.5, longitudeDelta: r.longitudeDelta * 1.5 },
          600,
        );
      }
    } catch (err) {
      const msg = err instanceof RouteError ? err.message
        : 'コース生成中にエラーが発生しました。';
      setErrorMsg(msg);
      setStep('select_style');

      if (err instanceof RouteError && err.code === 'NO_ROUTE') {
        Alert.alert(
          'ルートが見つかりません',
          msg,
          [
            { text: 'キャンセル', style: 'cancel', onPress: () => setStep('place_goal') },
            { text: '手動で作成', onPress: () => router.replace('/course-editor') },
          ],
        );
      } else {
        Alert.alert('エラー', msg);
      }
    }
  };

  // ── 保存 ──
  const handleSave = async () => {
    if (!generatedCourse) return;
    const course: Course = {
      ...generatedCourse,
      name:          courseName.trim() || generatedCourse.name,
      autoGenerated: true,
    };
    try {
      await saveCourse(course);
      setStep('done');
    } catch {
      Alert.alert('保存失敗', 'コースの保存に失敗しました。再度お試しください。');
    }
  };

  // ── 編集画面へ ──
  const handleEditInEditor = () => {
    if (!generatedCourse) return;
    saveCourse(generatedCourse).then(() => {
      router.replace({ pathname: '/course-editor', params: { id: generatedCourse.id } });
    });
  };

  // ────────────────────────────────────────────────────────────────
  // レンダリング
  // ────────────────────────────────────────────────────────────────

  if (step === 'done') {
    return <DoneScreen courseName={generatedCourse?.name ?? courseName} />;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* ヘッダー */}
      <View style={s.header}>
        <GamePressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Text style={s.backBtnText}>← BACK</Text>
        </GamePressable>
        <View style={s.headerCenter}>
          <Text style={s.title}>コース自動生成</Text>
          <Text style={s.stepLabel}>{STEP_LABELS[step]}</Text>
        </View>
        <View style={{ width: 50 }} />
      </View>

      {/* プログレスバー */}
      <StepProgress step={step} />
      <ApiConfigBanner />

      {/* マップ */}
      <View style={s.mapWrap}>
        <MapView
          ref={mapRef}
          style={s.map}
          provider={PROVIDER_DEFAULT}
          mapType="hybrid"
          showsUserLocation
          showsCompass={false}
          onPress={step === 'place_start' || step === 'place_goal' ? handleMapPress : undefined}
          initialRegion={{ latitude: 35.68, longitude: 139.69, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        >
          {/* スタートピン */}
          {startPoint && (
            <Marker coordinate={startPoint} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={s.startPin}><Text style={s.pinText}>S</Text></View>
            </Marker>
          )}
          {/* ゴールピン */}
          {goalPoint && (
            <Marker coordinate={goalPoint} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={s.goalPin}><Text style={s.pinText}>G</Text></View>
            </Marker>
          )}
          {/* ルートライン */}
          {routePath.length >= 2 && (
            <Polyline
              coordinates={routePath}
              strokeColor={colors.neonGreen + 'BB'}
              strokeWidth={3}
            />
          )}
          {/* 生成済みコース境界 */}
          {generatedCourse?.boundary && generatedCourse.boundary.length >= 3 && (
            <Polygon
              coordinates={generatedCourse.boundary}
              fillColor={colors.neonGreen + '20'}
              strokeColor={colors.neonGreen + 'AA'}
              strokeWidth={2}
            />
          )}
          {/* スコアゾーン */}
          {generatedCourse?.scoringZones.map((z) =>
            z.polygon.length >= 3 ? (
              <Polygon key={z.id} coordinates={z.polygon}
                fillColor={z.color + '44'} strokeColor={z.color + 'CC'} strokeWidth={1.5} />
            ) : null,
          )}
        </MapView>

        {/* ── マップ検索 ── */}
        <MapSearchBar
          top={12}
          right={12}
          onResult={(lat, lon) => {
            mapRef.current?.animateToRegion(
              { latitude: lat, longitude: lon, latitudeDelta: 0.01, longitudeDelta: 0.01 },
              500,
            );
          }}
        />

        {/* タップ誘導オーバーレイ */}
        {(step === 'place_start' || step === 'place_goal') && (
          <View style={s.tapHint} pointerEvents="none">
            <Text style={s.tapHintText}>
              {step === 'place_start' ? '📍 マップをタップしてスタートを置く' : '🏁 マップをタップしてゴールを置く'}
            </Text>
          </View>
        )}

        {/* 生成中スピナー */}
        {step === 'generating' && (
          <View style={s.generatingOverlay}>
            <ActivityIndicator color={colors.neonGreen} size="large" />
            <Text style={s.generatingText}>道路を読み取り中…</Text>
          </View>
        )}
      </View>

      {/* ボトムパネル */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {step === 'place_start'  && <PlaceStartPanel  start={startPoint}  onConfirm={confirmStart} />}
        {step === 'place_goal'   && (
          <PlaceGoalPanel
            goal={goalPoint}
            nearbyCiircuits={nearbyCiircuits}
            onConfirm={confirmGoal}
            onSelectCircuit={selectCircuit}
          />
        )}
        {step === 'select_style' && (
          <SelectStylePanel
            selected={selectedPreset}
            onSelect={setSelectedPreset}
            onGenerate={() => handleGenerate()}
            error={errorMsg}
          />
        )}
        {step === 'preview' && (
          <PreviewPanel
            course={generatedCourse}
            courseName={courseName}
            onNameChange={setCourseName}
            onSave={handleSave}
            onEdit={handleEditInEditor}
          />
        )}
      </KeyboardAvoidingView>

      {/* 免責注意 */}
      <Text style={s.disclaimer}>許可された道路・施設でのみご利用ください。</Text>
    </SafeAreaView>
  );
}

// ────────────────────────────────────────────────────────────────
// サブパネル
// ────────────────────────────────────────────────────────────────

function PlaceStartPanel({ start, onConfirm }: { start: GeoPoint | null; onConfirm: () => void }) {
  const p = useP();
  return (
    <View style={p.panel}>
      <Text style={p.panelTitle}>スタートを置く</Text>
      <Text style={p.panelSub}>マップ上をタップしてスタート地点を指定します。</Text>
      <GamePressable
        onPress={onConfirm}
        disabled={!start}
        style={({ pressed }) => [p.btn, p.btnPrimary, !start && p.btnDisabled, pressed && { opacity: 0.8 }]}
      >
        <Text style={p.btnText}>{start ? 'スタートを確定  →' : '📍 スタートを置いてください'}</Text>
      </GamePressable>
    </View>
  );
}

function PlaceGoalPanel({
  goal, nearbyCiircuits, onConfirm, onSelectCircuit,
}: {
  goal:            GeoPoint | null;
  nearbyCiircuits: CircuitCandidate[];
  onConfirm:       () => void;
  onSelectCircuit: (c: CircuitCandidate) => void;
}) {
  const p = useP();
  return (
    <View style={p.panel}>
      {nearbyCiircuits.length > 0 && (
        <View style={p.circuitBox}>
          <Text style={p.circuitBoxTitle}>📡 この付近の既知レイアウト</Text>
          {nearbyCiircuits.map((c) => (
            <GamePressable
              key={c.id}
              onPress={() => onSelectCircuit(c)}
              style={({ pressed }) => [p.circuitRow, pressed && { opacity: 0.7 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={p.circuitName}>{c.name}</Text>
                <Text style={p.circuitMeta}>{c.location}  ·  {c.lengthM} m  ·  コーナー {c.cornerCount}</Text>
              </View>
              <Text style={p.circuitDist}>{Math.round(c.distanceM)} m</Text>
              <Text style={p.circuitArrow}>→</Text>
            </GamePressable>
          ))}
        </View>
      )}

      <Text style={p.panelTitle}>ゴールを置く</Text>
      <Text style={p.panelSub}>マップ上をタップしてゴール地点を指定します。スタートと同じ場所に置くと周回コースになります。</Text>
      <GamePressable
        onPress={onConfirm}
        disabled={!goal}
        style={({ pressed }) => [p.btn, p.btnPrimary, !goal && p.btnDisabled, pressed && { opacity: 0.8 }]}
      >
        <Text style={p.btnText}>{goal ? 'ゴールを確定  →' : '🏁 ゴールを置いてください'}</Text>
      </GamePressable>
    </View>
  );
}

function SelectStylePanel({
  selected, onSelect, onGenerate, error,
}: {
  selected:   CompetitionPreset | null;
  onSelect:   (p: CompetitionPreset) => void;
  onGenerate: () => void;
  error:      string | null;
}) {
  const p = useP();
  const { colors, spacing } = useTheme();
  const diffColorMap = diffColors(colors);
  return (
    <ScrollView style={p.panel} contentContainerStyle={{ gap: spacing.sm }}>
      <Text style={p.panelTitle}>採点スタイル</Text>
      {ALL_PRESETS.map((preset) => {
        const active   = selected?.id === preset.id;
        const diffColor = diffColorMap[preset.gradeDifficulty];
        return (
          <GamePressable
            key={preset.id}
            onPress={() => onSelect(preset)}
            style={[p.presetCard, active && { borderColor: diffColor, backgroundColor: diffColor + '15' }]}
          >
            <View style={[p.presetBar, { backgroundColor: diffColor }]} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={p.presetIcon}>{preset.icon}</Text>
                <Text style={[p.presetName, active && { color: diffColor }]}>{preset.name}</Text>
                <View style={[p.presetDiff, { borderColor: diffColor + '99', backgroundColor: diffColor + '15' }]}>
                  <Text style={[p.presetDiffText, { color: diffColor }]}>
                    {preset.gradeDifficulty.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={p.presetDesc}>{preset.description}</Text>
              <View style={p.presetStats}>
                <Text style={p.presetStat}>ゾーン幅 {(preset.zoneHalfWidthM * 2).toFixed(1)} m</Text>
                <Text style={p.presetStat}>倍率 ×{preset.zoneMultiplier}</Text>
                <Text style={p.presetStat}>{preset.speedReferenceKmh} km/h 基準</Text>
              </View>
            </View>
            {active && <Text style={[p.presetCheck, { color: diffColor }]}>✓</Text>}
          </GamePressable>
        );
      })}

      <GamePressable
        onPress={() => { onSelect(null as unknown as CompetitionPreset); onGenerate(); }}
        style={({ pressed }) => [p.btn, pressed && { opacity: 0.7 }]}
      >
        <Text style={[p.btnText, { color: colors.textMuted }]}>AI 自動設定で生成（プリセットなし）</Text>
      </GamePressable>

      {error && <Text style={p.errorText}>{error}</Text>}

      <GamePressable
        onPress={onGenerate}
        disabled={!selected}
        style={({ pressed }) => [p.btn, p.btnAccent, !selected && p.btnDisabled, pressed && { opacity: 0.8 }]}
      >
        <Text style={[p.btnText, p.btnAccentText]}>
          {selected ? `${selected.icon}  コースを自動生成` : 'スタイルを選択してください'}
        </Text>
      </GamePressable>
    </ScrollView>
  );
}

function PreviewPanel({
  course, courseName, onNameChange, onSave, onEdit,
}: {
  course:       Course | null;
  courseName:   string;
  onNameChange: (s: string) => void;
  onSave:       () => void;
  onEdit:       () => void;
}) {
  const p = useP();
  const { colors } = useTheme();
  if (!course) return null;
  const zoneCount   = course.scoringZones.length;
  const cornerCount = Math.ceil(zoneCount / 2);
  const clipLines   = course.scoringZones.filter((z) => z.recommendedClip);

  return (
    <View style={p.panel}>
      <Text style={p.panelTitle}>コースが完成しました</Text>
      <Text style={p.panelSub}>
        各コーナーにイン / アウトの2ラインを設定済み。★ が推奨ラインです。
      </Text>

      {/* 統計 */}
      <View style={p.statsRow}>
        <StatBit label="コーナー" val={`${cornerCount}`} />
        <StatBit label="ゾーン" val={`${zoneCount}`} />
        <StatBit label="難易度" val={(course.scoringProfile?.gradeDifficulty ?? 'normal').toUpperCase()} />
      </View>

      {/* クリップライン一覧 */}
      {clipLines.length > 0 && (
        <View style={p.clipList}>
          {clipLines.map((z) => (
            <View key={z.id} style={p.clipRow}>
              <Text style={[p.clipName, { color: z.color }]}>{z.name}</Text>
              <Text style={p.clipMeta}>
                {z.turnDirection === 'left' ? '左' : '右'}旋回 · ×{z.multiplier}
              </Text>
              {z.clipReason && (
                <Text style={p.clipReason} numberOfLines={2}>{z.clipReason}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* コース名 */}
      <TextInput
        value={courseName}
        onChangeText={onNameChange}
        placeholder="コース名を入力…"
        placeholderTextColor={colors.textMuted}
        style={p.nameInput}
        onSubmitEditing={Keyboard.dismiss}
        returnKeyType="done"
      />

      <View style={p.actionRow}>
        <GamePressable
          onPress={onEdit}
          style={({ pressed }) => [p.btn, p.btnSecondary, pressed && { opacity: 0.7 }]}
        >
          <Text style={p.btnSecondaryText}>エディタで微調整</Text>
        </GamePressable>
        <GamePressable
          onPress={onSave}
          style={({ pressed }) => [p.btn, p.btnAccent, { flex: 1 }, pressed && { opacity: 0.8 }]}
        >
          <Text style={p.btnAccentText}>✓  保存する</Text>
        </GamePressable>
      </View>
    </View>
  );
}

function StatBit({ label, val }: { label: string; val: string }) {
  const p = useP();
  return (
    <View style={p.statBit}>
      <Text style={p.statBitLabel}>{label}</Text>
      <Text style={p.statBitVal}>{val}</Text>
    </View>
  );
}

// ── 完了画面 ──
function DoneScreen({ courseName }: { courseName: string }) {
  const done = useDone();
  const s = useS();
  const { spacing } = useTheme();
  return (
    <SafeAreaView style={[s.safe, { justifyContent: 'center', alignItems: 'center', padding: spacing.xl }]}>
      <Text style={done.emoji}>🏁</Text>
      <Text style={done.title}>保存しました</Text>
      <Text style={done.name}>{courseName}</Text>
      <Text style={done.sub}>MY COURSES から選択して走れます。</Text>
      <GamePressable
        onPress={() => router.replace('/courses')}
        style={({ pressed }) => [done.btn, pressed && { opacity: 0.8 }]}
      >
        <Text style={done.btnText}>MY COURSES を見る  →</Text>
      </GamePressable>
      <GamePressable
        onPress={() => router.replace('/track')}
        style={({ pressed }) => [done.btnSub, pressed && { opacity: 0.8 }]}
      >
        <Text style={done.btnSubText}>コース計測へ  →</Text>
      </GamePressable>
      <GamePressable
        onPress={() => router.replace('/home')}
        style={({ pressed }) => [done.btnSub, { marginTop: spacing.xs }, pressed && { opacity: 0.8 }]}
      >
        <Text style={done.btnSubText}>Pit Lane に戻る</Text>
      </GamePressable>
    </SafeAreaView>
  );
}

// ── プログレスバー ──
const STEPS: WizardStep[] = ['place_start', 'place_goal', 'select_style', 'generating', 'preview'];
function StepProgress({ step }: { step: WizardStep }) {
  const s = useS();
  const { colors } = useTheme();
  const idx = STEPS.indexOf(step);
  return (
    <View style={s.progress}>
      {STEPS.map((_, i) => (
        <View
          key={i}
          style={[
            s.progressDot,
            i <= idx && { backgroundColor: colors.neonGreen },
            i === idx && { width: 20, borderRadius: 4 },
          ]}
        />
      ))}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
// スタイル
// ────────────────────────────────────────────────────────────────

function createS(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  safe:          { flex: 1, backgroundColor: colors.background },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn:       { minWidth: 50 },
  backBtnText:   { ...typography.label, color: colors.neonGreen, fontSize: 9 },
  headerCenter:  { alignItems: 'center', gap: 2 },
  title:         { ...typography.label, color: colors.textPrimary, fontSize: 11, letterSpacing: 2 },
  stepLabel:     { ...typography.mono, color: colors.neonGreen, fontSize: 9 },

  // プログレス
  progress:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  progressDot:   { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },

  configBanner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: '#1A1200',
    borderBottomWidth: 1,
    borderBottomColor: colors.amber + '55',
    gap: 2,
  },
  configBannerText: {
    ...typography.label,
    color: colors.amber,
    fontSize: 8,
    lineHeight: 12,
    textTransform: 'none',
    letterSpacing: 0.3,
  },

  // マップ
  mapWrap:       { flex: 1 },
  map:           { ...StyleSheet.absoluteFillObject },

  // ピン
  startPin:      { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.neonGreen, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  goalPin:       { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.recRed, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  pinText:       { color: colors.background, fontWeight: '900', fontSize: 11 },

  // タップヒント
  tapHint:       { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  tapHintText:   { ...typography.label, color: colors.textPrimary, fontSize: 9, backgroundColor: colors.background + 'CC', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' },

  // 生成中オーバーレイ
  generatingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background + 'BB', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  generatingText:    { ...typography.label, color: colors.neonGreen, fontSize: 11, letterSpacing: 2 },

  // 免責
  disclaimer:    { ...typography.mono, color: colors.textMuted, fontSize: 8, textAlign: 'center', paddingVertical: 4 },
});
}

function useS() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createS(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

function createP(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  panel:         { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md, gap: spacing.sm, maxHeight: 340 },
  panelTitle:    { ...typography.label, color: colors.textPrimary, fontSize: 11, letterSpacing: 1.5 },
  panelSub:      { ...typography.mono, color: colors.textMuted, fontSize: 10, lineHeight: 15 },

  // ボタン
  btn:           { borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  btnPrimary:    { borderColor: colors.neonGreen + '88', backgroundColor: colors.neonGreen + '12' },
  btnAccent:     { borderColor: colors.neonGreen, backgroundColor: colors.neonGreen + '20' },
  btnSecondary:  { borderColor: colors.border },
  btnDisabled:   { opacity: 0.35 },
  btnText:       { ...typography.label, color: colors.neonGreen, fontSize: 10 },
  btnAccentText: { ...typography.label, color: colors.neonGreen, fontSize: 11, letterSpacing: 1.5 },
  btnSecondaryText: { ...typography.label, color: colors.textMuted, fontSize: 10 },

  // 既知サーキット
  circuitBox:    { backgroundColor: colors.background, borderRadius: 4, borderWidth: 1, borderColor: colors.amber + '55', padding: spacing.sm, gap: 6 },
  circuitBoxTitle: { ...typography.label, color: colors.amber, fontSize: 8, letterSpacing: 1.5 },
  circuitRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  circuitName:   { ...typography.label, color: colors.textPrimary, fontSize: 10 },
  circuitMeta:   { ...typography.mono, color: colors.textMuted, fontSize: 8 },
  circuitDist:   { ...typography.mono, color: colors.amber, fontSize: 10 },
  circuitArrow:  { ...typography.label, color: colors.textMuted, fontSize: 9 },

  // プリセットカード
  presetCard:    { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: colors.border, borderRadius: 4, overflow: 'hidden', gap: 10 },
  presetBar:     { width: 4 },
  presetIcon:    { fontSize: 16 },
  presetName:    { ...typography.label, color: colors.textPrimary, fontSize: 11, flex: 1 },
  presetDiff:    { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  presetDiffText:{ ...typography.label, fontSize: 7 },
  presetDesc:    { ...typography.mono, color: colors.textMuted, fontSize: 9, lineHeight: 14 },
  presetStats:   { flexDirection: 'row', gap: 8 },
  presetStat:    { ...typography.mono, color: colors.textSecondary, fontSize: 8 },
  presetCheck:   { ...typography.label, fontSize: 14, alignSelf: 'center', paddingRight: spacing.sm },

  // プレビュー
  statsRow:      { flexDirection: 'row', gap: spacing.sm },
  statBit:       { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 4, padding: spacing.xs, alignItems: 'center', gap: 2 },
  statBitLabel:  { ...typography.label, color: colors.textMuted, fontSize: 7 },
  statBitVal:    { ...typography.mono, color: colors.neonGreen, fontSize: 11, fontWeight: '700' },
  nameInput:     { ...typography.mono, color: colors.textPrimary, fontSize: 13, borderWidth: 1, borderColor: colors.neonGreen + '66', borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.background },
  clipList:      { gap: 6, maxHeight: 120 },
  clipRow:       { backgroundColor: colors.background, borderRadius: 4, borderWidth: 1, borderColor: colors.border, padding: spacing.xs, gap: 2 },
  clipName:      { ...typography.label, fontSize: 9, letterSpacing: 0.5 },
  clipMeta:      { ...typography.mono, color: colors.textMuted, fontSize: 8 },
  clipReason:    { ...typography.mono, color: colors.textSecondary, fontSize: 8, lineHeight: 12 },
  actionRow:     { flexDirection: 'row', gap: spacing.sm },

  // エラー
  errorText:     { ...typography.mono, color: colors.recRed, fontSize: 10, lineHeight: 15 },
});
}

function useP() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createP(colors, typography, spacing),
    [colors, typography, spacing],
  );
}

function createDone(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  emoji:      { fontSize: 56, textAlign: 'center' },
  title:      { ...typography.title, color: colors.neonGreen, textAlign: 'center', fontSize: 18, marginTop: spacing.md },
  name:       { ...typography.mono, color: colors.textPrimary, fontSize: 14, textAlign: 'center', fontWeight: '700', marginTop: spacing.xs },
  sub:        { ...typography.mono, color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: spacing.sm, lineHeight: 18 },
  btn:        { marginTop: spacing.xl, borderWidth: 1, borderColor: colors.neonGreen, borderRadius: 4, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, alignItems: 'center' },
  btnText:    { ...typography.label, color: colors.neonGreen, fontSize: 11, letterSpacing: 2 },
  btnSub:     { marginTop: spacing.sm, padding: spacing.sm, alignItems: 'center' },
  btnSubText: { ...typography.label, color: colors.textMuted, fontSize: 9 },
});
}

function useDone() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createDone(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
