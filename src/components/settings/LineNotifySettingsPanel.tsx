import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GamePressable } from '@/components/ui/GamePressable';
import { useTheme } from '@/contexts/ThemeContext';
import {
  fetchLinkedLineTargetId,
  getLineAddFriendOpenUrls,
  getLineOaBasicIdLabel,
  isLineAddFriendConfigured,
  issueLineLinkCode,
  lookupNotifyTeam,
  normalizeTeamPin,
} from '@/lib/lineNotifyApi';
import {
  disableLineNotify,
  loadLineNotifySettings,
  savePersonalNotifySettings,
  saveTeamNotifySettings,
  type LineNotifyMode,
  type LineNotifySettings,
} from '@/lib/lineNotifyStore';

const MODE_OPTIONS: { id: LineNotifyMode; label: string; desc: string }[] = [
  { id: 'off', label: 'オフ', desc: 'LINE 通知なし' },
  { id: 'team', label: 'チーム', desc: '6桁 PIN を入力（仲間のグループ）' },
  { id: 'personal', label: '自分', desc: '公式アカウントと連携' },
];

export function LineNotifySettingsPanel() {
  const { colors, typography } = useTheme();
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<LineNotifyMode>('off');
  const [saved, setSaved] = useState<LineNotifySettings | null>(null);
  const [teamPinDraft, setTeamPinDraft] = useState('');
  const [teamPreview, setTeamPreview] = useState<{ name: string; pin: string; targetId: string } | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkWaiting, setLinkWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setLinkWaiting(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const settings = await loadLineNotifySettings();
      if (cancelled) return;
      setSaved(settings);
      setMode(settings.mode);
      setTeamPinDraft(settings.teamPin ?? '');
      if (settings.mode === 'team' && settings.teamName && settings.teamPin && settings.targetId) {
        setTeamPreview({
          name: settings.teamName,
          pin: settings.teamPin,
          targetId: settings.targetId,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [stopPolling]);

  const handleModeSelect = useCallback(
    async (next: LineNotifyMode) => {
      setError(null);
      stopPolling();
      setLinkCode(null);
      setTeamPreview(null);

      if (next === 'off') {
        const settings = await disableLineNotify();
        setMode('off');
        setSaved(settings);
        return;
      }

      setMode(next);

      if (next === 'personal') {
        const linked = await fetchLinkedLineTargetId();
        if (linked) {
          const settings = await savePersonalNotifySettings(linked);
          setSaved(settings);
        }
      }
    },
    [stopPolling],
  );

  const handleTeamLookup = useCallback(async () => {
    setTeamBusy(true);
    setError(null);
    setTeamPreview(null);
    const result = await lookupNotifyTeam(teamPinDraft);
    setTeamBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setTeamPreview({
      name: result.team.teamName,
      pin: result.team.pin,
      targetId: result.team.lineTargetId,
    });
  }, [teamPinDraft]);

  const handleTeamSave = useCallback(async () => {
    if (!teamPreview) return;
    setTeamBusy(true);
    setError(null);
    try {
      const settings = await saveTeamNotifySettings({
        teamPin: teamPreview.pin,
        teamName: teamPreview.name,
        lineTargetId: teamPreview.targetId,
      });
      setSaved(settings);
      setMode('team');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    }
    setTeamBusy(false);
  }, [teamPreview]);

  const startLinkPolling = useCallback(() => {
    stopPolling();
    setLinkWaiting(true);
    pollRef.current = setInterval(() => {
      void (async () => {
        const linked = await fetchLinkedLineTargetId();
        if (!linked) return;
        stopPolling();
        const settings = await savePersonalNotifySettings(linked);
        setSaved(settings);
        setMode('personal');
        setLinkCode(null);
      })();
    }, 2500);
  }, [stopPolling]);

  const handleIssueLinkCode = useCallback(async () => {
    setLinkBusy(true);
    setError(null);
    const result = await issueLineLinkCode();
    setLinkBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setLinkCode(result.link.code);
    setLinkExpiresAt(result.link.expiresAtMs);
    startLinkPolling();
  }, [startLinkPolling]);

  const handleOpenLineFriend = useCallback(async () => {
    setError(null);
    const urls = getLineAddFriendOpenUrls();
    if (!urls) {
      setError(
        '友だち追加 URL が未設定です。.env に EXPO_PUBLIC_LINE_OA_BASIC_ID を設定し、Metro を再起動してください',
      );
      return;
    }

    try {
      const canLine = await Linking.canOpenURL(urls.lineScheme);
      await Linking.openURL(canLine ? urls.lineScheme : urls.https);
    } catch {
      setError('LINE を開けませんでした');
    }
  }, []);

  const lineOaLabel = getLineOaBasicIdLabel();
  const lineFriendReady = isLineAddFriendConfigured();

  const statusText =
    saved?.mode === 'team' && saved.teamName
      ? `✓ チーム「${saved.teamName}」に通知中`
      : saved?.mode === 'personal'
        ? '✓ 自分の LINE に通知中'
        : null;

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.amber} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.intro, { color: colors.textSecondary }]}>
        走行終了時に LINE へ速報を送ります。知らない人には届きません。
      </Text>

      <View style={styles.modeRow}>
        {MODE_OPTIONS.map((opt) => {
          const active = mode === opt.id;
          return (
            <GamePressable
              key={opt.id}
              onPress={() => void handleModeSelect(opt.id)}
              style={({ pressed }) => [
                styles.modeChip,
                {
                  borderColor: active ? colors.neonGreen + 'aa' : colors.border,
                  backgroundColor: active ? colors.neonGreenMuted : colors.surface,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text
                style={[
                  typography.label,
                  { color: active ? colors.neonGreen : colors.textPrimary, fontSize: 13 },
                ]}
              >
                {opt.label}
              </Text>
            </GamePressable>
          );
        })}
      </View>

      {mode === 'team' ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            チーム PIN（6桁）
          </Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            ① グループに公式アカウントを招待{'\n'}
            ② グループで何か1通送る（例: 「PIN」や「こんにちは」）{'\n'}
            → 返信で 6桁 PIN が届きます{'\n'}
            ③ その PIN を下に入力 → 有効化{'\n'}
            ※ 旧4桁 PIN も引き続き利用できます
          </Text>
          <TextInput
            value={teamPinDraft}
            onChangeText={setTeamPinDraft}
            placeholder="例: 482193"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            maxLength={6}
            style={[
              styles.input,
              styles.pinInput,
              { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          />
          <GamePressable
            onPress={() => void handleTeamLookup()}
            disabled={teamBusy || !normalizeTeamPin(teamPinDraft)}
            style={({ pressed }) => [styles.actionBtn, btnStyle(colors, teamBusy || !normalizeTeamPin(teamPinDraft), pressed)]}
          >
            {teamBusy ? (
              <ActivityIndicator size="small" color={colors.amber} />
            ) : (
              <Text style={[typography.label, { color: colors.amber }]}>PIN を確認</Text>
            )}
          </GamePressable>
          {teamPreview ? (
            <View style={[styles.previewBox, { borderColor: colors.neonGreen + '66', backgroundColor: colors.neonGreenMuted }]}>
              <Text style={[styles.previewTitle, { color: colors.neonGreen }]}>
                {teamPreview.name}
              </Text>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>
                このチームの LINE グループに走行速報が届きます
              </Text>
              <GamePressable
                onPress={() => void handleTeamSave()}
                disabled={teamBusy}
                style={({ pressed }) => [styles.actionBtn, btnStyle(colors, teamBusy, pressed, true)]}
              >
                <Text style={[typography.label, { color: colors.neonGreen }]}>このチームで通知を有効化</Text>
              </GamePressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {mode === 'personal' ? (
        <View style={styles.section}>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            自分の LINE に走行速報を届けます。公式アカウントと 1:1 連携してください。
          </Text>
          <Text style={[styles.step, { color: colors.textSecondary }]}>① 公式アカウントを友だち追加</Text>
          {lineFriendReady && lineOaLabel ? (
            <Text style={[styles.hint, { color: colors.amber }]}>アカウント: {lineOaLabel}</Text>
          ) : (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Basic ID は LINE Official Account Manager → アカウント情報 →「ベーシックID」（@＋英数字）。
              {'\n'}
              Developers の Channel ID とは別です。取得後 .env の EXPO_PUBLIC_LINE_OA_BASIC_ID に設定。
            </Text>
          )}
          <GamePressable
            onPress={() => void handleOpenLineFriend()}
            disabled={!lineFriendReady}
            style={({ pressed }) => [styles.actionBtn, btnStyle(colors, !lineFriendReady, pressed)]}
          >
            <Text style={[typography.label, { color: lineFriendReady ? colors.amber : colors.textSecondary }]}>
              LINE で友だち追加
            </Text>
          </GamePressable>

          <Text style={[styles.step, { color: colors.textSecondary }]}>② 連携コードを発行</Text>
          <GamePressable
            onPress={() => void handleIssueLinkCode()}
            disabled={linkBusy}
            style={({ pressed }) => [styles.actionBtn, btnStyle(colors, linkBusy, pressed)]}
          >
            {linkBusy ? (
              <ActivityIndicator size="small" color={colors.amber} />
            ) : (
              <Text style={[typography.label, { color: colors.amber }]}>連携コードを発行</Text>
            )}
          </GamePressable>

          {linkCode ? (
            <View style={[styles.codeBox, { borderColor: colors.amber + '88', backgroundColor: colors.surface }]}>
              <Text style={[styles.codeLabel, { color: colors.textSecondary }]}>③ この数字を LINE トークに送信</Text>
              <Text style={[styles.codeValue, { color: colors.amber }]}>{linkCode}</Text>
              {linkExpiresAt ? (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  有効期限: {new Date(linkExpiresAt).toLocaleTimeString('ja-JP')} まで
                </Text>
              ) : null}
              {linkWaiting ? (
                <View style={styles.waitRow}>
                  <ActivityIndicator size="small" color={colors.neonGreen} />
                  <Text style={[styles.hint, { color: colors.neonGreen }]}>連携を待っています…</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {statusText ? (
        <Text style={[styles.statusOk, { color: colors.neonGreen }]}>{statusText}</Text>
      ) : null}

      {error ? <Text style={[styles.error, { color: '#ff8899' }]}>{error}</Text> : null}
    </View>
  );
}

function btnStyle(
  colors: { surface: string; border: string; neonGreenMuted: string; neonGreen: string },
  disabled: boolean,
  pressed: boolean,
  primary = false,
) {
  return {
    backgroundColor: disabled ? colors.surface : primary ? colors.neonGreenMuted : colors.surface,
    borderColor: disabled ? colors.border : primary ? colors.neonGreen + '88' : colors.border,
    opacity: pressed && !disabled ? 0.75 : 1,
  };
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  loadingWrap: { paddingVertical: 24, alignItems: 'center' },
  intro: { fontSize: 12, lineHeight: 18 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '600' },
  step: { fontSize: 12, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  pinInput: {
    letterSpacing: 4,
    textAlign: 'center',
    fontWeight: '700',
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
  },
  previewBox: {
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  previewTitle: { fontSize: 16, fontWeight: '800' },
  codeBox: {
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  codeLabel: { fontSize: 12 },
  codeValue: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 8,
    fontVariant: ['tabular-nums'],
  },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hint: { fontSize: 12, lineHeight: 18 },
  statusOk: { fontSize: 13, fontWeight: '600' },
  error: { fontSize: 12, lineHeight: 18 },
});
