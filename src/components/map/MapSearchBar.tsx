/**
 * MapSearchBar — マップ上の地名検索コンポーネント
 *
 * マップ内に position:absolute で配置するオーバーレイ。
 * - 折りたたみ状態: 🔍 アイコンボタン
 * - 展開状態: テキスト入力 + 候補ドロップダウン
 * - 候補選択時: onResult(lat, lon) コールバックでマップを移動
 *
 * 使い方:
 *   <MapSearchBar onResult={(lat, lon) => mapRef.current?.animateToRegion(...)} />
 *
 * 配置先の View は position:relative で overflow:visible にしてください。
 */

import { useRef, useState, useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  ActivityIndicator,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { geocodeSearch } from '@/lib/geocodeService';
import type { GeocodeResult } from '@/lib/geocodeService';

// ────────────────────────────────────────────────────────────────

type Props = {
  /** 候補タップ時にコールバック（マップ移動に使用） */
  onResult: (latitude: number, longitude: number, displayName: string) => void;
  /** 右端からのオフセット（デフォルト: 12） */
  right?: number;
  /** 上端からのオフセット（デフォルト: 12） */
  top?: number;
};

export function MapSearchBar({ onResult, right = 12, top = 12 }: Props) {
  const sb = useSb();
  const { colors } = useTheme();
  const [expanded,  setExpanded]  = useState(false);
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState<GeocodeResult[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef    = useRef<TextInput>(null);

  // ── テキスト変更 → デバウンス検索 ──
  const handleChange = (text: string) => {
    setQuery(text);
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await geocodeSearch(text);
        setResults(r);
        if (r.length === 0) setError('見つかりませんでした');
      } catch (e) {
        setError(e instanceof Error ? e.message : '検索エラー');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 650);  // Nominatim: 1 req/sec → 650ms デバウンス
  };

  // ── 候補選択 ──
  const handleSelect = (r: GeocodeResult) => {
    onResult(r.latitude, r.longitude, r.displayName);
    collapse();
  };

  // ── 折りたたむ ──
  const collapse = () => {
    setExpanded(false);
    setQuery('');
    setResults([]);
    setError(null);
    Keyboard.dismiss();
  };

  // ── 展開ボタン ──
  if (!expanded) {
    return (
      <GamePressable
        onPress={() => {
          setExpanded(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        style={[sb.iconBtn, { right, top }]}
        hitSlop={8}
      >
        <Text style={sb.iconBtnText}>🔍</Text>
      </GamePressable>
    );
  }

  // ── 展開状態 ──
  return (
    <View style={[sb.container, { right, top }]} pointerEvents="box-none">
      {/* 入力バー */}
      <View style={sb.bar}>
        <Text style={sb.searchIcon}>🔍</Text>
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={handleChange}
          placeholder="場所・住所を検索…"
          placeholderTextColor={colors.textMuted}
          style={sb.input}
          returnKeyType="search"
          clearButtonMode="while-editing"
          onSubmitEditing={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (query.length >= 2) {
              setLoading(true);
              geocodeSearch(query).then((r) => {
                setResults(r);
                if (r.length === 0) setError('見つかりませんでした');
              }).catch((e) => setError(e.message)).finally(() => setLoading(false));
            }
          }}
        />
        {loading && <ActivityIndicator size="small" color={colors.neonGreen} style={{ marginRight: 4 }} />}
        <GamePressable onPress={collapse} hitSlop={8} style={sb.closeBtn}>
          <Text style={sb.closeBtnText}>✕</Text>
        </GamePressable>
      </View>

      {/* ドロップダウン */}
      {(results.length > 0 || error) && (
        <View style={sb.dropdown}>
          {error && results.length === 0 && (
            <View style={sb.resultItem}>
              <Text style={sb.resultEmpty}>{error}</Text>
            </View>
          )}
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
            {results.map((r, i) => (
              <GamePressable
                key={r.placeId}
                onPress={() => handleSelect(r)}
                style={({ pressed }) => [
                  sb.resultItem,
                  i < results.length - 1 && sb.resultItemBorder,
                  pressed && { backgroundColor: colors.neonGreen + '15' },
                ]}
              >
                <Text style={sb.resultShort} numberOfLines={1}>{r.shortName}</Text>
                <Text style={sb.resultFull}  numberOfLines={1}>{r.displayName}</Text>
              </GamePressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────
// スタイル
// ────────────────────────────────────────────────────────────────

function createSb(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  // ── 折りたたみアイコン ──
  iconBtn: {
    position:        'absolute',
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: colors.background + 'EE',
    borderWidth:     1,
    borderColor:     colors.neonGreen + '66',
    alignItems:      'center',
    justifyContent:  'center',
    elevation:       6,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.5,
    shadowRadius:    4,
  },
  iconBtnText: { fontSize: 18 },

  // ── 展開コンテナ ──
  container: {
    position: 'absolute',
    left:     12,         // 左右伸張
    zIndex:   100,
  },

  // ── 入力バー ──
  bar: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.background + 'F2',
    borderWidth:     1,
    borderColor:     colors.neonGreen + '88',
    borderRadius:    8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap:             6,
    elevation:       8,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.6,
    shadowRadius:    6,
  },
  searchIcon: { fontSize: 16 },
  input: {
    flex:            1,
    ...typography.mono,
    color:           colors.textPrimary,
    fontSize:        12,
    paddingVertical: 0,
  },
  closeBtn:     { padding: 4 },
  closeBtnText: { ...typography.label, color: colors.textMuted, fontSize: 10 },

  // ── ドロップダウン ──
  dropdown: {
    marginTop:       4,
    backgroundColor: colors.surface + 'F5',
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    6,
    overflow:        'hidden',
    elevation:       8,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.5,
    shadowRadius:    4,
  },
  resultItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   10,
  },
  resultItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultShort: {
    ...typography.label,
    color:     colors.textPrimary,
    fontSize:  11,
    letterSpacing: 0.5,
  },
  resultFull: {
    ...typography.mono,
    color:     colors.textMuted,
    fontSize:  9,
    marginTop: 2,
  },
  resultEmpty: {
    ...typography.mono,
    color:    colors.textMuted,
    fontSize: 10,
  },
});
}

function useSb() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createSb(colors, typography, spacing),
    [colors, typography, spacing],
  );
}
