import { StyleSheet, View, ViewStyle } from 'react-native';
import { GAME_UI } from '@/constants/gameUi';
import type { ThemeColors } from '@/constants/uiThemes';

type Props = {
  colors: ThemeColors;
  style?: ViewStyle;
  /** コーナー L 字の色（省略時はアクセント） */
  accent?: string;
};

/** HUD 四隅ブラケット — レーシングゲーム風 */
export function GameHudCorners({ colors, style, accent }: Props) {
  const c = accent ?? colors.neonGreen;
  const len = GAME_UI.cornerLen;
  const t = GAME_UI.cornerThick;

  const corner = (pos: ViewStyle): ViewStyle => ({
    position: 'absolute',
    width: len,
    height: len,
    ...pos,
  });

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <View style={[corner({ top: 0, left: 0 }), { borderTopWidth: t, borderLeftWidth: t, borderColor: c }]} />
      <View style={[corner({ top: 0, right: 0 }), { borderTopWidth: t, borderRightWidth: t, borderColor: c }]} />
      <View style={[corner({ bottom: 0, left: 0 }), { borderBottomWidth: t, borderLeftWidth: t, borderColor: c }]} />
      <View style={[corner({ bottom: 0, right: 0 }), { borderBottomWidth: t, borderRightWidth: t, borderColor: c }]} />
    </View>
  );
}
