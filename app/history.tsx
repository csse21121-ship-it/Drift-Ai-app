import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { GamePressable } from '@/components/ui/GamePressable';
import { router } from 'expo-router';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { formatSessionDuration, resolveGrade } from '@/lib/scoring';
import {
  clearHistory,
  deleteHistoryEntry,
  loadHistory,
  saveSession,
} from '@/lib/sessionStore';
import {
  downloadCloudSessionLog,
  fetchCloudSessionLogs,
} from '@/lib/sessionLogCloud';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { CloudSessionLogListItem } from '@/types/sessionLog';
import type { SessionHistoryEntry } from '@/types/score';

type HistoryTab = 'local' | 'cloud';

// ── 日時フォーマット ────────────────────────────────────────

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${y}.${m}.${day}  ${h}:${min}`;
}

// ── メイン画面 ───────────────────────────────────────────────

export default function HistoryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const [tab, setTab] = useState<HistoryTab>('local');
  const [entries, setEntries] = useState<SessionHistoryEntry[]>([]);
  const [cloudEntries, setCloudEntries] = useState<CloudSessionLogListItem[]>([]);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const reloadLocal = useCallback(async () => {
    setLoading(true);
    const data = await loadHistory();
    setEntries(data);
    setLoading(false);
  }, []);

  const reloadCloud = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured()) {
      setCloudEntries([]);
      setCloudError('Supabase が未設定です（.env を確認）');
      setCloudLoading(false);
      setRefreshing(false);
      return;
    }

    if (!silent) setCloudLoading(true);
    setCloudError(null);

    const outcome = await fetchCloudSessionLogs();
    if (outcome.ok) {
      setCloudEntries(outcome.items);
    } else {
      setCloudEntries([]);
      setCloudError(outcome.reason);
    }

    setCloudLoading(false);
    setRefreshing(false);
  }, []);

  const reload = useCallback(async () => {
    if (tab === 'local') {
      await reloadLocal();
    } else {
      await reloadCloud();
    }
  }, [tab, reloadLocal, reloadCloud]);

  useEffect(() => {
    void reloadLocal();
  }, [reloadLocal]);

  useEffect(() => {
    if (tab === 'cloud') {
      void reloadCloud();
    }
  }, [tab, reloadCloud]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void reload();
  }, [reload]);

  const handleSelect = useCallback((entry: SessionHistoryEntry) => {
    saveSession(entry);
    router.push('/result');
  }, []);

  const handleCloudSelect = useCallback((item: CloudSessionLogListItem) => {
    void (async () => {
      setDownloadingId(item.id);
      const outcome = await downloadCloudSessionLog(item.fileUrl);
      setDownloadingId(null);

      if (!outcome.ok) {
        Alert.alert('読み込み失敗', outcome.reason);
        return;
      }

      saveSession(outcome.result);
      router.push('/result');
    })();
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert('削除', 'このセッションを削除しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            setDeleting(id);
            await deleteHistoryEntry(id);
            await reloadLocal();
            setDeleting(null);
          },
        },
      ]);
    },
    [reloadLocal],
  );

  const handleClearAll = useCallback(() => {
    if (entries.length === 0) return;
    Alert.alert('全履歴を削除', `${entries.length} 件のセッションをすべて削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '全削除',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          await clearHistory();
          setEntries([]);
          setLoading(false);
        },
      },
    ]);
  }, [entries.length]);

  const activeCount = tab === 'local' ? entries.length : cloudEntries.length;
  const isListLoading = tab === 'local' ? loading : cloudLoading;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <GamePressable uiSound="back" onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backLabel}>← BACK</Text>
        </GamePressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>SESSION HISTORY</Text>
          {!isListLoading && (
            <Text style={styles.headerCount}>{activeCount} RUNS</Text>
          )}
        </View>
        {tab === 'local' ? (
          <GamePressable
            onPress={handleClearAll}
            style={styles.clearAllBtn}
            disabled={entries.length === 0}
          >
            <Text style={[styles.clearAllLabel, entries.length === 0 && styles.clearAllDisabled]}>
              CLEAR
            </Text>
          </GamePressable>
        ) : (
          <View style={styles.clearAllBtn} />
        )}
      </View>

      <View style={styles.tabRow}>
        <GamePressable
          onPress={() => setTab('local')}
          style={[styles.tabBtn, tab === 'local' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabLabel, tab === 'local' && styles.tabLabelActive]}>LOCAL</Text>
        </GamePressable>
        <GamePressable
          onPress={() => setTab('cloud')}
          style={[styles.tabBtn, tab === 'cloud' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabLabel, tab === 'cloud' && styles.tabLabelActive]}>CLOUD</Text>
        </GamePressable>
      </View>

      {/* コンテンツ */}
      {tab === 'local' ? (
        loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.neonGreen} size="small" />
            <Text style={styles.loadingText}>LOADING</Text>
          </View>
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.neonGreen}
              />
            }
            renderItem={({ item }) => (
              <SessionRow
                entry={item}
                isDeleting={deleting === item.id}
                onSelect={handleSelect}
                onDelete={handleDelete}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )
      ) : cloudLoading && cloudEntries.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.neonGreen} size="small" />
          <Text style={styles.loadingText}>CLOUD SYNC</Text>
        </View>
      ) : cloudError && cloudEntries.length === 0 ? (
        <CloudErrorState message={cloudError} onRetry={() => void reloadCloud()} />
      ) : cloudEntries.length === 0 ? (
        <CloudEmptyState />
      ) : (
        <FlatList
          data={cloudEntries}
          keyExtractor={(item) => `cloud_${item.id}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.neonGreen}
            />
          }
          renderItem={({ item }) => (
            <CloudSessionRow
              item={item}
              isLoading={downloadingId === item.id}
              onSelect={handleCloudSelect}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
}

// ── サブコンポーネント ──────────────────────────────────────

function SessionRow({
  entry,
  isDeleting,
  onSelect,
  onDelete,
}: {
  entry: SessionHistoryEntry;
  isDeleting: boolean;
  onSelect: (e: SessionHistoryEntry) => void;
  onDelete: (id: string) => void;
}) {
  const styles = useStyles();
  const { colors, gradeColor: gradeColors } = useTheme();
  const gradeTint = gradeColors[entry.grade] ?? colors.textSecondary;
  const bestDrift = entry.events.length > 0
    ? Math.max(...entry.events.map((e) => e.durationMs))
    : 0;

  return (
    <GamePressable
      onPress={() => onSelect(entry)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      disabled={isDeleting}
    >
      <TelemetryFrame style={styles.rowFrame}>
        {/* グレード + 日時 */}
        <View style={styles.rowTop}>
          <View style={[styles.gradeBadge, { borderColor: gradeTint }]}>
            <Text style={[styles.gradeText, { color: gradeTint }]}>
              {entry.grade}
            </Text>
          </View>

          <View style={styles.rowTopCenter}>
            <Text style={styles.rowDate}>{formatDateTime(entry.savedAt)}</Text>
            {entry.courseName ? (
              <Text style={styles.rowCourse} numberOfLines={1}>
                ◉ {entry.courseName}
              </Text>
            ) : null}
            <Text style={styles.rowScore}>
              {entry.totalPoints.toLocaleString()}
              <Text style={styles.rowScoreUnit}> pt</Text>
            </Text>
          </View>

          {isDeleting ? (
            <ActivityIndicator color={colors.textMuted} size="small" style={styles.deleteBtn} />
          ) : (
            <GamePressable
              onPress={() => onDelete(entry.id)}
              style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
              hitSlop={8}
            >
              <Text style={styles.deleteIcon}>✕</Text>
            </GamePressable>
          )}
        </View>

        {/* セッション統計 */}
        <View style={styles.statsRow}>
          <StatChip label="DRIFTS" value={`${entry.driftScores.length}`} />
          <StatChip
            label="BEST"
            value={bestDrift > 0 ? `${(bestDrift / 1000).toFixed(1)}s` : '—'}
          />
          <StatChip
            label="MAX G"
            value={`${entry.maxLateralG.toFixed(2)}G`}
            highlight
          />
          <StatChip
            label="SPEED"
            value={`${Math.round(entry.maxSpeedKmh)}`}
            unit="km/h"
          />
          <StatChip
            label="TIME"
            value={formatSessionDuration(entry.sessionDurationMs)}
          />
        </View>
      </TelemetryFrame>
    </GamePressable>
  );
}

function StatChip({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={[styles.chipValue, highlight && styles.chipValueHighlight]}>
        {value}
        {unit ? <Text style={styles.chipUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function CloudSessionRow({
  item,
  isLoading,
  onSelect,
}: {
  item: CloudSessionLogListItem;
  isLoading: boolean;
  onSelect: (item: CloudSessionLogListItem) => void;
}) {
  const styles = useStyles();
  const { colors, gradeColor: gradeColors } = useTheme();
  const grade = resolveGrade(item.score);
  const gradeTint = gradeColors[grade] ?? colors.textSecondary;

  return (
    <GamePressable
      onPress={() => onSelect(item)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      disabled={isLoading}
    >
      <TelemetryFrame style={styles.rowFrame}>
        <View style={styles.rowTop}>
          <View style={[styles.gradeBadge, { borderColor: gradeTint }]}>
            <Text style={[styles.gradeText, { color: gradeTint }]}>{grade}</Text>
          </View>

          <View style={styles.rowTopCenter}>
            <Text style={styles.rowDate}>{formatDateTime(new Date(item.createdAt).getTime())}</Text>
            {item.trackName ? (
              <Text style={styles.rowCourse} numberOfLines={1}>
                ◉ {item.trackName}
              </Text>
            ) : null}
            <Text style={styles.rowScore}>
              {Math.round(item.score).toLocaleString()}
              <Text style={styles.rowScoreUnit}> pt</Text>
            </Text>
          </View>

          {isLoading ? (
            <ActivityIndicator color={colors.textMuted} size="small" style={styles.deleteBtn} />
          ) : (
            <View style={styles.cloudBadge}>
              <Text style={styles.cloudBadgeText}>☁</Text>
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          {item.carModel ? <StatChip label="VEHICLE" value={item.carModel} /> : null}
          <StatChip label="SOURCE" value="Supabase" highlight />
          <StatChip label="ACTION" value="タップで再生" />
        </View>
      </TelemetryFrame>
    </GamePressable>
  );
}

function CloudEmptyState() {
  const styles = useStyles();
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>NO CLOUD RUNS</Text>
      <Text style={styles.emptyBody}>
        STOP 後にクラウド保存された走行がここに表示されます。{'\n'}
        設定 → クラウド保存が有効か確認してください。
      </Text>
      <GamePressable uiSound="back" onPress={() => router.replace('/home')} style={styles.startBtn}>
        <Text style={styles.startBtnLabel}>Pit Lane へ</Text>
      </GamePressable>
    </View>
  );
}

function CloudErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>CLOUD ERROR</Text>
      <Text style={styles.emptyBody}>{message}</Text>
      <GamePressable onPress={onRetry} style={styles.startBtn}>
        <Text style={styles.startBtnLabel}>再試行</Text>
      </GamePressable>
    </View>
  );
}

function EmptyState() {
  const styles = useStyles();
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>NO HISTORY</Text>
      <Text style={styles.emptyBody}>
        セッションを完了するとここに記録されます。
      </Text>
      <GamePressable uiSound="back" onPress={() => router.replace('/home')} style={styles.startBtn}>
        <Text style={styles.startBtnLabel}>Pit Lane へ</Text>
      </GamePressable>
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
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
    minWidth: 60,
  },
  backLabel: {
    ...typography.label,
    color: colors.neonGreenDim,
    fontSize: 9,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.title,
    color: colors.textPrimary,
    fontSize: 13,
  },
  headerCount: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 8,
    marginTop: 2,
  },
  clearAllBtn: {
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
    minWidth: 60,
    alignItems: 'flex-end',
  },
  clearAllLabel: {
    ...typography.label,
    color: '#FF4444',
    fontSize: 9,
  },
  clearAllDisabled: {
    color: colors.textMuted,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  tabBtnActive: {
    backgroundColor: colors.neonGreen + '18',
  },
  tabLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
  },
  tabLabelActive: {
    color: colors.neonGreen,
  },
  cloudBadge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cloudBadgeText: {
    fontSize: 14,
    color: colors.neonGreenDim,
  },

  // ── リスト ──
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.sm,
  },

  // ── 行 ──
  row: {
    borderRadius: 4,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowFrame: {
    overflow: 'hidden',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  gradeBadge: {
    width: 36,
    height: 36,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  gradeText: {
    fontFamily: 'monospace',
    fontSize: 20,
    fontWeight: '700',
  },
  rowTopCenter: {
    flex: 1,
  },
  rowCourse: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  rowDate: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 10,
    marginBottom: 2,
  },
  rowScore: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rowScoreUnit: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deleteBtnPressed: {
    opacity: 0.5,
  },
  deleteIcon: {
    ...typography.mono,
    color: colors.textMuted,
    fontSize: 12,
  },

  // ── 統計チップ ──
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  chip: {
    alignItems: 'center',
    minWidth: 44,
  },
  chipLabel: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 7,
    marginBottom: 2,
  },
  chipValue: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 12,
  },
  chipValueHighlight: {
    color: colors.neonGreen,
  },
  chipUnit: {
    fontSize: 9,
    color: colors.textMuted,
  },

  // ── 空状態・ローディング ──
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    marginTop: spacing.xs,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.textMuted,
    fontSize: 14,
  },
  emptyBody: {
    ...typography.label,
    color: colors.textMuted,
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 16,
    textTransform: 'none',
    letterSpacing: 0.3,
  },
  startBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.neonGreen,
    borderRadius: 4,
  },
  startBtnLabel: {
    ...typography.label,
    color: colors.neonGreen,
    fontSize: 11,
    letterSpacing: 2,
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
