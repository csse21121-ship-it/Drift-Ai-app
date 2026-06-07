import { StyleSheet, Switch, Text, View } from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { TelemetryFrame } from '@/components/ui/TelemetryFrame';
import { UI_THEME_LIST } from '@/constants/uiThemes';
import type { UiThemePresetId } from '@/constants/uiThemes';
import { useTheme } from '@/contexts/ThemeContext';
import { typography } from '@/constants/theme';

type Props = {
  selectedId: UiThemePresetId;
  onSelect: (id: UiThemePresetId) => void;
};

/** 設定画面 — UI テーマ選択 */
export function AppearanceThemePanel({ selectedId, onSelect }: Props) {
  const { colors, spacing } = useTheme();

  return (
    <TelemetryFrame style={{ marginBottom: spacing.md }}>
      <View style={[styles.header, { paddingHorizontal: spacing.md, paddingTop: spacing.sm }]}>
        <Text style={[styles.title, { color: colors.neonGreen }]}>APPEARANCE</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>配色・フォントスタイル</Text>
      </View>

      <View style={[styles.list, { padding: spacing.md, gap: spacing.sm }]}>
        {UI_THEME_LIST.map((preset) => {
          const active = preset.id === selectedId;
          return (
            <GamePressable
              key={preset.id}
              onPress={() => onSelect(preset.id)}
              style={({ pressed }) => [
                styles.card,
                {
                  borderColor: active ? preset.colors.neonGreen : colors.border,
                  backgroundColor: active
                    ? preset.colors.surfaceElevated
                    : colors.surface,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.cardTop}>
                <View style={styles.swatches}>
                  {[
                    preset.colors.background,
                    preset.colors.neonGreen,
                    preset.colors.surface,
                    preset.colors.textPrimary,
                  ].map((c, i) => (
                    <View
                      key={i}
                      style={[styles.swatch, { backgroundColor: c, borderColor: colors.border }]}
                    />
                  ))}
                </View>
                {active ? (
                  <Text style={[styles.activeBadge, { color: preset.colors.neonGreen }]}>
                    ACTIVE
                  </Text>
                ) : null}
              </View>
              <Text
                style={[
                  styles.presetName,
                  {
                    color: preset.colors.neonGreen,
                    fontFamily: preset.typography.label.fontFamily,
                    letterSpacing: preset.typography.label.letterSpacing,
                  },
                ]}
              >
                {preset.name}
              </Text>
              <Text style={[styles.presetDesc, { color: colors.textSecondary }]}>
                {preset.description}
              </Text>
              <Text
                style={[
                  styles.sample,
                  {
                    color: preset.colors.textPrimary,
                    fontFamily: preset.typography.mono.fontFamily,
                    letterSpacing: preset.typography.mono.letterSpacing,
                  },
                ]}
              >
                SAMPLE 0123 — ドリフト計測
              </Text>
            </GamePressable>
          );
        })}
      </View>
    </TelemetryFrame>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
    paddingBottom: 4,
  },
  title: {
    ...typography.label,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  sub: {
    ...typography.label,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.2,
  },
  list: {},
  card: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    gap: 6,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  swatches: {
    flexDirection: 'row',
    gap: 4,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 2,
    borderWidth: 1,
  },
  activeBadge: {
    ...typography.label,
    fontSize: 7,
    letterSpacing: 1,
  },
  presetName: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  presetDesc: {
    ...typography.label,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.2,
  },
  sample: {
    fontSize: 10,
    marginTop: 2,
  },
});
