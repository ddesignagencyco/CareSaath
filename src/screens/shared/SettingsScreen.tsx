import React from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Screen } from '../../components/screen';
import { useT } from '../../i18n';
import { EmergencySection, PreferencesCard } from './SettingsSections';
import { SignOutButton } from './SignOutButton';

/**
 * App preferences (language, text size). Caregivers still in onboarding /
 * verification reach this from the gear icon and have no More tab, so they
 * also get emergency numbers and sign out here.
 */
export function SettingsScreen() {
  const t = useT('mobile.settings');
  const { role, caregiverStage } = useAuth();
  const inSetup = role === 'caregiver' && caregiverStage !== 'approved';
  return (
    <Screen title={t('preferences')} back>
      <PreferencesCard />
      {inSetup && <EmergencySection />}
      {inSetup && <SignOutButton />}
    </Screen>
  );
}
