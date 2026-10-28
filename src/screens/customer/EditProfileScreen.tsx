import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { meApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import type { Me } from '../../api/types';
import { Select, TextField } from '../../components/form';
import { ErrorState, LoadingState, Screen } from '../../components/screen';
import { Avatar, Button, Card } from '../../components/ui';
import { useSettings, useT } from '../../i18n';
import { formatPkMobile } from '../../lib/phone';
import { useAction, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { space } from '../../theme';

/** PATCH /customer/me — the display name. The phone number is the sign-in and can't change here. */
export function EditProfileScreen({ navigation }: CustomerScreen<'EditProfile'>) {
  const t = useT('mobileCustomer.profile');
  const me = useQuery(keys.me, () => meApi.get());

  if (me.error && !me.data) {
    return (
      <Screen title={t('title')} back>
        <ErrorState error={me.error} onRetry={me.refetch} />
      </Screen>
    );
  }
  if (!me.data) {
    return (
      <Screen title={t('title')} back>
        <LoadingState />
      </Screen>
    );
  }
  return <ProfileForm me={me.data} onDone={() => navigation.goBack()} />;
}

function ProfileForm({ me, onDone }: { me: Me; onDone: () => void }) {
  const t = useT('mobileCustomer.profile');
  const ta = useT('customerB.account');
  const tc = useT('common.actions');
  const tl = useT('common.language');
  const { locale, setLocale } = useSettings();
  const [name, setName] = useState(me.fullName);
  const [language, setLanguage] = useState<'en' | 'ur'>(locale);
  const trimmed = name.trim();
  // The server language follows the app's, so SMS/WhatsApp match the screen.
  const save = useAction(() => meApi.update({ fullName: trimmed, preferredLanguage: language === 'ur' ? 'UR' : 'EN' }), {
    invalidate: [keys.me],
    success: ta('saved'),
    onSuccess: () => {
      if (language !== locale) setLocale(language);
      onDone();
    },
  });
  const changed = (!!trimmed && trimmed !== me.fullName) || language !== locale;

  return (
    <Screen
      title={t('title')}
      back
      footer={<Button label={tc('saveChanges')} size="lg" block disabled={!trimmed || !changed} loading={save.isPending} onPress={() => save.run(undefined)} />}>
      <View style={styles.avatar}>
        <Avatar name={trimmed || ta('you')} size={88} />
      </View>
      <Card style={styles.form}>
        <TextField
          label={ta('fullName')}
          hint={t('nameHint')}
          value={name}
          onChangeText={setName}
          maxLength={120}
          placeholder={ta('namePlaceholder')}
          autoCapitalize="words"
          autoFocus={!me.fullName}
          returnKeyType="done"
        />
        <TextField label={t('phone')} hint={t('phoneHint')} value={formatPkMobile(me.phone)} editable={false} ltr />
        <Select<'en' | 'ur'>
          label={tl('appLanguage')}
          hint={tl('hint')}
          value={language}
          onChange={setLanguage}
          variant="chips"
          options={[
            { value: 'en', label: tl('en') },
            { value: 'ur', label: tl('ur') },
          ]}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', paddingVertical: space.sm },
  form: { gap: space.lg },
});
