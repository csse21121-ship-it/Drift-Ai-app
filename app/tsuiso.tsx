/**
 * 追走（Tsuiso）採点モード — D1GP / FDJ 基準
 * 各端末で GPS UTC 録画 → JSON でオフライン同期 → Chase Score 算出
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { GamePressable } from '@/components/ui/GamePressable';
import { NeonButton } from '@/components/ui/NeonButton';
import { Header } from '@/components/telemetry/Header';
import { GpsPanel } from '@/components/telemetry/GpsPanel';
import { GMeter } from '@/components/telemetry/GMeter';
import { DriftIndicator } from '@/components/telemetry/DriftIndicator';
import { StartSequenceOverlay } from '@/components/telemetry/StartSequenceOverlay';
import { ScheduledStartStandbyOverlay } from '@/components/telemetry/ScheduledStartStandbyOverlay';
import { TsuisoBattleResultPanel } from '@/components/tsuiso/TsuisoBattleResultPanel';
import { TsuisoPenaltyPanel } from '@/components/tsuiso/TsuisoPenaltyPanel';
import { TsuisoDisplayNamePanel } from '@/components/tsuiso/TsuisoDisplayNamePanel';
import { TsuisoFlowGuide } from '@/components/tsuiso/TsuisoFlowGuide';
import { MountSetupOnboarding } from '@/components/onboarding/MountSetupOnboarding';
import { LoggerStatusBanner } from '@/components/logger/LoggerStatusBanner';
import { GpsIntegrityBanner } from '@/components/telemetry/GpsIntegrityBanner';
import { QualityIndicator } from '@/components/telemetry/QualityIndicator';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useStopBgmOnFocus } from '@/hooks/useStopBgmOnFocus';
import { useMergedTelemetry } from '@/hooks/useMergedTelemetry';
import { useDriftDetection } from '@/hooks/useDriftDetection';
import { useTelemetryLogRecord } from '@/hooks/useTelemetryLogRecord';
import { useScheduledTsuisoStart } from '@/hooks/useScheduledTsuisoStart';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useTsuisoSetBattle } from '@/hooks/useTsuisoSetBattle';
import { isMountSetupComplete } from '@/lib/onboardingStore';
import { boundingRegion } from '@/lib/geofence';
import {
  buildTsuisoRunExport,
  countSyncReadyPoints,
  pickAndImportTsuisoRun,
  shareTsuisoRunExport,
} from '@/lib/tsuisoExport';
import { compareTsuisoRuns, tsuisoTrackCoords } from '@/lib/tsuisoScoring';
import {
  consumePendingCompare,
  subscribePendingCompare,
} from '@/lib/tsuisoInboundBridge';
import {
  loadLocalTsuisoSession,
  saveLocalTsuisoSession,
} from '@/lib/tsuisoLocalSessionStore';
import { formatTargetLocalClock } from '@/lib/scheduledStartTime';
import { loadTsuisoProfile } from '@/lib/tsuisoProfileStore';
import { TSUISO_SCORE_MAX } from '@/types/score';
import type { TsuisoCompareResult, TsuisoRole, TsuisoRunExport } from '@/types/tsuiso';
import { getRunPairFromCollection } from '@/types/tsuisoBattle';

type ScreenPhase = 'select' | 'room' | 'record' | 'post' | 'compare' | 'set_result' | 'battle_final';

const MAP_HEIGHT = 260;

function ScoreBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const styles = useScoreBarStyles();
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.trackWrap}>
        <View style={[styles.trackFill, { width: `${Math.round(pct)}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.value}>{value.toFixed(1)}</Text>
      <Text style={styles.max}>/ {max}</Text>
    </View>
  );
}

function TsuisoDualTrackMap({
  lead,
  chase,
}: {
  lead: TsuisoRunExport;
  chase: TsuisoRunExport;
}) {
  const styles = useMapStyles();
  const { colors } = useTheme();

  const leadLabel = lead.driverLabel?.trim() || 'Lead';
  const chaseLabel = chase.driverLabel?.trim() || 'Chase';

  const leadCoords = useMemo(() => tsuisoTrackCoords(lead.telemetryLog), [lead]);
  const chaseCoords = useMemo(() => tsuisoTrackCoords(chase.telemetryLog), [chase]);

  const region = useMemo(() => {
    const all = [...leadCoords, ...chaseCoords];
    if (all.length < 2) return undefined;
    return boundingRegion(all);
  }, [leadCoords, chaseCoords]);

  if (leadCoords.length < 2 && chaseCoords.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>GPS 軌跡データがありません</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={region}
        scrollEnabled
        zoomEnabled
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {leadCoords.length >= 2 ? (
          <Polyline
            coordinates={leadCoords}
            strokeColor={colors.neonGreen + 'CC'}
            strokeWidth={3}
          />
        ) : null}
        {chaseCoords.length >= 2 ? (
          <Polyline
            coordinates={chaseCoords}
            strokeColor={colors.amber + 'CC'}
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        ) : null}
      </MapView>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.neonGreen }]} />
          <Text style={styles.legendText}>{leadLabel} (Lead)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.amber }]} />
          <Text style={styles.legendText}>{chaseLabel} (Chase)</Text>
        </View>
      </View>
    </View>
  );
}

export default function TsuisoScreen() {
  const styles = useStyles();
  const { colors, spacing } = useTheme();
  useStopBgmOnFocus();
  const { settings } = useSettings();

  const [phase, setPhase] = useState<ScreenPhase>('select');
  const [role, setRole] = useState<TsuisoRole | null>(null);
  const [showMountSetup, setShowMountSetup] = useState(false);
  const [ownRun, setOwnRun] = useState<TsuisoRunExport | null>(null);
  const [compareResult, setCompareResult] = useState<TsuisoCompareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [localChaseReady, setLocalChaseReady] = useState(false);
  const [joinPinInput, setJoinPinInput] = useState('');
  const [roomBusy, setRoomBusy] = useState(false);
  const [matchMode, setMatchMode] = useState<'realtime' | 'offline'>('realtime');
  const [displayName, setDisplayName] = useState('');

  const sessionStartRef = useRef(0);
  const ownRunRef = useRef<TsuisoRunExport | null>(null);
  const displayNameRef = useRef('');
  const resetTelemetryLogRef = useRef<() => void>(() => undefined);

  const realtime = useRealtimeSync();
  const battle = useTsuisoSetBattle(role);

  useEffect(() => {
    void loadTsuisoProfile().then((profile) => {
      setDisplayName(profile.displayName);
      displayNameRef.current = profile.displayName;
    });
  }, []);

  const handleDisplayNameChange = useCallback((name: string) => {
    setDisplayName(name);
    displayNameRef.current = name;
  }, []);

  const {
    motion,
    gps,
    error,
    toggle,
    setSessionStartAt,
    mountOrientation,
    mountOrientationUnstable,
    mountOrientationAuto,
    slipAngleDeg,
    effectiveThresholds,
    telemetryQuality,
    gpsIntegrity,
    gpsMonitor,
    grade,
  } = useMergedTelemetry({
    mountOverride: settings.mountOverride,
    baseThresholds: settings.thresholds,
  });

  const beginRecording = useCallback((targetUtcMs: number) => {
    sessionStartRef.current = targetUtcMs;
    resetTelemetryLogRef.current();
  }, []);

  const onArmSensors = useCallback(async () => {
    await toggle();
  }, [toggle]);

  const onDisarmSensors = useCallback(async () => {
    await toggle();
  }, [toggle]);

  const {
    phase: scheduledPhase,
    isArmed,
    isStartSequence,
    isRecording,
    metersLive,
    targetUtcMs,
    remainingMs,
    sequencePhase,
    systemLines,
    countdown,
    arm,
    disarm,
    finishRecording,
    bumpTarget,
    resetTargetToNext,
  } = useScheduledTsuisoStart({
    feedback: settings.feedback,
    onArmSensors,
    onDisarmSensors,
    setSessionStartAt,
    onGo: beginRecording,
  });

  const { status: driftStatus } = useDriftDetection({
    motion,
    gps,
    isActive: isRecording,
    slipAngleDeg,
    thresholds: effectiveThresholds,
    surfaceCondition: settings.surfaceCondition,
  });

  const { reset: resetTelemetryLog, getLog: getTelemetryLog } = useTelemetryLogRecord(
    isRecording,
    motion,
    gps,
    sessionStartRef.current,
    driftStatus,
  );
  resetTelemetryLogRef.current = resetTelemetryLog;

  const applyCompareResult = useCallback((result: TsuisoCompareResult) => {
    setCompareResult(result);
    setPhase('compare');
  }, []);

  const runTsuisoCompare = useCallback(
    (leadExport: TsuisoRunExport, chaseExport: TsuisoRunExport): boolean => {
      const compared = compareTsuisoRuns(leadExport, chaseExport);
      if (compared.score.alignedSampleCount < 5) {
        Alert.alert(
          '同期失敗',
          '先行と後追いの GPS 絶対時刻が重なりません。同じスケジュール GO で走行したか確認してください。',
        );
        return false;
      }
      if (!compared.score.isValid) {
        Alert.alert(
          '採点不可',
          compared.score.invalidReason ??
            'ドリフト走行が検出されませんでした。屋外で GPS が安定した状態で、実際にドリフトしてから再試行してください。',
        );
        return false;
      }
      applyCompareResult(compared);
      return true;
    },
    [applyCompareResult],
  );

  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingCompare();
      if (pending) {
        applyCompareResult(pending.result);
      }
    }, [applyCompareResult]),
  );

  useEffect(() => {
    return subscribePendingCompare((pending) => {
      applyCompareResult(pending.result);
    });
  }, [applyCompareResult]);

  useFocusEffect(
    useCallback(() => {
      if (role === 'chase') {
        void loadLocalTsuisoSession('chase').then((s) => setLocalChaseReady(s != null));
      } else {
        setLocalChaseReady(false);
      }
    }, [role]),
  );

  const processRunIngest = useCallback(
    async (run: TsuisoRunExport, runIndex: number) => {
      if (matchMode !== 'realtime' || !role) return;

      const peerName = realtime.peerInfo.displayName;
      const selfName = displayNameRef.current;
      const { scored, nextPhase, battleState } = battle.ingestRun(
        run,
        runIndex,
        selfName,
        peerName,
      );

      if (!scored) {
        const pair = getRunPairFromCollection(battle.runCollection, runIndex);
        if (pair.lead && pair.chase) {
          const check = compareTsuisoRuns(pair.lead, pair.chase);
          if (check.score.alignedSampleCount >= 5 && !check.score.isValid) {
            Alert.alert(
              '採点不可',
              check.score.invalidReason ??
                'ドリフト走行が検出されませんでした。実走で再試行してください。',
            );
          }
        }
        return;
      }

      if (battleState && role === 'lead') {
        await realtime.broadcastBattleState(battleState);
      }

      if (battleState?.outcome && battleState.phase === 'battle_final') {
        battle.applyBattleState({ version: 1, ...battleState, sentAtUtcMs: Date.now() });
        setPhase('battle_final');
        return;
      }

      if (battleState?.outcome && battleState.phase === 'sd_run1') {
        battle.applyBattleState({ version: 1, ...battleState, sentAtUtcMs: Date.now() });
        setPhase('set_result');
        return;
      }

      if (nextPhase === 'run2' || nextPhase === 'sd_run2') {
        battle.setBattlePhase(nextPhase);
        setOwnRun(null);
        ownRunRef.current = null;
        setPhase('record');
      }
    },
    [battle, matchMode, role, realtime],
  );

  useEffect(() => {
    if (matchMode !== 'realtime' || !role) return;

    realtime.registerRunHandler(({ run, meta }) => {
      void processRunIngest(run, meta.runIndex);
    });

    realtime.registerBattleStateHandler((state) => {
      battle.applyBattleState(state);

      if (state.phase === 'battle_final' && state.outcome) {
        setPhase('battle_final');
        return;
      }

      if (state.phase === 'sd_run1' && !state.outcome) {
        setOwnRun(null);
        ownRunRef.current = null;
        setPhase('record');
        return;
      }

      if (state.phase === 'set_result' || (state.phase === 'sd_run1' && state.outcome?.winner === 'tie')) {
        setPhase('set_result');
        return;
      }

      if (state.phase === 'run2' || state.phase === 'sd_run2') {
        setOwnRun(null);
        ownRunRef.current = null;
        setPhase('record');
      }
    });
  }, [battle, matchMode, processRunIngest, realtime, role]);

  const beginArm = useCallback(async () => {
    const setupDone = await isMountSetupComplete();
    if (!setupDone) {
      setShowMountSetup(true);
      return;
    }
    await arm();
  }, [arm]);

  const handleRecordPress = useCallback(async () => {
    if (isRecording) {
      const sessionDurationMs = Date.now() - sessionStartRef.current;
      const log = getTelemetryLog();
      const syncPoints = countSyncReadyPoints(log);

      if (syncPoints < 10) {
        Alert.alert(
          'GPS データ不足',
          '追走同期には GPS 座標付きログが必要です。屋外で GPS が安定してから再試行してください。',
        );
        return;
      }

      const runRole =
        matchMode === 'realtime' && battle.currentRunRole ? battle.currentRunRole : role!;
      const runIndex = battle.currentAbsoluteRunIndex ?? 0;

      const exportData = buildTsuisoRunExport(
        runRole,
        log,
        sessionStartRef.current,
        sessionDurationMs,
        displayNameRef.current.trim() || undefined,
      );
      setOwnRun(exportData);
      ownRunRef.current = exportData;
      await saveLocalTsuisoSession(exportData);
      await toggle();
      finishRecording();

      if (matchMode === 'realtime' && realtime.isSyncReady) {
        const syncResult = await realtime.broadcastRun(exportData, {
          runIndex,
          isSuddenDeath: battle.isSuddenDeath,
        });
        void processRunIngest(exportData, runIndex);
        realtime.markWaitingPeerRun();
        if (syncResult === 'failed') {
          setPhase('post');
          return;
        }
      } else if (matchMode === 'offline' && role === 'chase') {
        // オフライン単発: Lead インポート待ち
      }

      setPhase('post');
    } else if (isArmed || isStartSequence) {
      await disarm();
    } else {
      await beginArm();
    }
  }, [
    isRecording,
    isArmed,
    isStartSequence,
    role,
    getTelemetryLog,
    toggle,
    finishRecording,
    disarm,
    beginArm,
    matchMode,
    realtime,
    battle,
    processRunIngest,
  ]);

  const handleShare = useCallback(async () => {
    if (!ownRun) return;
    setBusy(true);
    const result = await shareTsuisoRunExport(ownRun);
    setBusy(false);
    if (result === 'failed') {
      Alert.alert('共有失敗', '.tsuiso ファイルの共有に失敗しました。');
    } else if (result === 'unavailable') {
      Alert.alert('共有不可', 'この端末では共有シートを利用できません。');
    }
  }, [ownRun]);

  const handleImportLead = useCallback(async () => {
    setBusy(true);
    const result = await pickAndImportTsuisoRun('lead');
    setBusy(false);

    if (!result.ok) {
      if (result.reason === 'cancelled') return;
      const messages: Record<string, string> = {
        parse_error: 'JSON の読み込みに失敗しました。',
        invalid_format: 'DriftScore 追走データではないか、先行 (Lead) ファイルではありません。',
        insufficient_gps: 'GPS 座標付きログが不足しています。',
      };
      Alert.alert('インポート失敗', messages[result.reason] ?? '不明なエラー');
      return;
    }

    if (!ownRun || ownRun.role !== 'chase') {
      const chaseSession = await loadLocalTsuisoSession('chase');
      if (!chaseSession) {
        Alert.alert('エラー', '後追い (Chase) のローカルセッションがありません。');
        return;
      }
      runTsuisoCompare(result.data, chaseSession.run);
      return;
    }

    runTsuisoCompare(result.data, ownRun);
  }, [ownRun, runTsuisoCompare]);

  const resetAll = useCallback(() => {
    void realtime.leaveRoom();
    battle.resetBattle();
    setPhase('select');
    setRole(null);
    setOwnRun(null);
    ownRunRef.current = null;
    setCompareResult(null);
    setJoinPinInput('');
    setMatchMode('realtime');
  }, [realtime, battle]);

  const handleSuddenDeathStart = useCallback(async () => {
    battle.continueToSuddenDeath();
    if (role === 'lead' && realtime.isSyncReady) {
      await realtime.broadcastBattleState({
        phase: 'sd_run1',
        runIndex: 2,
        isSuddenDeath: true,
      });
    }
    setOwnRun(null);
    ownRunRef.current = null;
    setPhase('record');
  }, [battle, role, realtime]);

  const startOfflineRole = useCallback((r: TsuisoRole) => {
    setMatchMode('offline');
    setRole(r);
    setPhase('record');
    setOwnRun(null);
    ownRunRef.current = null;
    setCompareResult(null);
  }, []);

  const handleCreateRoom = useCallback(async () => {
    if (!realtime.isAvailable) {
      Alert.alert(
        'リアルタイム未設定',
        'Supabase 環境変数 (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY) が未設定です。オフラインモードをご利用ください。',
      );
      return;
    }
    setRoomBusy(true);
    const newPin = await realtime.createRoom(displayNameRef.current.trim() || displayName);
    setRoomBusy(false);
    if (!newPin) {
      Alert.alert(
        '接続失敗',
        realtime.errorMessage ??
          'ルーム作成に失敗しました。Supabase の設定（Realtime / 匿名認証）と通信環境を確認してください。',
      );
      return;
    }
    setMatchMode('realtime');
    setRole('lead');
    setPhase('room');
  }, [realtime, displayName]);

  const handleJoinRoom = useCallback(async () => {
    if (!realtime.isAvailable) {
      Alert.alert('リアルタイム未設定', 'Supabase 環境変数が未設定です。');
      return;
    }
    const pin = joinPinInput.trim();
    if (!/^\d{4}$/.test(pin)) {
      Alert.alert('PIN エラー', '4桁の PIN コードを入力してください。');
      return;
    }
    setRoomBusy(true);
    const result = await realtime.joinRoom(pin, displayNameRef.current.trim() || displayName);
    setRoomBusy(false);
    if (result === 'expired') {
      Alert.alert('PIN 期限切れ', 'この PIN は有効期限（30分）を過ぎています。Lead に新しいルームを作成してもらってください。');
      return;
    }
    if (result === 'invalid_pin') {
      Alert.alert('PIN エラー', '4桁の PIN コードを入力してください。');
      return;
    }
    if (result !== 'ok') {
      Alert.alert('接続失敗', 'ルーム入室に失敗しました。PIN と通信環境を確認してください。');
      return;
    }
    setMatchMode('realtime');
    setRole('chase');
    setPhase('room');
  }, [joinPinInput, realtime, displayName]);

  const enterRecordFromRoom = useCallback(() => {
    if (!realtime.isSyncReady) {
      Alert.alert('未接続', '相手との接続（Sync Ready）が完了するまでお待ちください。');
      return;
    }
    battle.beginSetBattle();
    setPhase('record');
  }, [realtime.isSyncReady, battle]);

  const headerStatus = isRecording ? 'recording' : isArmed || isStartSequence ? 'arming' : 'idle';
  const isScheduledIdle = scheduledPhase === 'idle';
  const activeRunRole =
    matchMode === 'realtime' && battle.currentRunRole ? battle.currentRunRole : role;
  const roleLabel =
    activeRunRole === 'lead'
      ? '先行 LEAD'
      : activeRunRole === 'chase'
        ? '後追い CHASE'
        : 'TSUISO';

  const battleRunLabel = useMemo(() => {
    if (matchMode !== 'realtime') return null;
    switch (battle.battlePhase) {
      case 'run1':
        return 'SET Run 1 / 2 — 先行→後追い';
      case 'run2':
        return 'SET Run 2 / 2 — 役割入替';
      case 'sd_run1':
        return 'SUDDEN DEATH Run 1 / 2';
      case 'sd_run2':
        return 'SUDDEN DEATH Run 2 / 2';
      default:
        return null;
    }
  }, [battle.battlePhase, matchMode]);

  const roomStatusLabel = useMemo(() => {
    switch (realtime.status) {
      case 'connecting':
        return 'CONNECTING…';
      case 'waiting_peer':
        return 'WAITING FOR PEER';
      case 'connected':
        return 'SYNC READY';
      case 'expired':
        return 'PIN EXPIRED';
      case 'error':
        return 'CONNECTION ERROR';
      case 'disconnected':
        return 'DISCONNECTED';
      default:
        return 'STANDBY';
    }
  }, [realtime.status]);

  useEffect(() => {
    if (realtime.isExpired && (phase === 'room' || phase === 'record' || phase === 'post')) {
      Alert.alert(
        'PIN 期限切れ',
        'ルームの有効期限（30分）が切れました。再度ルームを作成するか、オフラインモードをご利用ください。',
        [{ text: 'OK', onPress: resetAll }],
      );
    }
  }, [realtime.isExpired, phase, resetAll]);

  if (phase === 'select') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header
          status="idle"
          mountOrientation={mountOrientation}
          mountOrientationAuto={mountOrientationAuto}
          mountOrientationUnstable={mountOrientationUnstable}
          subtitle="追走採点"
          onBackPress={() => router.replace('/home')}
        />
        <ScrollView contentContainerStyle={styles.selectContent}>
          <Text style={styles.kicker}>D1GP / FDJ 基準</Text>
          <Text style={styles.title}>追走（Tsuiso）モード</Text>
          <Text style={styles.desc}>
            2台でセットバトル（先行・後追い各1本）を採点。オンラインルーム（PIN）または圏外時は .tsuiso 手動同期。
          </Text>

          <TsuisoFlowGuide variant="full" />

          <TsuisoDisplayNamePanel onNameChange={handleDisplayNameChange} />

          <Text style={styles.sectionLabel}>オンライン — リアルタイムルーム</Text>

          <GamePressable
            onPress={handleCreateRoom}
            style={({ pressed }) => [styles.roleCard, styles.roleLead, pressed && styles.rolePressed]}
          >
            <Text style={styles.roleIcon}>◆</Text>
            <Text style={styles.roleTitle}>ルームを作成 (Lead)</Text>
            <Text style={styles.roleDesc}>
              4桁 PIN を発行（30分有効）。Chase が入室後、セットバトル（2走行）を開始。
            </Text>
          </GamePressable>

          <View style={styles.joinPanel}>
            <Text style={styles.roleTitle}>ルームに入る (Chase)</Text>
            <Text style={styles.roleDesc}>Lead から教えてもらった 4桁 PIN を入力</Text>
            <TextInput
              style={styles.pinInput}
              value={joinPinInput}
              onChangeText={(t) => setJoinPinInput(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="4829"
              placeholderTextColor={colors.textMuted}
            />
            <NeonButton
              label={roomBusy ? '接続中…' : 'PIN で入室'}
              variant="primary"
              onPress={handleJoinRoom}
              disabled={roomBusy}
            />
          </View>

          <Text style={styles.sectionLabel}>オフライン — 圏外・手動同期</Text>

          <Text style={styles.offlineHint}>
            各端末で Lead / Chase として記録し、STOP 後に .tsuiso を共有（AirDrop 等）して採点します。
          </Text>

          <GamePressable
            onPress={() => startOfflineRole('lead')}
            style={({ pressed }) => [styles.offlineBtn, pressed && styles.rolePressed]}
          >
            <Text style={styles.offlineBtnText}>Lead として記録開始</Text>
          </GamePressable>

          <GamePressable
            onPress={() => startOfflineRole('chase')}
            style={({ pressed }) => [styles.offlineBtn, pressed && styles.rolePressed]}
          >
            <Text style={styles.offlineBtnText}>Chase として記録開始</Text>
          </GamePressable>

        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'room') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header
          status={realtime.isSyncReady ? 'idle' : 'arming'}
          mountOrientation={mountOrientation}
          mountOrientationAuto={mountOrientationAuto}
          mountOrientationUnstable={mountOrientationUnstable}
          subtitle={roleLabel}
          onBackPress={resetAll}
        />
        <ScrollView contentContainerStyle={styles.roomContent}>
          <Text style={styles.kicker}>REALTIME ROOM</Text>
          <Text style={styles.title}>
            {role === 'lead' ? 'ルーム待機中 (Lead)' : 'ルーム接続 (Chase)'}
          </Text>

          {role === 'lead' && realtime.pin ? (
            <>
              <Text style={styles.pinLabel}>ROOM PIN</Text>
              <Text style={styles.pinDisplay}>{realtime.pin}</Text>
              <Text style={styles.desc}>Chase ドライバーにこの PIN を伝えてください</Text>
              {realtime.pinRemainingLabel ? (
                <Text style={styles.pinExpiry}>有効期限: 残り {realtime.pinRemainingLabel}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.desc}>PIN: {realtime.pin ?? joinPinInput}</Text>
              {realtime.pinRemainingLabel ? (
                <Text style={styles.pinExpiry}>有効期限: 残り {realtime.pinRemainingLabel}</Text>
              ) : null}
            </>
          )}

          <View
            style={[
              styles.roomStatusBadge,
              realtime.isSyncReady && styles.roomStatusConnected,
              realtime.isSyncReady && styles.syncReadyBadge,
            ]}
          >
            <Text style={[styles.roomStatusText, realtime.isSyncReady && styles.syncReadyText]}>
              {roomStatusLabel}
            </Text>
          </View>

          {realtime.isSyncReady ? (
            <Text style={styles.syncReadyHint}>
              相手と接続されました。1セット = 先行1本 + 後追い1本（役割入替）。同点時はサドンデス。
            </Text>
          ) : null}

          {realtime.errorMessage && realtime.hasError ? (
            <Text style={styles.errorHint}>{realtime.errorMessage}</Text>
          ) : null}

          {displayName ? (
            <Text style={styles.roomNameLine}>あなた: {displayName}</Text>
          ) : null}
          {realtime.isSyncReady && realtime.peerInfo.displayName ? (
            <Text style={styles.roomNameLine}>
              相手 ({realtime.peerInfo.role === 'lead' ? 'Lead' : 'Chase'}):{' '}
              {realtime.peerInfo.displayName}
            </Text>
          ) : realtime.isSyncReady ? (
            <Text style={styles.roomNameLineMuted}>相手: 接続済み（表示名なし）</Text>
          ) : null}

          <NeonButton
            label={realtime.isSyncReady ? '走行準備へ →' : '接続待ち…'}
            variant="primary"
            onPress={enterRecordFromRoom}
            disabled={!realtime.isSyncReady}
          />

          <NeonButton label="ルームを退出" variant="secondary" onPress={resetAll} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'set_result' && battle.regularOutcome && role) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header
          status="idle"
          mountOrientation={mountOrientation}
          mountOrientationAuto={mountOrientationAuto}
          mountOrientationUnstable={mountOrientationUnstable}
          subtitle="セット結果"
          onBackPress={resetAll}
        />
        <ScrollView contentContainerStyle={styles.resultContent}>
          <TsuisoBattleResultPanel
            outcome={battle.regularOutcome}
            selfRoomRole={role}
            onContinueSuddenDeath={handleSuddenDeathStart}
            onFinish={resetAll}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'battle_final' && battle.finalOutcome && role) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header
          status="idle"
          mountOrientation={mountOrientation}
          mountOrientationAuto={mountOrientationAuto}
          mountOrientationUnstable={mountOrientationUnstable}
          subtitle="バトル結果"
          onBackPress={resetAll}
        />
        <ScrollView contentContainerStyle={styles.resultContent}>
          <TsuisoBattleResultPanel
            outcome={battle.finalOutcome}
            selfRoomRole={role}
            onFinish={resetAll}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'compare' && compareResult) {
    const { score } = compareResult;
    const leadName = compareResult.lead.driverLabel?.trim() || 'Lead';
    const chaseName = compareResult.chase.driverLabel?.trim() || 'Chase';
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header
          status="idle"
          mountOrientation={mountOrientation}
          mountOrientationAuto={mountOrientationAuto}
          mountOrientationUnstable={mountOrientationUnstable}
          subtitle="追走リザルト"
          onBackPress={resetAll}
        />
        <ScrollView contentContainerStyle={styles.resultContent}>
          <Text style={styles.kicker}>TSUISO SCORE</Text>
          {!score.isValid ? (
            <>
              <Text style={[styles.totalScore, { color: colors.amber, fontSize: 28 }]}>
                採点不可
              </Text>
              <Text style={styles.invalidReason}>
                {score.invalidReason ??
                  'ドリフト走行が検出されませんでした。机固定や直進のみでは採点されません。'}
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.totalScore, { color: score.infractionLoss ? colors.recRed : colors.neonGreen }]}>
                {score.total.toFixed(1)}
              </Text>
              <Text style={styles.totalLabel}>
                {score.penaltyTotal > 0
                  ? `総合追走スコア（減点後）/ ${TSUISO_SCORE_MAX.total} Pts`
                  : `総合追走スコア / ${TSUISO_SCORE_MAX.total} Pts`}
              </Text>
              {score.grossTotal > score.total && score.penaltyTotal > 0 ? (
                <Text style={styles.grossHint}>
                  素点 {score.grossTotal.toFixed(1)} − 減点 {score.penaltyTotal.toFixed(1)}
                </Text>
              ) : null}
            </>
          )}
          <Text style={styles.driverPairLabel}>
            {leadName} (Lead) vs {chaseName} (Chase)
          </Text>

          <View style={styles.scoreCard}>
            <ScoreBar
              label="A: 近接度 Proximity"
              value={score.proximity}
              max={TSUISO_SCORE_MAX.proximity}
              color={colors.neonGreen}
            />
            <ScoreBar
              label="B: 角度同調 Angle"
              value={score.angleMatch}
              max={TSUISO_SCORE_MAX.angleMatch}
              color={colors.amber}
            />
            <ScoreBar
              label="C: 振返同調 Transition"
              value={score.transitionSync}
              max={TSUISO_SCORE_MAX.transitionSync}
              color={colors.gold}
            />
          </View>

          <TsuisoPenaltyPanel score={score} chaseOnly />

          <View style={styles.statsGrid}>
            <StatCell label="平均距離" value={`${score.avgDistanceM.toFixed(1)} m`} />
            <StatCell label="平均角度差" value={`${score.avgAngleDeltaDeg.toFixed(1)}°`} />
            <StatCell label="振返ラグ" value={`${(score.avgTransitionLagMs / 1000).toFixed(2)} s`} />
            <StatCell label="ドリフト区間" value={`${score.driftFrameCount} fr`} />
          </View>

          <Text style={styles.sectionTitle}>走行軌跡比較</Text>
          <TsuisoDualTrackMap lead={compareResult.lead} chase={compareResult.chase} />

          <NeonButton label="新しい追走を開始" variant="secondary" onPress={resetAll} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'post' && ownRun) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header
          status="idle"
          mountOrientation={mountOrientation}
          mountOrientationAuto={mountOrientationAuto}
          mountOrientationUnstable={mountOrientationUnstable}
          subtitle={roleLabel}
          onBackPress={resetAll}
        />
        <ScrollView contentContainerStyle={styles.postContent}>
          <Text style={styles.kicker}>LOCAL SESSION SAVED</Text>
          <Text style={styles.title}>
            {ownRun.role === 'lead' ? '先行記録を保存しました' : '後追い記録を保存しました'}
          </Text>
          <Text style={styles.desc}>
            GPS 同期ポイント: {countSyncReadyPoints(ownRun.telemetryLog)} 点 /{' '}
            {Math.round(ownRun.sessionDurationMs / 1000)} 秒
          </Text>

          <NeonButton
            label={busy ? '共有中…' : '.tsuiso を共有 (AirDrop 等)'}
            onPress={handleShare}
            disabled={busy}
          />

          {realtime.syncFailed || (matchMode === 'realtime' && realtime.waitingPeerRun) ? (
            <View style={styles.fallbackBox}>
              {realtime.syncFailed ? (
                <>
                  <Text style={styles.fallbackTitle}>通信に失敗しました</Text>
                  <Text style={styles.fallbackText}>
                    AirDrop での共有に切り替えます。Lead の場合は .tsuiso を送信、Chase の場合は Lead データを受信してください。
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.fallbackTitle}>相手の走行データ待機中…</Text>
                  <Text style={styles.fallbackText}>
                    セット採点のため、両方の走行データが揃うまでお待ちください。Run 2 へ自動遷移します。
                  </Text>
                </>
              )}
              {ownRun.role === 'chase' ? (
                <NeonButton
                  label={busy ? '読込中…' : 'Lead .tsuiso を手動インポート'}
                  variant="primary"
                  onPress={handleImportLead}
                  disabled={busy}
                />
              ) : null}
            </View>
          ) : null}

          {matchMode === 'offline' && ownRun.role === 'chase' ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Post-Run Merge（オフライン）</Text>
              <Text style={styles.desc}>
                Lead の .tsuiso を AirDrop で受信するか、手動インポートして採点してください。
              </Text>
              <NeonButton
                label={busy ? '読込中…' : 'Lead .tsuiso を手動インポート'}
                variant="primary"
                onPress={handleImportLead}
                disabled={busy}
              />
            </>
          ) : null}

          {matchMode === 'offline' && ownRun.role === 'lead' ? (
            <View style={styles.leadDoneBox}>
              <Text style={styles.leadDoneText}>
                後追いドライバーに .tsuiso を AirDrop してください。
              </Text>
            </View>
          ) : null}

          {matchMode === 'realtime' && !realtime.syncFailed ? (
            <View style={styles.leadDoneBox}>
              <Text style={styles.leadDoneText}>
                走行データを Broadcast 送信しました。両走行が揃うとセット採点され、Run 2 / 結果画面へ自動遷移します。
              </Text>
            </View>
          ) : null}

          <NeonButton label="ホームに戻る" variant="secondary" onPress={() => router.replace('/home')} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header
        status={headerStatus}
        mountOrientation={mountOrientation}
        mountOrientationAuto={mountOrientationAuto}
        mountOrientationUnstable={mountOrientationUnstable}
        subtitle={roleLabel}
        onBackPress={isRecording || isArmed || isStartSequence ? undefined : resetAll}
      />
      <LoggerStatusBanner variant="inline" />
      <QualityIndicator quality={telemetryQuality} visible={metersLive} />
      <GpsIntegrityBanner integrity={gpsIntegrity} visible={metersLive} />

      <ScheduledStartStandbyOverlay
        visible={isArmed}
        targetUtcMs={targetUtcMs}
        remainingMs={remainingMs}
        onDisarm={handleRecordPress}
      />

      <StartSequenceOverlay
        visible={isStartSequence}
        sequencePhase={sequencePhase}
        systemLines={[...systemLines]}
        countdown={countdown}
        onAbort={handleRecordPress}
      />

      <ScrollView contentContainerStyle={styles.recordContent}>
        {matchMode === 'realtime' ? (
          <View style={styles.roomLiveBadge}>
            <Text style={styles.roomLiveText}>
              {realtime.isSyncReady
                ? `◆ ROOM ${realtime.pin} · SYNC READY`
                : `ROOM ${realtime.pin} · ${roomStatusLabel}`}
            </Text>
            {battleRunLabel ? (
              <Text style={[styles.roomLiveText, { marginTop: 4, color: colors.amber }]}>
                {battleRunLabel}
              </Text>
            ) : null}
          </View>
        ) : null}

        {isScheduledIdle ? (
          <View style={styles.targetPanel}>
            <Text style={styles.targetKicker}>SCHEDULED START</Text>
            <Text style={styles.targetLabel}>ターゲット時刻（30秒区切り）</Text>
            <Text style={styles.targetClock}>{formatTargetLocalClock(targetUtcMs)}</Text>
            <View style={styles.targetActions}>
              <GamePressable
                onPress={() => bumpTarget(-1)}
                style={({ pressed }) => [styles.targetBtn, pressed && styles.targetBtnPressed]}
              >
                <Text style={styles.targetBtnText}>-30s</Text>
              </GamePressable>
              <GamePressable
                onPress={resetTargetToNext}
                style={({ pressed }) => [styles.targetBtn, styles.targetBtnPrimary, pressed && styles.targetBtnPressed]}
              >
                <Text style={[styles.targetBtnText, styles.targetBtnTextPrimary]}>次の30秒</Text>
              </GamePressable>
              <GamePressable
                onPress={() => bumpTarget(1)}
                style={({ pressed }) => [styles.targetBtn, pressed && styles.targetBtnPressed]}
              >
                <Text style={styles.targetBtnText}>+30s</Text>
              </GamePressable>
            </View>
            <Text style={styles.targetHint}>
              両車で同じ時刻を設定して ARM。T-30s から状況アナウンス → T-5s でスタート演出 → GO で計測開始。
            </Text>
          </View>
        ) : null}

        {role === 'chase' && localChaseReady && matchMode === 'offline' ? (
          <View style={styles.ghostBadge}>
            <Text style={styles.ghostBadgeText}>
              ◆ CHASE LOCAL SESSION 保存済 — Lead .tsuiso 受信で採点
            </Text>
          </View>
        ) : null}

        <GMeter
          motion={motion}
          isActive={metersLive}
          meterMode={isRecording ? 'live' : isArmed || isStartSequence ? 'preflight' : 'standby'}
        />
        <DriftIndicator
          status={driftStatus}
          motion={motion}
          slipAngleDeg={slipAngleDeg}
          preflight={isArmed || isStartSequence}
        />
        <GpsPanel gps={gps} isActive={metersLive} gpsMonitor={gpsMonitor} grade={grade} />
        {error ? (
          <View style={[styles.errorBox, { marginTop: spacing.sm }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <Text style={styles.recordHint}>
          {isRecording
            ? '走行中 — 停止でローカルセッション保存'
            : matchMode === 'realtime'
              ? `${roleLabel} — ターゲット時刻を合わせて ARM → GO`
              : activeRunRole === 'lead'
                ? '先行: ターゲット時刻を合わせて ARM → GO → .tsuiso 共有'
                : '後追い: 同じ GO 時刻で走行 → Lead .tsuiso 受信で Merge'}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <NeonButton
          label={
            isRecording
              ? '記録停止'
              : isArmed || isStartSequence
                ? 'ARM 解除'
                : 'ARM — スケジュールスタート'
          }
          variant={isRecording ? 'danger' : isArmed || isStartSequence ? 'secondary' : 'primary'}
          large
          onPress={handleRecordPress}
        />
      </View>

      <MountSetupOnboarding visible={showMountSetup} onClose={() => setShowMountSetup(false)} />
    </SafeAreaView>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  const styles = useStatStyles();
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function useStyles() {
  const { colors, spacing, typography } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: colors.background },
        selectContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
        resultContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
        postContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
        recordContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.lg },
        kicker: { ...typography.label, color: colors.neonGreen, letterSpacing: 2, fontSize: 11 },
        title: { ...typography.title, color: colors.textPrimary, fontSize: 22 },
        desc: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
        roleCard: {
          borderWidth: 2,
          borderRadius: 12,
          padding: spacing.md,
          gap: spacing.xs,
        },
        roleLead: { borderColor: colors.neonGreen + '88', backgroundColor: colors.neonGreenMuted },
        roleChase: { borderColor: colors.amber + '88', backgroundColor: colors.amber + '11' },
        rolePressed: { opacity: 0.85 },
        roleIcon: { fontSize: 24, color: colors.textPrimary },
        roleTitle: { ...typography.title, color: colors.textPrimary, fontSize: 16 },
        roleDesc: { color: colors.textSecondary, fontSize: 14 },
        offlineHint: {
          color: colors.textMuted,
          fontSize: 13,
          lineHeight: 20,
        },
        totalScore: { fontSize: 72, fontWeight: '800', textAlign: 'center' },
        totalLabel: { color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm, fontSize: 14 },
        grossHint: { color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm, fontSize: 12 },
        invalidReason: {
          color: colors.amber,
          textAlign: 'center',
          marginBottom: spacing.md,
          fontSize: 14,
          lineHeight: 22,
          paddingHorizontal: spacing.sm,
        },
        scoreCard: {
          padding: spacing.md,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          gap: spacing.sm,
        },
        statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
        sectionTitle: { ...typography.title, color: colors.textPrimary, fontSize: 16, marginTop: spacing.sm },
        divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
        leadDoneBox: {
          padding: spacing.md,
          borderRadius: 8,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.neonGreen + '44',
        },
        leadDoneText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
        recordHint: { ...typography.label, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, fontSize: 10 },
        sectionLabel: {
          ...typography.label,
          color: colors.textMuted,
          fontSize: 9,
          letterSpacing: 3,
          marginTop: spacing.sm,
        },
        joinPanel: {
          borderWidth: 2,
          borderRadius: 12,
          borderColor: colors.amber + '88',
          backgroundColor: colors.amber + '11',
          padding: spacing.md,
          gap: spacing.sm,
        },
        pinInput: {
          ...typography.mono,
          fontSize: 28,
          fontWeight: '800',
          letterSpacing: 8,
          textAlign: 'center',
          color: colors.textPrimary,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingVertical: spacing.sm,
          backgroundColor: colors.surface,
        },
        offlineBtn: {
          padding: spacing.md,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        offlineBtnText: { ...typography.label, color: colors.textSecondary, fontSize: 10, textAlign: 'center' },
        roomContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl, alignItems: 'center' },
        pinLabel: { ...typography.label, color: colors.neonGreen, letterSpacing: 4, fontSize: 10 },
        pinDisplay: {
          ...typography.mono,
          fontSize: 56,
          fontWeight: '800',
          letterSpacing: 12,
          color: colors.neonGreen,
          textShadowColor: colors.neonGreen + '88',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 16,
        },
        pinExpiry: {
          ...typography.label,
          color: colors.amber,
          fontSize: 11,
          letterSpacing: 1,
          textAlign: 'center',
        },
        roomStatusBadge: {
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.amber + '66',
          backgroundColor: colors.amber + '11',
        },
        roomStatusConnected: {
          borderColor: colors.neonGreen + '88',
          backgroundColor: colors.neonGreenMuted,
        },
        roomStatusText: { ...typography.mono, color: colors.neonGreen, fontSize: 13, letterSpacing: 2 },
        syncReadyBadge: {
          borderColor: colors.neonGreen,
          backgroundColor: colors.neonGreen + '22',
        },
        syncReadyText: {
          fontSize: 15,
          fontWeight: '800',
          letterSpacing: 3,
        },
        syncReadyHint: {
          color: colors.neonGreen,
          fontSize: 13,
          textAlign: 'center',
          lineHeight: 20,
        },
        errorHint: {
          color: colors.amber,
          fontSize: 12,
          textAlign: 'center',
          lineHeight: 18,
        },
        roomNameLine: {
          color: colors.textPrimary,
          fontSize: 15,
          fontWeight: '600',
          textAlign: 'center',
        },
        roomNameLineMuted: {
          color: colors.textMuted,
          fontSize: 13,
          textAlign: 'center',
        },
        driverPairLabel: {
          color: colors.textSecondary,
          textAlign: 'center',
          marginBottom: spacing.md,
          fontSize: 14,
        },
        roomLiveBadge: {
          padding: spacing.sm,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.neonGreen + '55',
          backgroundColor: colors.neonGreenMuted,
          marginBottom: spacing.sm,
        },
        roomLiveText: { ...typography.label, color: colors.neonGreen, fontSize: 9, letterSpacing: 1, textAlign: 'center' },
        fallbackBox: {
          padding: spacing.md,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.amber + '88',
          backgroundColor: colors.amber + '11',
          gap: spacing.sm,
        },
        fallbackTitle: { ...typography.title, color: colors.amber, fontSize: 15 },
        fallbackText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
        targetPanel: {
          padding: spacing.md,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.neonGreen + '55',
          backgroundColor: colors.neonGreenMuted,
          gap: spacing.sm,
          marginBottom: spacing.sm,
        },
        targetKicker: { ...typography.label, color: colors.neonGreen, fontSize: 9, letterSpacing: 3 },
        targetLabel: { color: colors.textSecondary, fontSize: 13 },
        targetClock: {
          ...typography.mono,
          color: colors.neonGreen,
          fontSize: 36,
          fontWeight: '800',
          letterSpacing: 2,
          textAlign: 'center',
        },
        targetActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
        targetBtn: {
          flex: 1,
          paddingVertical: spacing.sm,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          alignItems: 'center',
        },
        targetBtnPrimary: {
          borderColor: colors.neonGreen + '88',
          backgroundColor: colors.surfaceElevated,
        },
        targetBtnPressed: { opacity: 0.75 },
        targetBtnText: { ...typography.label, color: colors.textSecondary, fontSize: 10 },
        targetBtnTextPrimary: { color: colors.neonGreen },
        targetHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
        ghostBadge: {
          padding: spacing.sm,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.neonGreen + '66',
          backgroundColor: colors.neonGreenMuted,
          marginBottom: spacing.sm,
        },
        ghostBadgeText: {
          ...typography.label,
          color: colors.neonGreen,
          fontSize: 9,
          letterSpacing: 1,
          textAlign: 'center',
        },
        footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
        errorBox: { padding: spacing.sm, borderRadius: 8, backgroundColor: colors.recRed + '22' },
        errorText: { color: colors.recRed, fontSize: 13 },
      }),
    [colors, spacing, typography],
  );
}

function useScoreBarStyles() {
  const { colors, spacing, typography } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
        label: { ...typography.label, color: colors.textSecondary, width: 148, fontSize: 9 },
        trackWrap: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden' },
        trackFill: { height: '100%', borderRadius: 4 },
        value: { ...typography.mono, color: colors.textPrimary, width: 36, textAlign: 'right', fontSize: 13 },
        max: { ...typography.label, color: colors.textMuted, fontSize: 10, width: 28 },
      }),
    [colors, spacing, typography],
  );
}

function useStatStyles() {
  const { colors, spacing, typography } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        cell: {
          flexBasis: '47%',
          flexGrow: 1,
          padding: spacing.sm,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        label: { ...typography.label, color: colors.textMuted, fontSize: 10 },
        value: { ...typography.mono, color: colors.textPrimary, marginTop: 2, fontSize: 16 },
      }),
    [colors, spacing, typography],
  );
}

function useMapStyles() {
  const { colors, spacing, typography } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        wrap: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
        map: { width: '100%', height: MAP_HEIGHT },
        legend: { flexDirection: 'row', gap: spacing.md, padding: spacing.sm, backgroundColor: colors.surface },
        legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        legendDot: { width: 10, height: 10, borderRadius: 5 },
        legendText: { ...typography.label, color: colors.textSecondary, fontSize: 10 },
        empty: {
          height: MAP_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
          borderRadius: 12,
        },
        emptyText: { color: colors.textMuted, fontSize: 14 },
      }),
    [colors, spacing, typography],
  );
}
