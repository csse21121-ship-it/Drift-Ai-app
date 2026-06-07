import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  buildTurnstileHtml,
  deliverCaptchaToken,
  failCaptchaToken,
  getTurnstileBaseUrl,
  getTurnstileSiteKey,
  onCaptchaRefresh,
  preloadCaptchaToken,
} from '@/lib/supabaseCaptcha';

/**
 * 非表示 WebView で Cloudflare Turnstile トークンを取得する。
 * EXPO_PUBLIC_TURNSTILE_SITE_KEY 未設定時は何も描画しない。
 */
export function SupabaseTurnstileGate() {
  const siteKey = getTurnstileSiteKey();
  const baseUrl = getTurnstileBaseUrl();
  const webRef = useRef<WebView>(null);
  const [webReady, setWebReady] = useState(false);

  const html = useMemo(() => {
    if (!siteKey) return '';
    return buildTurnstileHtml(siteKey);
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey) return;
    return onCaptchaRefresh(() => {
      if (!webReady) return;
      webRef.current?.injectJavaScript(
        'window.__refreshTurnstile && window.__refreshTurnstile(); true;',
      );
    });
  }, [siteKey, webReady]);

  useEffect(() => {
    if (!siteKey || !webReady) return;
    preloadCaptchaToken();
  }, [siteKey, webReady]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const token = event.nativeEvent.data?.trim();
    if (__DEV__) {
      console.log('[turnstile] message:', token === 'error' ? 'error' : `token(${token?.length ?? 0})`);
    }
    if (token && token !== 'error') {
      deliverCaptchaToken(token);
      return;
    }
    failCaptchaToken('CAPTCHA_FAILED');
  };

  if (!siteKey) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.host}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        mixedContentMode="always"
        onLoadEnd={() => setWebReady(true)}
        onMessage={handleMessage}
        onError={(event) => {
          if (__DEV__) {
            console.warn('[turnstile] webview error:', event.nativeEvent);
          }
          failCaptchaToken('CAPTCHA_WEBVIEW_ERROR');
        }}
        onHttpError={(event) => {
          if (__DEV__) {
            console.warn('[turnstile] http error:', event.nativeEvent.statusCode);
          }
        }}
        style={styles.webview}
        {...(Platform.OS === 'android'
          ? { androidLayerType: 'hardware' as const }
          : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    width: 320,
    height: 120,
    opacity: 0.01,
    left: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: -1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
