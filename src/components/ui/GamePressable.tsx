import { Pressable, type PressableProps } from 'react-native';
import { useSettings } from '@/contexts/SettingsContext';
import type { UiSoundKind } from '@/constants/uiSounds';
import { playUiSound } from '@/lib/uiSound';

export type GamePressableProps = PressableProps & {
  /** false で SE 無効。省略時は nav */
  uiSound?: UiSoundKind | false;
};

/** タップ時に HUD 風 SE を鳴らす Pressable（Pressable の drop-in 代替） */
export function GamePressable({
  uiSound = 'nav',
  onPressIn,
  onPress,
  disabled,
  ...rest
}: GamePressableProps) {
  const { settings } = useSettings();

  const fireSound = () => {
    if (!disabled && uiSound !== false) {
      playUiSound(uiSound, settings.feedback);
    }
  };

  const handlePressIn: PressableProps['onPressIn'] = (event) => {
    fireSound();
    onPressIn?.(event);
  };

  const handlePress: PressableProps['onPress'] = (event) => {
    onPress?.(event);
  };

  return (
    <Pressable
      disabled={disabled}
      onPressIn={handlePressIn}
      onPress={handlePress}
      {...rest}
    />
  );
}
