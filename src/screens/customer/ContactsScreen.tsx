import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { contactsApi } from '../../api/customer/api';
import { keys } from '../../api/customer/keys';
import { PhoneField, TextField } from '../../components/form';
import { Phone, Siren, Trash } from '../../components/icons';
import { ErrorState, Screen, Section, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Avatar, Button, Card, IconButton, Touchable } from '../../components/ui';
import { useT } from '../../i18n';
import { formatPkMobile, parsePkMobile } from '../../lib/phone';
import { useAction, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { brand, colors, feedback, space } from '../../theme';
import { Banner } from './components/bits';
import { UserPlus } from './components/icons';

/** People alerted by SMS when SOS is pressed (§9.2). */
export function ContactsScreen(_: CustomerScreen<'Contacts'>) {
  const t = useT('customerB.contacts');
  const ts = useT('shared.phone');
  const contacts = useQuery(keys.contacts, () => contactsApi.list());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);
  const parsed = parsePkMobile(phone);
  const phoneError = touched && phone && !parsed.ok ? ts(parsed.code) : null;

  const add = useAction(() => contactsApi.add({ name: name.trim(), phone: parsed.ok ? parsed.e164 : phone }), {
    invalidate: [keys.contacts],
    success: t('added'),
    onSuccess: () => {
      setName('');
      setPhone('');
      setTouched(false);
    },
  });
  const remove = useAction((id: string) => contactsApi.remove(id), { invalidate: [keys.contacts], success: t('removed') });

  return (
    <Screen title={t('title')} back>
      <Text color={colors.textMuted}>{t('description')}</Text>
      <Section title={t('yours')}>
        {contacts.error && !contacts.data ? (
          <ErrorState error={contacts.error} onRetry={contacts.refetch} />
        ) : !contacts.data ? (
          <SkeletonList count={1} height={72} />
        ) : contacts.data.length === 0 ? (
          <Banner tone="warning" icon={Siren}>
            {t('empty')}
          </Banner>
        ) : (
          contacts.data.map(c => (
            <Card key={c.id} style={styles.row}>
              <Avatar name={c.name} size={40} />
              <View style={styles.flex}>
                <Text weight="semibold" numberOfLines={1}>
                  {c.name}
                </Text>
                <Touchable onPress={() => Linking.openURL(`tel:${c.phone}`).catch(() => {})} accessibilityRole="link" style={styles.tel}>
                  <Phone size={12} color={brand[700]} />
                  <Text variant="small" color={brand[700]} tabular numberOfLines={1}>
                    {formatPkMobile(c.phone)}
                  </Text>
                </Touchable>
              </View>
              <IconButton icon={Trash} label={t('removeLabel', { name: c.name })} onPress={() => remove.run(c.id)} size={20} color={feedback.danger600} />
            </Card>
          ))
        )}
      </Section>

      <Section title={t('addTitle')}>
        <Card style={styles.form}>
          <TextField label={t('nameLabel')} value={name} onChangeText={setName} maxLength={120} placeholder={t('namePlaceholder')} />
          <PhoneField value={phone} onChangeText={setPhone} onBlur={() => setTouched(true)} error={phoneError} />
          <Button
            label={t('addSubmit')}
            icon={UserPlus}
            block
            loading={add.isPending}
            disabled={!name.trim() || !parsed.ok}
            onPress={() => {
              setTouched(true);
              if (name.trim() && parsed.ok) add.run(undefined);
            }}
          />
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tel: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  form: { gap: space.md },
});
