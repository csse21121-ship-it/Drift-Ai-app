import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { LoggerProvider } from '@/contexts/LoggerContext';
import { PhoneCapabilitiesProvider } from '@/contexts/PhoneCapabilitiesContext';
import { SessionLogUploadProvider } from '@/contexts/SessionLogUploadContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { GameScreenBackdrop } from '@/components/ui/GameScreenBackdrop';
import { TsuisoInboundLinking } from '@/components/tsuiso/TsuisoInboundLinking';
import { useAudioSettingsSync } from '@/hooks/useAudioSettingsSync';

function ThemedStack() {
  const { colors, id, statusBarStyle } = useTheme();
  useAudioSettingsSync();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={statusBarStyle} />
      <Stack
        key={id}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}
      />
      <GameScreenBackdrop />
      <TsuisoInboundLinking />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <PhoneCapabilitiesProvider>
          <LoggerProvider>
            <SessionLogUploadProvider>
              <ThemedStack />
            </SessionLogUploadProvider>
          </LoggerProvider>
        </PhoneCapabilitiesProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}
