import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { LogOut } from '../../components/icons';
import { ConfirmSheet } from '../../components/overlay';
import { Button } from '../../components/ui';
import { useT } from '../../i18n';
import { space } from '../../theme';

/**
 * Sign out, placed last on the Account / More screen: red, on its own, with a
 * confirmation sheet.
 */
export function SignOutButton() {
  const t = useT('mobile.settings');
  const ta = useT('common.actions');
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);
  return (
    <View style={styles.wrap}>
      <Button label={ta('signOut')} icon={LogOut} mirrorIcon variant="dangerOutline" size="lg" block onPress={() => setConfirming(true)} />
      <ConfirmSheet
        visible={confirming}
        title={t('signOutConfirm')}
        body={t('signOutBody')}
        confirmLabel={ta('signOut')}
        danger
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          signOut();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md, paddingTop: space.sm },
});
