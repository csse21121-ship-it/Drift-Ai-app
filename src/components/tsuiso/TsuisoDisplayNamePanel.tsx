import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  generateAnonymousDisplayName,
  getDisplayNameLimits,
  loadTsuisoProfile,
  normalizeDisplayName,
  saveTsuisoDisplayName,
} from '@/lib/tsuisoProfileStore';

type Props = {
  onNameChange?: (name: string) => void;
};

export function TsuisoDisplayNamePanel({ onNameChange }: Props) {
  const { min, max } = getDisplayNameLimits();
  const [draft, setDraft] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const profile = await loadTsuisoProfile();
      if (cancelled) return;
      setSavedName(profile.displayName);
      setDraft(profile.displayName);
      onNameChange?.(profile.displayName);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [onNameChange]);

  const persist = useCallback(
    async (name: string) => {
      setSaving(true);
      setError(null);
      const result = await saveTsuisoDisplayName(name);
      setSaving(false);
      if (!result.ok) {
        setError(result.reason);
        return false;
      }
      setSavedName(result.profile.displayName);
      setDraft(result.profile.displayName);
      onNameChange?.(result.profile.displayName);
      return true;
    },
    [onNameChange],
  );

  const handleSave = useCallback(async () => {
    if (draft.trim() === savedName) return;
    await persist(draft);
  }, [draft, savedName, persist]);

  const handleRandom = useCallback(async () => {
    const next = generateAnonymousDisplayName();
    setDraft(next);
    await persist(next);
  }, [persist]);

  const draftValid = normalizeDisplayName(draft) != null;
  const dirty = savedName != null && draft.trim() !== savedName;

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#94a3b8" />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>あなたの表示名（匿名）</Text>
      <Text style={styles.hint}>
        ログイン不要 · 端末内のみ保存 · 追走相手に表示されます
      </Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="表示名"
          placeholderTextColor="#64748b"
          maxLength={max}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void handleSave()}
        />
        <Pressable
          style={[styles.saveBtn, (!dirty || !draftValid || saving) && styles.btnDisabled]}
          onPress={() => void handleSave()}
          disabled={!dirty || !draftValid || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#0f172a" />
          ) : (
            <Text style={styles.saveBtnText}>保存</Text>
          )}
        </Pressable>
      </View>
      <View style={styles.footer}>
        <Pressable style={styles.linkBtn} onPress={() => void handleRandom()} disabled={saving}>
          <Text style={styles.linkText}>ランダム名を生成</Text>
        </Pressable>
        <Text style={styles.counter}>
          {draft.trim().length}/{max}（{min}文字以上）
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  label: {
    color: '#f1f5f9',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  hint: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#475569',
  },
  saveBtn: {
    backgroundColor: '#38bdf8',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 56,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  linkBtn: {
    paddingVertical: 4,
  },
  linkText: {
    color: '#7dd3fc',
    fontSize: 13,
  },
  counter: {
    color: '#64748b',
    fontSize: 11,
  },
  error: {
    color: '#f87171',
    fontSize: 12,
    marginTop: 8,
  },
});
