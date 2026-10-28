/**
 * CareSaath mobile app (customer + caregiver).
 *
 * @format
 */
import React, { useEffect, useRef, useState } from 'react';
import { Appearance, StatusBar, StyleSheet, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme, type NavigationState, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { LogoMark } from './src/components/Logo';
import { ToastProvider } from './src/components/overlay';
import { SettingsProvider, useSettings, useT } from './src/i18n';
import { hydrateStorage } from './src/lib/storage';
import { RootNavigator } from './src/navigation/RootNavigator';
import { activeScheme, brand, colors, setActiveScheme, themed } from './src/theme';

// Until saved settings load, follow the phone so the splash matches.
setActiveScheme(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');

const navTheme: Theme = themed(() => ({
  ...(activeScheme() === 'dark' ? DarkTheme : DefaultTheme),
  dark: activeScheme() === 'dark',
  colors: { ...(activeScheme() === 'dark' ? DarkTheme : DefaultTheme).colors, primary: brand[700], background: colors.bg, card: colors.surface, text: colors.text, border: colors.border },
}));

function Shell() {
  const { isRTL, scheme } = useSettings();
  // Styles are built per scheme, so switching dark mode remounts the screens;
  // the saved navigation state puts the user back where they were.
  const navState = useRef<NavigationState | undefined>(undefined);
  const tg = useT('caregiverA.login');
  return (
    // Urdu flips layout here instead of I18nManager.forceRTL, so switching
    // language takes effect immediately without restarting the app.
    <View style={[styles.flex, { direction: isRTL ? 'rtl' : 'ltr', backgroundColor: colors.bg }]}>
      <ToastProvider>
        <AuthProvider messages={{ roleAdmin: tg('adminError') }}>
          <NavigationContainer
            key={scheme}
            theme={navTheme}
            initialState={navState.current}
            onStateChange={st => {
              navState.current = st;
            }}>
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </ToastProvider>
    </View>
  );
}

function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    hydrateStorage().finally(() => setReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={activeScheme() === 'dark' ? 'light-content' : 'dark-content'} />
      {ready ? (
        <SettingsProvider>
          <Shell />
        </SettingsProvider>
      ) : (
        // Settings aren't loaded yet, so this splash must not render <Text>.
        <View style={styles.splash}>
          <LogoMark size={64} />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
}));

export default App;
