import type { ConfigContext, ExpoConfig } from 'expo/config';

const PLACEHOLDER_GOOGLE_MAPS = 'YOUR_GOOGLE_MAPS_API_KEY_HERE';

function resolveGoogleMapsApiKey(): string {
  const fromEnv = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  return PLACEHOLDER_GOOGLE_MAPS;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = resolveGoogleMapsApiKey();

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...(config.android?.config ?? {}),
        googleMaps: {
          apiKey: googleMapsApiKey,
        },
      },
    },
    ios: {
      ...config.ios,
      config: {
        ...(config.ios?.config ?? {}),
        googleMapsApiKey,
      },
    },
    extra: {
      ...(config.extra ?? {}),
      googleMapsConfigured:
        googleMapsApiKey.length > 0 && googleMapsApiKey !== PLACEHOLDER_GOOGLE_MAPS,
      orsConfigured: Boolean(process.env.EXPO_PUBLIC_ORS_API_KEY?.trim()),
    },
  };
};
