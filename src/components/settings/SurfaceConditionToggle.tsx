import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import {
  SURFACE_CONDITION_DESCRIPTIONS,
  SURFACE_CONDITION_LABELS,
} from '@/lib/surfaceCondition';
import type { SurfaceCondition } from '@/types/settings';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  value: SurfaceCondition;
  onChange: (next: SurfaceCondition) => void;
  /** コンパクト表示（走行 HUD 用） */
  compact?: boolean;
  disabled?: boolean;
};

const OPTIONS: SurfaceCondition[] = ['dry', 'wet'];

export function SurfaceConditionToggle({
  value,
  onChange,
  compact = false,
  disabled = false,
}: Props) {
  const { colors, typography, spacing } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          gap: compact ? spacing.xs : spacing.sm,
        },
        btn: {
          flex: 1,
          paddingVertical: compact ? spacing.xs : spacing.sm,
          paddingHorizontal: compact ? spacing.sm : spacing.md,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 4,
          alignItems: 'center',
          gap: compact ? 2 : 4,
        },
        btnActiveDry: {
          borderColor: colors.neonGreenDim,
          backgroundColor: colors.neonGreen + '12',
        },
        btnActiveWet: {
          borderColor: colors.amber,
          backgroundColor: colors.amber + '14',
        },
        btnPressed: { opacity: 0.65 },
        label: {
          ...typography.label,
          fontSize: compact ? 9 : 10,
          color: colors.textMuted,
        },
        labelActiveDry: { color: colors.neonGreen },
        labelActiveWet: { color: colors.amber },
        desc: {
          ...typography.mono,
          fontSize: compact ? 7 : 8,
          color: colors.textMuted,
          textTransform: 'none',
          textAlign: 'center',
        },
        descActive: { color: colors.textSecondary },
      }),
    [colors, typography, spacing, compact],
  );

  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const active = value === opt;
        const isWet = opt === 'wet';
        return (
          <GamePressable
            key={opt}
            disabled={disabled}
            onPress={() => onChange(opt)}
            style={({ pressed }) => [
              styles.btn,
              active && (isWet ? styles.btnActiveWet : styles.btnActiveDry),
              pressed && styles.btnPressed,
            ]}
          >
            <Text
              style={[
                styles.label,
                active && (isWet ? styles.labelActiveWet : styles.labelActiveDry),
              ]}
            >
              {SURFACE_CONDITION_LABELS[opt]}
            </Text>
            {!compact ? (
              <Text style={[styles.desc, active && styles.descActive]}>
                {SURFACE_CONDITION_DESCRIPTIONS[opt]}
              </Text>
            ) : null}
          </GamePressable>
        );
      })}
    </View>
  );
}
