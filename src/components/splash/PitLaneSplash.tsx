import { useCallback, useEffect, useRef, useMemo, useState } from 'react';

import { useTheme } from '@/contexts/ThemeContext';

import {

  Animated,

  Image,

  StyleSheet,

  Text,

  View,

} from 'react-native';

import { GamePressable } from '@/components/ui/GamePressable';

import { VideoView } from 'expo-video';

import { SPLASH_MEDIA } from '@/constants/splashAssets';

import { useSplashMedia } from '@/hooks/useSplashMedia';

import { useSettings } from '@/contexts/SettingsContext';

import { isBgmActive } from '@/lib/audioVolume';

import { applyBgmFromSettings } from '@/lib/bgmController';

import { isSoundPlaybackAllowed } from '@/lib/themeMusicPlayer';



type PitLaneSplashProps = {

  onFinish: () => void;

};



export function PitLaneSplash({ onFinish }: PitLaneSplashProps) {

  const styles = useStyles();

  const { id: themeId } = useTheme();

  const { settings } = useSettings();

  const [showPoster, setShowPoster] = useState(true);

  const logoScale = useRef(new Animated.Value(0.92)).current;

  const logoOpacity = useRef(new Animated.Value(0)).current;

  const checkerOpacity = useRef(new Animated.Value(0)).current;

  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const finishedRef = useRef(false);

  const onFinishRef = useRef(onFinish);

  onFinishRef.current = onFinish;



  const { videoPlayer, stopAll } = useSplashMedia(true, {

    themeId,

    feedback: settings.feedback,

  });



  /** iOS 等で自動再生がブロックされた場合の保険 */

  const primeAudio = useCallback(async () => {

    if (!isBgmActive(settings.feedback) || !isSoundPlaybackAllowed()) return;

    applyBgmFromSettings(settings.feedback, themeId, 'splash');

  }, [settings.feedback, themeId]);



  const finish = async () => {

    if (finishedRef.current) return;

    finishedRef.current = true;

    await stopAll();

    onFinishRef.current();

  };



  useEffect(() => {

    Animated.sequence([

      Animated.timing(overlayOpacity, {

        toValue: 1,

        duration: 500,

        useNativeDriver: true,

      }),

      Animated.parallel([

        Animated.timing(logoOpacity, {

          toValue: 1,

          duration: 450,

          useNativeDriver: true,

        }),

        Animated.spring(logoScale, {

          toValue: 1,

          tension: 68,

          friction: 9,

          useNativeDriver: true,

        }),

      ]),

      Animated.sequence([

        Animated.timing(checkerOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),

        Animated.timing(checkerOpacity, { toValue: 0.25, duration: 120, useNativeDriver: true }),

        Animated.timing(checkerOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),

      ]),

    ]).start();

  }, [checkerOpacity, logoOpacity, logoScale, overlayOpacity]);



  return (

    <GamePressable style={styles.container} onPressIn={primeAudio} onPress={finish}>

      <VideoView

        player={videoPlayer}

        style={styles.video}

        contentFit="cover"

        nativeControls={false}

        onFirstFrameRender={() => setShowPoster(false)}

      />

      {showPoster ? (

        <Image

          source={{ uri: SPLASH_MEDIA.videoPoster }}

          style={styles.video}

          resizeMode="cover"

        />

      ) : null}



      <Animated.View style={[styles.scrim, { opacity: overlayOpacity }]} />

      <View style={styles.scrimBottom} />



      {/* ロゴ — 画面水平中央（top は維持） */}

      <View style={styles.logoBoardWrap} pointerEvents="none">

        <Animated.View

          style={[

            styles.logoBoard,

            {

              opacity: logoOpacity,

              transform: [{ scale: logoScale }],

            },

          ]}

        >

          <Text style={styles.pitLabel}>PIT LANE</Text>

          <View style={styles.brandRow}>

            <Text style={styles.brand}>DRIFTSCORE</Text>

            <Text style={styles.brandAccent}> AI</Text>

          </View>

          <Text style={styles.tagline}>ドリフトを計測してスコア化</Text>

        </Animated.View>

      </View>



      <Animated.View style={[styles.checkerRow, { opacity: checkerOpacity }]}>

        {Array.from({ length: 12 }).map((_, i) => (

          <View

            key={i}

            style={[styles.checkerCell, i % 2 === 0 && styles.checkerCellOn]}

          />

        ))}

      </Animated.View>



      <Text style={styles.skipHint}>

        {!settings.feedback.soundEnabled

          ? '▶  PRESS START  ·  🔇'

          : !settings.feedback.bgmEnabled

            ? '▶  PRESS START  ·  BGM OFF'

            : '▶  PRESS START  ◀'}

      </Text>

    </GamePressable>

  );

}



function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {

  return StyleSheet.create({

  container: {

    flex: 1,

    backgroundColor: colors.background,

  },

  video: {

    ...StyleSheet.absoluteFillObject,

  },

  scrim: {

    ...StyleSheet.absoluteFillObject,

    backgroundColor: 'rgba(0, 0, 0, 0.42)',

  },

  scrimBottom: {

    position: 'absolute',

    left: 0,

    right: 0,

    bottom: 0,

    height: 160,

    backgroundColor: 'rgba(0, 0, 0, 0.55)',

  },

  logoBoardWrap: {

    position: 'absolute',

    top: '28%',

    left: 0,

    right: 0,

    alignItems: 'center',

  },

  logoBoard: {

    width: '88%',

    maxWidth: 340,

    borderWidth: 1,

    borderColor: colors.neonGreenDim,

    backgroundColor: 'rgba(13, 18, 13, 0.82)',

    paddingVertical: spacing.xl,

    paddingHorizontal: spacing.xl,

    alignItems: 'center',

    gap: spacing.sm,

  },

  pitLabel: {

    ...typography.label,

    color: colors.neonGreenDim,

    fontSize: 11,

    letterSpacing: 6,

  },

  brandRow: {

    flexDirection: 'row',

    alignItems: 'baseline',

    justifyContent: 'center',

  },

  brand: {

    ...typography.title,

    color: colors.textPrimary,

    fontSize: 22,

  },

  brandAccent: {

    ...typography.title,

    color: colors.neonGreen,

    fontSize: 22,

  },

  tagline: {

    ...typography.label,

    color: colors.textMuted,

    fontSize: 9,

    textTransform: 'none',

    letterSpacing: 1,

    textAlign: 'center',

  },

  checkerRow: {

    position: 'absolute',

    bottom: 96,

    left: spacing.lg,

    right: spacing.lg,

    flexDirection: 'row',

    height: 8,

    borderWidth: 1,

    borderColor: colors.border,

    overflow: 'hidden',

  },

  checkerCell: {

    flex: 1,

    backgroundColor: colors.surface,

  },

  checkerCellOn: {

    backgroundColor: colors.neonGreenDim,

  },

  skipHint: {

    position: 'absolute',

    bottom: spacing.xl,

    left: 0,

    right: 0,

    textAlign: 'center',

    ...typography.label,

    color: colors.neonGreen,

    fontSize: 10,

    textTransform: 'none',

    letterSpacing: 4,

    fontWeight: '800',

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

