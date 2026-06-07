import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { GAME_UI } from '@/constants/gameUi';
import type { UiSoundKind } from '@/constants/uiSounds';
import { GameHudCorners } from '@/components/ui/GameHudCorners';
import { useTheme } from '@/contexts/ThemeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { playUiSound } from '@/lib/uiSound';

type NeonButtonVariant = 'primary' | 'danger' | 'secondary';

type NeonButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: NeonButtonVariant;
  large?: boolean;
  style?: ViewStyle;
};

export function NeonButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  large = false,
  style,
}: NeonButtonProps) {
  const { colors, typography } = useTheme();
  const { settings } = useSettings();

  const uiSoundKind: UiSoundKind = 'nav';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        button: {
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderRadius: GAME_UI.frameRadius,
          paddingVertical: 16,
          paddingHorizontal: 32,
          alignItems: 'center',
          overflow: 'hidden',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 12,
          elevation: 8,
        },
        buttonLarge: {
          paddingVertical: 22,
          width: '100%',
        },
        buttonDisabled: {
          borderColor: colors.textMuted,
          shadowOpacity: 0,
        },
        shine: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          opacity: 0.55,
        },
        label: {
          ...typography.label,
          fontSize: 14,
          letterSpacing: 4,
          fontWeight: '800',
        },
        labelLarge: {
          fontSize: 16,
          letterSpacing: 5,
        },
        labelDisabled: {
          color: colors.textMuted,
        },
        chevron: {
          marginTop: 2,
          fontSize: 8,
          letterSpacing: 3,
          opacity: 0.7,
        },
      }),
    [colors, typography],
  );

  const palette = useMemo(() => {
    const map: Record<
      NeonButtonVariant,
      { border: string; shadow: string; pressedBg: string; label: string; shine: string }
    > = {
      primary: {
        border: colors.neonGreen,
        shadow: colors.neonGreen,
        pressedBg: colors.neonGreenMuted,
        label: colors.neonGreen,
        shine: colors.neonGreen,
      },
      danger: {
        border: colors.recRed,
        shadow: colors.recRed,
        pressedBg: colors.recRedMuted,
        label: colors.recRed,
        shine: colors.recRed,
      },
      secondary: {
        border: colors.border,
        shadow: colors.textMuted,
        pressedBg: colors.surface,
        label: colors.textSecondary,
        shine: colors.textMuted,
      },
    };
    return map[variant];
  }, [colors, variant]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        if (!disabled) {
          playUiSound(uiSoundKind, settings.feedback);
        }
      }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        large && styles.buttonLarge,
        {
          borderColor: palette.border,
          shadowColor: palette.shadow,
        },
        pressed && { backgroundColor: palette.pressedBg, shadowOpacity: 0.75, transform: [{ scale: 0.98 }] },
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <View style={[styles.shine, { backgroundColor: palette.shine }]} />
      <GameHudCorners colors={colors} accent={palette.border} />
      <Text
        style={[
          styles.label,
          large && styles.labelLarge,
          { color: palette.label },
          disabled && styles.labelDisabled,
        ]}
      >
        {label}
      </Text>
      {!disabled && variant === 'primary' ? (
        <Text style={[styles.chevron, { color: palette.label }]}>▶▶</Text>
      ) : null}
    </Pressable>
  );
}
