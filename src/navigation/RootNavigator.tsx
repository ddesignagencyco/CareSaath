import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { lastRole, useAuth } from '../auth/AuthContext';
import { kv } from '../lib/storage';
import { INTRO_SEEN_KEY, IntroScreen } from '../screens/auth/IntroScreen';
import { BrandLoader } from '../components/Logo';
import { ErrorState } from '../components/screen';
import { View } from 'react-native';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';
import { CaregiverNavigator } from './CaregiverNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { colors } from '../theme';
import { stackOptions } from './options';
import type { AuthStack } from './types';

const Auth = createNativeStackNavigator<AuthStack>();

/** Signed out → auth stack; signed in → that role's app. Switching trees resets history. */
export function RootNavigator() {
  const { booting, bootError, retryBoot, role } = useAuth();
  if (booting) return <BrandLoader />;
  if (bootError) return <BootError error={bootError} onRetry={retryBoot} />;
  if (role === 'customer') return <CustomerNavigator />;
  if (role === 'caregiver') return <CaregiverNavigator />;
  // First launch → intro, then straight to the phone login (the number decides
  // the role). After a sign-out → "I need care / I give care" first.
  const signedOutBefore = lastRole() !== null;
  const initial = kv.getItem(INTRO_SEEN_KEY) !== '1' ? 'Intro' : signedOutBefore ? 'Welcome' : 'Login';
  return (
    <Auth.Navigator screenOptions={stackOptions} initialRouteName={initial}>
      <Auth.Screen name="Intro" component={IntroScreen} />
      <Auth.Screen name="Welcome" component={WelcomeScreen} />
      <Auth.Screen name="Login" component={LoginScreen} />
    </Auth.Navigator>
  );
}

/** Signed in, but the profile couldn't load (offline at launch). Keep the session; offer retry. */
function BootError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
      <ErrorState error={error} onRetry={onRetry} />
    </View>
  );
}
