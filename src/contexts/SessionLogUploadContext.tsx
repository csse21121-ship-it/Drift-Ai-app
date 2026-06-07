import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';
import { useSessionLogCloudSync, type SessionLogSaveInput } from '@/hooks/useTelemetrySession';
import { SupabaseTurnstileGate } from '@/components/auth/SupabaseTurnstileGate';
import { warmupAnonymousAuth } from '@/lib/supabase';

type SessionLogUploadContextValue = ReturnType<typeof useSessionLogCloudSync> & {
  uploadSessionLog: (input: SessionLogSaveInput) => void;
};

const SessionLogUploadContext = createContext<SessionLogUploadContextValue | null>(null);

function SessionLogUploadToastOverlay() {
  const insets = useSafeAreaInsets();
  const { colors, typography } = useTheme();
  const ctx = useContext(SessionLogUploadContext);
  if (!ctx) return null;

  const { saveStatus, saveMessage } = ctx;

  if (saveStatus === 'idle' || !saveMessage) {
    return null;
  }

  const isLoading = saveStatus === 'loading';
  const isSuccess = saveStatus === 'success';
  const isError = saveStatus === 'error';

  const backgroundColor = isSuccess
    ? colors.neonGreenMuted
    : isError
      ? '#3f1d24'
      : colors.surface;
  const borderColor = isSuccess
    ? colors.neonGreen + '88'
    : isError
      ? '#ff446688'
      : colors.border;
  const textColor = isSuccess ? colors.neonGreen : isError ? '#ff8899' : colors.textPrimary;

  return (
    <View pointerEvents="none" style={[toastStyles.wrap, { bottom: insets.bottom + 16 }]}>
      <View style={[toastStyles.toast, { backgroundColor, borderColor }]}>
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.amber} style={toastStyles.spinner} />
        ) : (
          <Text style={[toastStyles.icon, { color: textColor }]}>{isSuccess ? '✓' : '!'}</Text>
        )}
        <Text
          style={[toastStyles.message, typography.label, { color: textColor }]}
          numberOfLines={4}
        >
          {saveMessage}
        </Text>
      </View>
    </View>
  );
}

const toastStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 12,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  spinner: {
    width: 18,
    height: 18,
  },
  icon: {
    fontSize: 16,
    fontWeight: '800',
    width: 18,
    textAlign: 'center',
  },
  message: {
    flex: 1,
    fontSize: 13,
    letterSpacing: 0.5,
  },
});

export function SessionLogUploadProvider({ children }: { children: ReactNode }) {
  const cloudSync = useSessionLogCloudSync();

  useEffect(() => {
    void warmupAnonymousAuth();
  }, []);

  const uploadSessionLog = useCallback(
    (input: SessionLogSaveInput) => {
      cloudSync.saveSessionLog(input);
    },
    [cloudSync],
  );

  const value = useMemo(
    () => ({
      ...cloudSync,
      uploadSessionLog,
    }),
    [cloudSync, uploadSessionLog],
  );

  return (
    <SessionLogUploadContext.Provider value={value}>
      {children}
      <SupabaseTurnstileGate />
      <SessionLogUploadToastOverlay />
    </SessionLogUploadContext.Provider>
  );
}

export function useSessionLogUpload(): SessionLogUploadContextValue {
  const ctx = useContext(SessionLogUploadContext);
  if (!ctx) {
    throw new Error('useSessionLogUpload must be used within SessionLogUploadProvider');
  }
  return ctx;
}
