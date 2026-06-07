import { StyleSheet, Text, View } from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { BGM_TRACK_LIST, type BgmTrackId } from '@/constants/bgmTracks';
import { useTheme } from '@/contexts/ThemeContext';
import { typography } from '@/constants/theme';

type Props = {
  selectedId: BgmTrackId;
  disabled?: boolean;
  onSelect: (id: BgmTrackId) => void;
};

/** 設定画面 — BGM トラック選択 */
export function BgmTrackPanel({ selectedId, disabled = false, onSelect }: Props) {
  const { colors, spacing } = useTheme();

  return (
    <View style={[styles.list, { padding: spacing.md, gap: spacing.sm, opacity: disabled ? 0.45 : 1 }]}>
      {BGM_TRACK_LIST.map((track) => {
        const active = track.id === selectedId;
        return (
          <GamePressable
            key={track.id}
            disabled={disabled}
            onPress={() => onSelect(track.id)}
            style={({ pressed }) => [
              styles.row,
              {
                borderColor: active ? colors.neonGreen : colors.border,
                backgroundColor: active ? colors.neonGreenMuted + '18' : 'transparent',
              },
              pressed && !disabled && styles.pressed,
            ]}
          >
            <View style={styles.rowMain}>
              <Text style={[styles.title, { color: active ? colors.neonGreen : colors.textPrimary }]}>
                {track.title}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>{track.subtitle}</Text>
            </View>
            {active ? (
              <Text style={[styles.badge, { color: colors.neonGreen }]}>▶</Text>
            ) : null}
          </GamePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  pressed: {
    opacity: 0.75,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'none',
  },
  subtitle: {
    ...typography.label,
    fontSize: 8,
    textTransform: 'none',
    letterSpacing: 0.2,
  },
  badge: {
    fontSize: 10,
    fontWeight: '700',
  },
});
