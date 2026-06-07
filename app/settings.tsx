/**
 * 設定画面
 *
 * ユーザーが調整できる2カテゴリ:
 *   1. マウント向き  — 自動検知 or 手動固定 (flat / portrait / landscape)
 *   2. ドリフト閾値 — 5項目をステップ入力で調整 + 3プリセット
 *
 * 変更は即座に AsyncStorage に保存される（保存ボタン不要）。
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import { AppearanceThemePanel } from '@/components/settings/AppearanceThemePanel';
import { BgmTrackPanel } from '@/components/settings/BgmTrackPanel';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { LoggerSettingsPanel } from '@/components/logger/LoggerSettingsPanel';
import { LineNotifySettingsPanel } from '@/components/settings/LineNotifySettingsPanel';
import { PhoneSensorProfilePanel } from '@/components/logger/PhoneSensorProfilePanel';
import { SurfaceConditionToggle } from '@/components/settings/SurfaceConditionToggle';
import type { UiThemePresetId } from '@/constants/uiThemes';
import { setIsAudioActiveAsync } from 'expo-audio';
import { useSettings } from '@/contexts/SettingsContext';
import {
  applyBgmFromSettings,
  applyBgmVolumeFromSettings,
  haltBgmImmediately,
  setSoundPlaybackAllowed,
} from '@/lib/themeMusicPlayer';
import { unloadUiSounds, playUiSound } from '@/lib/uiSound';
import {
  clampSoundVolume,
  isBgmActive,
  SOUND_VOLUME_MAX,
  SOUND_VOLUME_MIN,
  SOUND_VOLUME_STEP,
  soundVolumeToPercent,
} from '@/lib/audioVolume';
import { useCalibration } from '@/hooks/useCalibration';
import {
  isFixedMountOverride,
  needsRecalibrationForMountChange,
} from '@/lib/calibration';
import { applySurfaceToThresholds } from '@/lib/surfaceCondition';
import { DEFAULT_SETTINGS, SMOOTHING_PRESET_DESCRIPTIONS, SMOOTHING_PRESET_LABELS, SMOOTHING_PRESET_PARAMS, THRESHOLD_PRESETS } from '@/types/settings';
import type { DriftThresholds, MountOrientationOverride, PresetName, SmoothingPreset, SurfaceCondition } from '@/types/settings';
import { MOUNT_OPTIONS } from '@/constants/mountOptions';
import { orientationLabel } from '@/lib/orientation';
import type { BgmTrackId } from '@/constants/bgmTracks';

type ThresholdKey = keyof DriftThresholds;

const THRESHOLD_CONFIG: {
  key: ThresholdKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  digits: number;
  hint: string;
}[] = [
  {
    key:    'enterLateralG',
    label:  '横G 入閾値',
    unit:   'G',
    min:    0.10, max: 1.00, step: 0.05, digits: 2,
    hint:   'ドリフト開始を宣言する横方向G',
  },
  {
    key:    'exitLateralG',
    label:  '横G 出閾値',
    unit:   'G',
    min:    0.05, max: 0.90, step: 0.05, digits: 2,
    hint:   'ドリフト終了と判断する横方向G（入閾値より低く維持）',
  },
  {
    key:    'enterYawRate',
    label:  'ヨー率 入閾値',
    unit:   'rad/s',
    min:    0.05, max: 1.20, step: 0.05, digits: 2,
    hint:   'ドリフト開始に必要な車体回転速度',
  },
  {
    key:    'exitYawRate',
    label:  'ヨー率 出閾値',
    unit:   'rad/s',
    min:    0.03, max: 1.00, step: 0.03, digits: 2,
    hint:   'ドリフト終了と判断する車体回転速度（入閾値より低く維持）',
  },
  {
    key:    'minSpeedKmh',
    label:  '最低速度',
    unit:   'km/h',
    min:    5, max: 80, step: 5, digits: 0,
    hint:   '駐車場での誤検知を防ぐ最低走行速度',
  },
];

const PRESET_LABELS: Record<PresetName, string> = {
  easy:     'EASY',
  standard: 'STD',
  pro:      'PRO',
};

// ── 数値スナップ（浮動小数点誤差吸収） ───────────────────────

function snapToStep(value: number, step: number, digits: number): number {
  return parseFloat((Math.round(value / step) * step).toFixed(digits));
}

// ── メイン画面 ───────────────────────────────────────────────

function formatCalDate(ts: number): string {
  const d   = new Date(ts);
  const y   = d.getFullYear();
  const mo  = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const h   = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${y}.${mo}.${day}  ${h}:${min}`;
}

function signedStr(v: number, digits = 3): string {
  const s = v.toFixed(digits);
  return v >= 0 ? `+${s}` : s;
}

export default function SettingsScreen() {
  const styles = useStyles();
  const { id: themeId } = useTheme();
  const { settings, updateThresholds, setMountOverride, updateFeedback, setAppearanceTheme, setSmoothingPreset, setSurfaceCondition, resetSettings } = useSettings();
  const {
    phase:       calPhase,
    progress:    calProgress,
    calibration: calData,
    capture:     startCalibration,
    clear:       clearCalibRaw,
  } = useCalibration({
    mountOverride: settings.mountOverride,
    onMountLocked: (orientation) => {
      if (orientation === 'unknown') return;
      void setMountOverride(orientation);
    },
  });

  // ローカル編集中の閾値（保存は自動）
  const [localThresholds, setLocalThresholds] = useState<DriftThresholds>(
    settings.thresholds,
  );

  // 設定変更時に親の settings が変われば同期
  useEffect(() => {
    setLocalThresholds(settings.thresholds);
  }, [settings.thresholds]);

  // ── 保存済みフラッシュ演出 ──
  const savedOpacity = useRef(new Animated.Value(0)).current;

  const flashSaved = useCallback(() => {
    savedOpacity.setValue(1);
    Animated.timing(savedOpacity, {
      toValue: 0,
      duration: 1200,
      useNativeDriver: true,
    }).start();
  }, [savedOpacity]);

  const clearCalib = useCallback(async () => {
    await clearCalibRaw();
    await setMountOverride('auto');
    flashSaved();
  }, [clearCalibRaw, setMountOverride, flashSaved]);

  const needsRecalibration = useMemo(
    () => needsRecalibrationForMountChange(calData, settings.mountOverride),
    [calData, settings.mountOverride],
  );

  // ── マウント向き変更 ──
  const handleMountOverride = useCallback(
    async (next: MountOrientationOverride) => {
      await setMountOverride(next);
      flashSaved();
    },
    [setMountOverride, flashSaved],
  );

  const handleSmoothingPreset = useCallback(
    async (next: SmoothingPreset) => {
      if (next === settings.smoothingPreset) return;
      await setSmoothingPreset(next);
      flashSaved();
    },
    [settings.smoothingPreset, setSmoothingPreset, flashSaved],
  );

  const handleSurfaceCondition = useCallback(
    async (next: SurfaceCondition) => {
      if (next === settings.surfaceCondition) return;
      await setSurfaceCondition(next);
      flashSaved();
    },
    [settings.surfaceCondition, setSurfaceCondition, flashSaved],
  );

  const wetPreviewThresholds = useMemo(
    () => applySurfaceToThresholds(localThresholds, 'wet'),
    [localThresholds],
  );

  const handleFeedbackToggle = useCallback(
    async (key: 'hapticsEnabled' | 'soundEnabled', value: boolean) => {
      const nextFeedback = { ...settings.feedback, [key]: value };

      if (key === 'soundEnabled' && !value) {
        setSoundPlaybackAllowed(false);
        haltBgmImmediately();
        void unloadUiSounds();
        void setIsAudioActiveAsync(false);
      }

      await updateFeedback(nextFeedback);

      if (key === 'soundEnabled' && value) {
        try {
          await setIsAudioActiveAsync(true);
        } catch {
          // ignore
        }
        setSoundPlaybackAllowed(true);
        applyBgmFromSettings(nextFeedback, themeId);
      }

      flashSaved();
    },
    [settings.feedback, themeId, updateFeedback, flashSaved],
  );

  const handleBgmToggle = useCallback(
    async (value: boolean) => {
      const nextFeedback = { ...settings.feedback, bgmEnabled: value };
      applyBgmFromSettings(nextFeedback, themeId);
      await updateFeedback(nextFeedback);
      flashSaved();
    },
    [settings.feedback, themeId, updateFeedback, flashSaved],
  );

  const handleBgmVolume = useCallback(
    async (value: number) => {
      const next = clampSoundVolume(value);
      if (next === settings.feedback.bgmVolume) return;
      const nextFeedback = { ...settings.feedback, bgmVolume: next };
      applyBgmVolumeFromSettings(nextFeedback, themeId);
      await updateFeedback(nextFeedback);
      flashSaved();
    },
    [settings.feedback, themeId, updateFeedback, flashSaved],
  );

  const handleBgmTrackSelect = useCallback(
    async (trackId: BgmTrackId) => {
      if (trackId === settings.feedback.bgmTrackId) return;
      const nextFeedback = { ...settings.feedback, bgmTrackId: trackId };
      applyBgmFromSettings(nextFeedback, themeId);
      await updateFeedback(nextFeedback);
      flashSaved();
    },
    [settings.feedback, themeId, updateFeedback, flashSaved],
  );

  const handleSfxVolume = useCallback(
    async (value: number) => {
      const next = clampSoundVolume(value);
      if (next === settings.feedback.sfxVolume) return;
      await updateFeedback({ ...settings.feedback, sfxVolume: next });
      flashSaved();
    },
    [settings.feedback, updateFeedback, flashSaved],
  );

  // ── 閾値ステップ変更 ──
  const handleThresholdStep = useCallback(
    async (key: ThresholdKey, delta: number) => {
      const cfg  = THRESHOLD_CONFIG.find((c) => c.key === key)!;
      const raw  = localThresholds[key] + delta;
      let   next = snapToStep(Math.min(cfg.max, Math.max(cfg.min, raw)), cfg.step, cfg.digits);

      // ヒステリシス保証: 出閾値 < 入閾値
      const draft = { ...localThresholds, [key]: next };
      if (draft.exitLateralG >= draft.enterLateralG) {
        draft.exitLateralG = snapToStep(
          draft.enterLateralG - 0.05,
          0.05, 2,
        );
      }
      if (draft.exitYawRate >= draft.enterYawRate) {
        draft.exitYawRate = snapToStep(
          draft.enterYawRate - 0.05,
          0.05, 2,
        );
      }

      setLocalThresholds(draft);
      await updateThresholds(draft);
      flashSaved();
    },
    [localThresholds, updateThresholds, flashSaved],
  );

  // ── プリセット適用 ──
  const handlePreset = useCallback(
    async (preset: PresetName) => {
      const next = THRESHOLD_PRESETS[preset];
      setLocalThresholds(next);
      await updateThresholds(next);
      flashSaved();
    },
    [updateThresholds, flashSaved],
  );

  // ── 全リセット ──
  const handleReset = useCallback(async () => {
    setLocalThresholds(DEFAULT_SETTINGS.thresholds);
    await resetSettings();
    flashSaved();
  }, [resetSettings, flashSaved]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ── ヘッダー ── */}
      <View style={styles.header}>
        <GamePressable
          uiSound="back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}
        >
          <Text style={styles.backLabel}>← BACK</Text>
        </GamePressable>
        <Text style={styles.headerTitle}>SETTINGS</Text>
        <Animated.Text style={[styles.savedLabel, { opacity: savedOpacity }]}>
          SAVED ✓
        </Animated.Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <AppearanceThemePanel
          selectedId={settings.appearanceThemeId}
          onSelect={(id: UiThemePresetId) => setAppearanceTheme(id)}
        />

        {/* ── LINE 走行速報 ── */}
        <SectionHeader label="LINE 走行速報" />
        <TelemetryFrame style={styles.frame}>
          <LineNotifySettingsPanel />
        </TelemetryFrame>

        {/* ── MOUNT ORIENTATION ── */}
        <SectionHeader label="MOUNT ORIENTATION" />
        <TelemetryFrame style={styles.frame}>
          {needsRecalibration ? (
            <RecalibrationBanner
              capturedMount={calData?.mountOrientationAtCapture}
              currentMount={settings.mountOverride}
            />
          ) : null}
          <Text style={styles.frameHint}>
            センサー自動検知を使うか、スマホの固定向きを手動で指定します。
            {isFixedMountOverride(settings.mountOverride)
              ? `\nキャリブ時は ${orientationLabel(settings.mountOverride)} 固定で軸リマップします（自動検知しません）。`
              : ''}
            {calData?.mountOrientationAtCapture
              ? `\n最終キャリブ向き: ${orientationLabel(calData.mountOrientationAtCapture)}（CLEAR で AUTO に戻ります）`
              : ''}
          </Text>
          <View style={styles.mountRow}>
            {MOUNT_OPTIONS.map((opt) => {
              const active = settings.mountOverride === opt.value;
              return (
                <GamePressable
                  key={opt.value}
                  onPress={() => handleMountOverride(opt.value)}
                  style={({ pressed }) => [
                    styles.mountBtn,
                    active && styles.mountBtnActive,
                    pressed && styles.mountBtnPressed,
                  ]}
                >
                  <Text style={[styles.mountBtnLabel, active && styles.mountBtnLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.mountBtnDesc, active && styles.mountBtnDescActive]}>
                    {opt.desc}
                  </Text>
                </GamePressable>
              );
            })}
          </View>
        </TelemetryFrame>

        {/* ── FEEDBACK ── */}
        <SectionHeader label="FEEDBACK" />
        <TelemetryFrame style={styles.frame}>
          <Text style={styles.frameHint}>
            ドリフト突入を触覚・音で通知します。SOUND で SE 全体、BGM でループ音楽を個別に ON/OFF できます。
          </Text>
          <FeedbackToggleRow
            label="HAPTICS"
            desc="触覚フィードバック（バイブ）"
            value={settings.feedback.hapticsEnabled}
            onValueChange={(v) => handleFeedbackToggle('hapticsEnabled', v)}
          />
          <View style={styles.divider} />
          <FeedbackToggleRow
            label="SOUND"
            desc="UI タップ音・ドリフト SE・カウントダウン"
            value={settings.feedback.soundEnabled}
            onValueChange={(v) => handleFeedbackToggle('soundEnabled', v)}
          />
          <View style={styles.divider} />
          <FeedbackToggleRow
            label="BGM"
            desc="Pit Lane / ホームのループ BGM（SOUND ON 時のみ）"
            value={settings.feedback.bgmEnabled}
            disabled={!settings.feedback.soundEnabled}
            onValueChange={handleBgmToggle}
          />
          <View style={styles.divider} />
          <Text style={[styles.frameHint, styles.bgmTrackHint]}>
            BGM TRACK — ループ曲を選択（テーマ連動で UI 配色に合わせることも可能）
          </Text>
          <BgmTrackPanel
            selectedId={settings.feedback.bgmTrackId}
            disabled={!isBgmActive(settings.feedback)}
            onSelect={handleBgmTrackSelect}
          />
          <View style={styles.divider} />
          <SoundVolumeRow
            label="BGM VOLUME"
            desc="ループ BGM の音量"
            value={settings.feedback.bgmVolume}
            disabled={!isBgmActive(settings.feedback)}
            onValueChange={handleBgmVolume}
          />
          <View style={styles.divider} />
          <SoundVolumeRow
            label="SFX VOLUME"
            desc="UI タップ音・ドリフト SE・カウントダウン"
            value={settings.feedback.sfxVolume}
            disabled={!settings.feedback.soundEnabled}
            onValueChange={handleSfxVolume}
          />
        </TelemetryFrame>

        {/* ── G スムージング（ホルダー振動対策） ── */}
        <SectionHeader label="G SENSOR SMOOTHING" />
        <View style={styles.thresholdHeader}>
          <View style={styles.presetRow}>
            {(Object.keys(SMOOTHING_PRESET_PARAMS) as SmoothingPreset[]).map((name) => {
              const isActive = settings.smoothingPreset === name;
              return (
                <GamePressable
                  key={name}
                  onPress={() => handleSmoothingPreset(name)}
                  style={({ pressed }) => [
                    styles.presetBtn,
                    isActive && styles.presetBtnActive,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={[styles.presetBtnLabel, isActive && styles.presetBtnLabelActive]}>
                    {SMOOTHING_PRESET_LABELS[name]}
                  </Text>
                </GamePressable>
              );
            })}
          </View>
        </View>
        <TelemetryFrame style={styles.frame}>
          <Text style={styles.smoothingDesc}>
            {SMOOTHING_PRESET_DESCRIPTIONS[settings.smoothingPreset]}
          </Text>
          <Text style={styles.smoothingHint}>
            LPF α={SMOOTHING_PRESET_PARAMS[settings.smoothingPreset].lpfAlpha.toFixed(2)}
            {' · '}
            カルマン R×{SMOOTHING_PRESET_PARAMS[settings.smoothingPreset].kalmanRMultiplier.toFixed(2)}
            {' · '}
            Q×{SMOOTHING_PRESET_PARAMS[settings.smoothingPreset].kalmanQMultiplier.toFixed(2)}
          </Text>
          <Text style={styles.footerNote}>
            エンジン振動・ホルダー共振が強い車は「強」、固定がしっかりしている車は「ピーク」を推奨。
            キャリブレーション後は静止ノイズに応じて R が自動補正されます。
          </Text>
        </TelemetryFrame>

        {/* ── SURFACE CONDITION ── */}
        <SectionHeader label="SURFACE CONDITION" />
        <TelemetryFrame style={styles.frame}>
          <Text style={styles.frameHint}>
            雨天・低μ路面では WET を選択。ドリフト開始閾値を緩和し、G フィルタのレスポンスを上げます。
            走行画面からも切り替え可能です。
          </Text>
          <SurfaceConditionToggle
            value={settings.surfaceCondition}
            onChange={handleSurfaceCondition}
          />
          {settings.surfaceCondition === 'wet' ? (
            <Text style={styles.smoothingHint}>
              WET 実効閾値: 横G {wetPreviewThresholds.enterLateralG.toFixed(2)}G ·
              ヨー {wetPreviewThresholds.enterYawRate.toFixed(2)} rad/s ·
              最低 {wetPreviewThresholds.minSpeedKmh} km/h
            </Text>
          ) : null}
        </TelemetryFrame>

        {/* ── PHONE SENSOR PROFILE ── */}
        <SectionHeader label="PHONE SENSOR PROFILE" />
        <PhoneSensorProfilePanel />

        <SectionHeader label="FIELD TEST" />
        <TelemetryFrame style={styles.frame}>
          <Text style={styles.frameHint}>
            屋外実機検証 — BLE ロガー・GPS 適応閾値・追走 Tsuiso のライブ診断とチェックリスト。
          </Text>
          <GamePressable
            onPress={() => router.push('/field-test')}
            style={({ pressed }) => [styles.fieldTestBtn, pressed && styles.fieldTestBtnPressed]}
          >
            <Text style={styles.fieldTestBtnLabel}>実機検証モードを開く →</Text>
          </GamePressable>
        </TelemetryFrame>

        {/* ── EXTERNAL LOGGER ── */}
        <SectionHeader label="EXTERNAL LOGGER" />
        <LoggerSettingsPanel />

        {/* ── DRIFT THRESHOLDS ── */}
        <View style={styles.thresholdHeader}>
          <SectionHeader label="DRIFT THRESHOLDS" />
          {/* プリセットボタン */}
          <View style={styles.presetRow}>
            {(Object.keys(THRESHOLD_PRESETS) as PresetName[]).map((name) => {
              const isActive = JSON.stringify(localThresholds) ===
                               JSON.stringify(THRESHOLD_PRESETS[name]);
              return (
                <GamePressable
                  key={name}
                  onPress={() => handlePreset(name)}
                  style={({ pressed }) => [
                    styles.presetBtn,
                    isActive && styles.presetBtnActive,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={[styles.presetBtnLabel, isActive && styles.presetBtnLabelActive]}>
                    {PRESET_LABELS[name]}
                  </Text>
                </GamePressable>
              );
            })}
          </View>
        </View>

        <TelemetryFrame style={styles.frame}>
          {THRESHOLD_CONFIG.map((cfg, i) => (
            <View key={cfg.key}>
              {i > 0 && <View style={styles.divider} />}
              <ThresholdRow
                config={cfg}
                value={localThresholds[cfg.key]}
                onDecrement={() => handleThresholdStep(cfg.key, -cfg.step)}
                onIncrement={() => handleThresholdStep(cfg.key, cfg.step)}
                atMin={localThresholds[cfg.key] <= cfg.min}
                atMax={localThresholds[cfg.key] >= cfg.max}
              />
            </View>
          ))}
        </TelemetryFrame>

        {/* ── リセットボタン ── */}
        <GamePressable
          onPress={handleReset}
          style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.resetBtnLabel}>RESET ALL TO DEFAULTS</Text>
        </GamePressable>

        {/* ドリフト閾値の補足説明 */}
        <Text style={styles.footerNote}>
          入閾値 {">"} 出閾値 の関係は自動的に維持されます。{'\n'}
          EASY = 街乗り検知向け　STD = 推奨　PRO = サーキット向け
        </Text>

        {/* ── SENSOR CALIBRATION ── */}
        <SectionHeader label="SENSOR CALIBRATION" />
        <CalibrationSection
          phase={calPhase}
          progress={calProgress}
          calibration={calData}
          mountOverride={settings.mountOverride}
          needsRecalibration={needsRecalibration}
          onCapture={startCalibration}
          onClear={clearCalib}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── サブコンポーネント ──────────────────────────────────────

function FeedbackToggleRow({
  label,
  desc,
  value,
  disabled = false,
  onValueChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { settings } = useSettings();
  return (
    <View style={[styles.feedbackRow, disabled && styles.volumeRowDisabled]}>
      <View style={styles.feedbackText}>
        <Text style={[styles.feedbackLabel, disabled && styles.volumeLabelDisabled]}>{label}</Text>
        <Text style={[styles.feedbackDesc, disabled && styles.volumeLabelDisabled]}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          playUiSound('nav', settings.feedback);
          onValueChange(next);
        }}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.neonGreenDim + '88' }}
        thumbColor={value && !disabled ? colors.neonGreen : colors.textMuted}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

function SoundVolumeRow({
  label,
  desc,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  desc: string;
  value: number;
  disabled: boolean;
  onValueChange: (next: number) => void;
}) {
  const styles = useStyles();
  const clamped = clampSoundVolume(value);
  const percent = soundVolumeToPercent(clamped);
  const atMin = clamped <= SOUND_VOLUME_MIN;
  const atMax = clamped >= SOUND_VOLUME_MAX;

  const handleStep = (delta: number) => {
    onValueChange(clampSoundVolume(clamped + delta));
  };

  return (
    <View style={[styles.volumeRow, disabled && styles.volumeRowDisabled]}>
      <View style={styles.volumeHeader}>
        <View style={styles.feedbackText}>
          <Text style={[styles.feedbackLabel, disabled && styles.volumeLabelDisabled]}>
            {label}
          </Text>
          <Text style={[styles.feedbackDesc, disabled && styles.volumeLabelDisabled]}>
            {desc}
          </Text>
        </View>
      </View>
      <View style={styles.volumeStepControl}>
        <GamePressable
          onPress={() => handleStep(-SOUND_VOLUME_STEP)}
          disabled={disabled || atMin}
          style={({ pressed }) => [
            styles.stepBtn,
            (disabled || atMin) && styles.stepBtnDisabled,
            pressed && !disabled && !atMin && styles.stepBtnPressed,
          ]}
        >
          <Text style={[styles.stepBtnText, (disabled || atMin) && styles.stepBtnTextDisabled]}>−</Text>
        </GamePressable>

        <View style={styles.stepValue}>
          <Text style={[styles.stepValueText, disabled && styles.volumeLabelDisabled]}>{percent}</Text>
          <Text style={[styles.stepUnit, disabled && styles.volumeLabelDisabled]}>%</Text>
        </View>

        <GamePressable
          onPress={() => handleStep(SOUND_VOLUME_STEP)}
          disabled={disabled || atMax}
          style={({ pressed }) => [
            styles.stepBtn,
            (disabled || atMax) && styles.stepBtnDisabled,
            pressed && !disabled && !atMax && styles.stepBtnPressed,
          ]}
        >
          <Text style={[styles.stepBtnText, (disabled || atMax) && styles.stepBtnTextDisabled]}>+</Text>
        </GamePressable>
      </View>
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLine} />
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function ThresholdRow({
  config,
  value,
  onDecrement,
  onIncrement,
  atMin,
  atMax,
}: {
  config: (typeof THRESHOLD_CONFIG)[number];
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  atMin: boolean;
  atMax: boolean;
}) {
  const styles = useStyles();
  const displayValue =
    config.digits > 0 ? value.toFixed(config.digits) : String(Math.round(value));

  return (
    <View style={styles.threshRow}>
      {/* ラベル + ヒント */}
      <View style={styles.threshLeft}>
        <Text style={styles.threshLabel}>{config.label}</Text>
        <Text style={styles.threshHint}>{config.hint}</Text>
      </View>

      {/* ステップコントロール */}
      <View style={styles.stepControl}>
        <GamePressable
          onPress={onDecrement}
          disabled={atMin}
          style={({ pressed }) => [
            styles.stepBtn,
            atMin && styles.stepBtnDisabled,
            pressed && !atMin && styles.stepBtnPressed,
          ]}
        >
          <Text style={[styles.stepBtnText, atMin && styles.stepBtnTextDisabled]}>−</Text>
        </GamePressable>

        <View style={styles.stepValue}>
          <Text style={styles.stepValueText}>{displayValue}</Text>
          <Text style={styles.stepUnit}>{config.unit}</Text>
        </View>

        <GamePressable
          onPress={onIncrement}
          disabled={atMax}
          style={({ pressed }) => [
            styles.stepBtn,
            atMax && styles.stepBtnDisabled,
            pressed && !atMax && styles.stepBtnPressed,
          ]}
        >
          <Text style={[styles.stepBtnText, atMax && styles.stepBtnTextDisabled]}>+</Text>
        </GamePressable>
      </View>
    </View>
  );
}

// ── キャリブレーションセクション ─────────────────────────────

function RecalibrationBanner({
  capturedMount,
  currentMount,
}: {
  capturedMount?: import('@/lib/orientation').MountOrientation;
  currentMount: MountOrientationOverride;
}) {
  const styles = useStyles();
  const { colors } = useTheme();

  const detail =
    capturedMount && currentMount !== 'auto'
      ? `（キャリブ時: ${orientationLabel(capturedMount)} → 現在: ${orientationLabel(currentMount)}）`
      : capturedMount && currentMount === 'auto'
        ? `（キャリブ時: ${orientationLabel(capturedMount)} → 現在: AUTO）`
        : '';

  return (
    <View style={styles.recalibBanner}>
      <Text style={[styles.recalibTitle, { color: colors.amber }]}>
        ⚠ マウント向きが変更されました
      </Text>
      <Text style={styles.recalibBody}>
        再キャリブレーションを推奨します。{detail}
      </Text>
    </View>
  );
}

function CalibrationSection({
  phase,
  progress,
  calibration,
  mountOverride,
  needsRecalibration,
  onCapture,
  onClear,
}: {
  phase: import('@/hooks/useCalibration').CalibrationPhase;
  progress: number;
  calibration: import('@/lib/calibration').CalibrationData | null;
  mountOverride: MountOrientationOverride;
  needsRecalibration: boolean;
  onCapture: () => void;
  onClear: () => Promise<void>;
}) {
  const styles = useStyles();
  const isCapturing = phase === 'capturing';
  const isDone      = phase === 'done';
  const isError     = phase === 'error';

  return (
    <TelemetryFrame style={styles.frame}>
      {/* 説明文 */}
      <Text style={[styles.frameHint, { paddingBottom: 0 }]}>
        車を停止させ、端末を固定した状態でキャリブレーションを実行してください。
        約 5 秒間のサンプル収集でセンサーのゼロ点バイアスを補正します。
        {isFixedMountOverride(mountOverride)
          ? `\n向き ${orientationLabel(mountOverride)} 固定で収集します。`
          : '\nAUTO 時は重力から姿勢を推定します。固定向きの設定を推奨します。'}
      </Text>

      {needsRecalibration ? (
        <RecalibrationBanner
          capturedMount={calibration?.mountOrientationAtCapture}
          currentMount={mountOverride}
        />
      ) : null}

      {/* 進捗バー */}
      {isCapturing ? (
        <View style={styles.calProgressWrap}>
          <View style={styles.calProgressBg}>
            <View style={[styles.calProgressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={styles.calProgressLabel}>
            CAPTURING… {Math.round(progress * 100)}%
          </Text>
        </View>
      ) : null}

      {/* 完了・エラー表示 */}
      {isDone ? (
        <Text style={styles.calDoneLabel}>✓ CALIBRATION COMPLETE</Text>
      ) : null}
      {isError ? (
        <Text style={styles.calErrorLabel}>✗ FAILED — センサーが利用できませんでした</Text>
      ) : null}

      {/* 保存済みデータ */}
      {calibration ? (
        <View style={styles.calDataBox}>
          <Text style={styles.calDataTitle}>
            最終キャリブレーション: {formatCalDate(calibration.capturedAt)}
          </Text>
          {calibration.mountOrientationAtCapture ? (
            <Text style={styles.calMountLock}>
              マウント向き: {orientationLabel(calibration.mountOrientationAtCapture)}
              {calibration.mountOverrideAtCapture
                ? ` · 設定 ${
                    calibration.mountOverrideAtCapture === 'auto'
                      ? 'AUTO'
                      : orientationLabel(calibration.mountOverrideAtCapture)
                  }`
                : ''}
            </Text>
          ) : null}
          {calibration.deviceModel ? (
            <Text style={styles.calMountLock}>
              端末: {calibration.deviceModel}
            </Text>
          ) : null}
          <View style={styles.calDataGrid}>
            <CalRow label="横G オフセット"   value={`${signedStr(calibration.lateralGOffset, 4)} G`} />
            <CalRow label="前後G オフセット" value={`${signedStr(calibration.longitudinalGOffset, 4)} G`} />
            <CalRow label="ジャイロ X"       value={`${signedStr(calibration.gyroXOffset, 4)} rad/s`} />
            <CalRow label="ジャイロ Y"       value={`${signedStr(calibration.gyroYOffset, 4)} rad/s`} />
            <CalRow label="ジャイロ Z"       value={`${signedStr(calibration.gyroZOffset, 4)} rad/s`} />
            <CalRow label="サンプル数"        value={`${calibration.sampleCount}`} />
            {calibration.noiseVarianceG != null && calibration.noiseVarianceG > 0 ? (
              <CalRow
                label="静止ノイズ分散"
                value={`${calibration.noiseVarianceG.toExponential(2)} G²`}
              />
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.calDataBox}>
          <Text style={styles.calNoDataLabel}>キャリブレーション未実施</Text>
          <Text style={styles.calNoDataSub}>
            実施するまでセンサー生値を使用します
          </Text>
        </View>
      )}

      {/* ボタン行 */}
      <View style={styles.calBtnRow}>
        <GamePressable
          onPress={onCapture}
          disabled={isCapturing}
          style={({ pressed }) => [
            styles.calBtn,
            styles.calBtnPrimary,
            isCapturing && styles.calBtnDisabled,
            pressed && !isCapturing && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.calBtnLabel, styles.calBtnLabelPrimary]}>
            {isCapturing ? 'CAPTURING…' : 'CALIBRATE'}
          </Text>
        </GamePressable>

        {calibration ? (
          <GamePressable
            onPress={onClear}
            disabled={isCapturing}
            style={({ pressed }) => [
              styles.calBtn,
              pressed && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.calBtnLabel}>CLEAR</Text>
          </GamePressable>
        ) : null}
      </View>
    </TelemetryFrame>
  );
}

function CalRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.calRow}>
      <Text style={styles.calRowLabel}>{label}</Text>
      <Text style={styles.calRowValue}>{value}</Text>
    </View>
  );
}

// ── スタイル ────────────────────────────────────────────────

function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── ヘッダー ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    paddingRight: spacing.sm,
    minWidth: 60,
  },
  backLabel: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 9,
  },
  headerTitle: {
    flex: 1,
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 13,
    textAlign: 'center',
  },
  savedLabel: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 9,
    minWidth: 60,
    textAlign: 'right',
  },

  // ── スクロール ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },

  frame: {
    overflow: 'hidden',
  },

  // ── セクションヘッダー ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
  },

  // ── マウント向き ──
  frameHint: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.3,
    lineHeight: 14,
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  fieldTestBtn: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.neonGreen + '66',
    borderRadius: 4,
    backgroundColor: colors.neonGreen + '10',
    alignItems: 'center',
  },
  fieldTestBtnPressed: { opacity: 0.75 },
  fieldTestBtnLabel: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 11,
    letterSpacing: 1,
  },
  bgmTrackHint: {
    paddingTop: 0,
    paddingBottom: spacing.xs,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  feedbackText: {
    flex: 1,
    gap: 2,
  },
  feedbackLabel: {
    ...typography.label,
    color: colors.textPrimary,
    fontSize: 10,
    letterSpacing: 1,
  },
  feedbackDesc: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.2,
  },
  volumeRow: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  volumeRowDisabled: {
    opacity: 0.45,
  },
  volumeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  volumeLabelDisabled: {
    color: colors.textMuted,
  },
  volumeStepControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  mountRow: {
    flexDirection: 'row',
    padding: spacing.md,
    paddingTop: 0,
    gap: spacing.sm,
  },
  mountBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
  },
  mountBtnActive: {
    borderColor: colors.neonGreen,
    backgroundColor: '#00FF8810',
  },
  mountBtnPressed: {
    opacity: 0.7,
  },
  mountBtnLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
  },
  mountBtnLabelActive: {
    color: colors.neonGreen,
  },
  mountBtnDesc: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 7,
    marginTop: 3,
    textTransform: 'none',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  mountBtnDescActive: {
    color: colors.neonGreenDim,
  },

  // ── 閾値ヘッダー行 ──
  thresholdHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs + 2,
  },
  presetBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 2,
  },
  presetBtnActive: {
    borderColor: colors.neonGreenDim,
    backgroundColor: '#00CC6A14',
  },
  presetBtnLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
  },
  presetBtnLabelActive: {
    color: colors.neonGreenDim,
  },

  // ── 閾値行 ──
  threshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  threshLeft: {
    flex: 1,
    gap: 3,
  },
  threshLabel: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 10,
  },
  threshHint: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.3,
    lineHeight: 13,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },

  // ── ステップコントロール ──
  stepControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: {
    borderColor: '#111111',
  },
  stepBtnPressed: {
    borderColor: colors.neonGreen,
    backgroundColor: '#00FF8818',
  },
  stepBtnText: {
    fontFamily: 'monospace',
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  stepBtnTextDisabled: {
    color: '#222222',
  },
  stepValue: {
    alignItems: 'center',
    minWidth: 56,
  },
  stepValueText: {
    fontFamily: 'monospace',
    fontSize: 18,
    fontWeight: '700',
    color: colors.neonGreen,
    letterSpacing: 1,
  },
  stepUnit: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
    marginTop: 1,
  },

  // ── リセットボタン ──
  resetBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 3,
    alignItems: 'center',
  },
  resetBtnLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 2,
  },

  // ── フッターノート ──
  footerNote: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.5,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  smoothingDesc: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 11,
    letterSpacing: 1,
    textAlign: 'center',
  },
  smoothingHint: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 9,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // ── キャリブレーション ──
  calProgressWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: 6,
  },
  calProgressBg: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  calProgressFill: {
    height: 4,
    backgroundColor: colors.neonGreen,
    borderRadius: 2,
  },
  calProgressLabel: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 8,
    textAlign: 'right',
  },
  calDoneLabel: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 9,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  calErrorLabel: {
    ...typography.label,
    color: '#FF6666',
    fontSize: 9,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    textTransform: 'none',
    letterSpacing: 0.5,
  },
  calDataBox: {
    margin: spacing.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    gap: spacing.xs,
  },
  calDataTitle: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 9,
    textTransform: 'none',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  calMountLock: {
    ...typography.mono,
    color: colors.neonGreenDim,
    fontSize: 9,
    marginBottom: spacing.xs,
  },
  recalibBanner: {
    borderWidth: 1,
    borderColor: colors.amber + '88',
    borderRadius: 4,
    padding: spacing.sm,
    gap: 4,
    backgroundColor: colors.amber + '12',
    marginBottom: spacing.xs,
  },
  recalibTitle: {
    ...typography.label,
    fontSize: 9,
    letterSpacing: 1,
  },
  recalibBody: {
    ...typography.label,
    color: colors.textSecondary,
    fontSize: 9,
    textTransform: 'none',
    letterSpacing: 0.3,
    lineHeight: 14,
  },
  calDataGrid: {
    gap: 4,
  },
  calRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calRowLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
  },
  calRowValue: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  calNoDataLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    textAlign: 'center',
  },
  calNoDataSub: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 8,
    textAlign: 'center',
    textTransform: 'none',
    letterSpacing: 0.3,
  },
  calBtnRow: {
    flexDirection: 'row',
    padding: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  calBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 3,
    alignItems: 'center',
  },
  calBtnPrimary: {
    borderColor: colors.neonGreenDim,
    backgroundColor: '#00CC6A0A',
  },
  calBtnDisabled: {
    borderColor: '#222222',
    backgroundColor: 'transparent',
  },
  calBtnLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 2,
  },
  calBtnLabelPrimary: {
    color: colors.neonGreenDim,
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
