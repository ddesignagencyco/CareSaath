import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import * as customerApi from '../../api/customer/api';
import { USE_MOCKS } from '../../api/config';
import { MOCK_OTP } from '../../api/customer/mock-handlers';
import { useAuth } from '../../auth/AuthContext';
import { OtpInput, PhoneField } from '../../components/form';
import { HeroBand } from '../../components/brand';
import { LogoMark } from '../../components/Logo';
import { Screen } from '../../components/screen';
import { RichText, Text } from '../../components/Text';
import { Button, DirChevron, Touchable, BUTTON_HEIGHT } from '../../components/ui';
import { useT } from '../../i18n';
import { formatPkMobile, parsePkMobile } from '../../lib/phone';
import { useApiErrorText } from '../../lib/query';
import type { AuthScreen } from '../../navigation/types';
import { accent,
  brand,
  colors,
  feedback,
  ink,
  radius,
  space, themed, brandFixed } from '../../theme';

const RESEND_SECONDS = 30;

/** Demo accounts with data in the mock DBs. */
const DEMO_PHONE = {
  customer: '+923211234567',
  caregiver: '+923001110011',
} as const;

/** FR-C1 / FR-CG1: phone number + 6-digit OTP, no password. */
export function LoginScreen({ route, navigation }: AuthScreen<'Login'>) {
  const intent = route.params?.intent;
  const joining = intent === 'caregiver';
  const t = useT('shared');
  const tm = useT('mobile.login');
  const tc = useT('customerA.login');
  const tg = useT('caregiverA.login');
  const ta = useT('common.actions');
  const apiError = useApiErrorText();
  const { signIn } = useAuth();

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const parsed = parsePkMobile(phone);

  // Android back on the code step returns to the number, not out of login.
  useEffect(() => {
    if (step !== 'otp') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('phone');
      return true;
    });
    return () => sub.remove();
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function sendCode() {
    setError(null);
    if (!parsed.ok) {
      setError(t(`phone.${parsed.code}`));
      return;
    }
    setLoading(true);
    try {
      await customerApi.authApi.requestOtp(parsed.e164);
      setStep('otp');
      setCode('');
      setResendIn(RESEND_SECONDS);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  async function verify(value = code) {
    if (!parsed.ok || value.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      const msg = await signIn(parsed.e164, value, intent);
      if (msg) {
        setError(msg);
        setLoading(false);
      }
      // On success the root navigator swaps to the role's app; nothing else to do.
    } catch (e) {
      setError(apiError(e));
      setCode('');
      setLoading(false);
    }
  }

  const title = joining ? tm('caregiverTitle') : tm('title');
  const description = joining ? tg('phoneDescription') : tm('description');

  return (
    <Screen
      header={
        <HeroBand>
          <View style={styles.heroTop}>
            <Touchable
              onPress={
                step === 'otp'
                  ? () => setStep('phone')
                  : // Opened directly for a returning user: back leads to the role choice.
                    () =>
                      navigation.canGoBack()
                        ? navigation.goBack()
                        : navigation.replace('Welcome')
              }
              accessibilityRole="button"
              accessibilityLabel={ta('back')}
              style={styles.heroBack}
            >
              <DirChevron back color="#fff" size={24} />
            </Touchable>
            <View style={styles.flex} />
            <LogoMark size={36} variant="onDark" />
          </View>
          <Text
            variant="h1"
            weight="extrabold"
            color="#fff"
            accessibilityRole="header"
            style={styles.heroTitle}
          >
            {step === 'phone' ? title : t('login.checkPhone')}
          </Text>
          <Text color={brandFixed[100]}>
            {step === 'phone'
              ? description
              : // The number goes where the sentence puts <phone> (start in Urdu, end in English).
                t
                  .raw('login.enterCode')
                  .split(/<phone><\/phone>/)
                  .map((part, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && (
                        <Text weight="bold" color="#fff">
                          {parsed.ok ? formatPkMobile(parsed.e164) : ''}
                        </Text>
                      )}
                      {part}
                    </React.Fragment>
                  ))}
          </Text>
          <View style={styles.steps} accessibilityLabel={t('login.progress')}>
            {[t('login.stepPhone'), t('login.stepVerify')].map((label, i) => {
              const on = (step === 'phone' ? 0 : 1) >= i;
              return (
                <View
                  key={label}
                  style={[styles.stepPill, on && styles.stepPillOn]}
                >
                  <Text
                    variant="caption"
                    weight="bold"
                    color={on ? brandFixed[900] : brandFixed[100]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </HeroBand>
      }
      footer={
        step === 'phone' ? (
          <Button
            label={t('login.sendCode')}
            size="lg"
            block
            loading={loading}
            disabled={!phone}
            onPress={sendCode}
          />
        ) : (
          <Button
            label={t('login.verify')}
            size="lg"
            block
            loading={loading}
            disabled={code.length !== 6}
            onPress={() => verify()}
          />
        )
      }
    >
      {step === 'phone' ? (
        <>
          <PhoneField
            value={phone}
            onChangeText={v => {
              setPhone(v);
              setError(null);
            }}
            error={error}
            autoFocus
            onSubmitEditing={sendCode}
            returnKeyType="send"
          />
          {USE_MOCKS && (
            <Touchable
              onPress={() => setPhone(DEMO_PHONE[intent ?? 'customer'].replace('+92', '0'))}
              accessibilityRole="button"
              style={styles.hint}
            >
              <Text variant="small" color={brand[800]}>
                {tm('tryNumber', { phone: formatPkMobile(DEMO_PHONE[intent ?? 'customer']) })}
              </Text>
            </Touchable>
          )}
          <Text variant="small" color={ink[400]}>
            {tc('footerNote')}
          </Text>
          {/* Only matters for a new number: existing accounts open their own app. */}
          <Touchable
            onPress={() => navigation.setParams({ intent: joining ? 'customer' : 'caregiver' })}
            accessibilityRole="button"
            style={styles.switch}
          >
            <Text
              variant="small"
              weight="bold"
              color={brand[700]}
              align="center"
            >
              {joining ? tm('switchCaregiver') : tm('joinCaregiver')}
            </Text>
          </Touchable>
        </>
      ) : (
        <>
          <OtpInput
            value={code}
            error={!!error}
            onChange={v => {
              setCode(v);
              setError(null);
              if (v.length === 6) verify(v);
            }}
          />
          {!!error && (
            <Text
              variant="small"
              color={feedback.danger700}
              align="center"
              accessibilityLiveRegion="polite"
            >
              {error}
            </Text>
          )}
          <View style={styles.resend}>
            <Text variant="small" color={colors.textMuted}>
              {t('login.didntGet')}
            </Text>
            {resendIn > 0 ? (
              <Text variant="small" weight="semibold" color={ink[500]} tabular numberOfLines={1}>
                {t('login.resendIn', {
                  time: `0:${String(resendIn).padStart(2, '0')}`,
                })}
              </Text>
            ) : (
              <Touchable
                onPress={sendCode}
                accessibilityRole="button"
                style={styles.resendBtn}
              >
                <Text variant="small" weight="bold" color={brand[700]} numberOfLines={1}>
                  {t('login.resend')}
                </Text>
              </Touchable>
            )}
          </View>
          <Touchable
            onPress={() => setStep('phone')}
            accessibilityRole="button"
            style={styles.resendBtn}
          >
            <Text
              variant="small"
              weight="semibold"
              color={brand[700]}
              align="center"
            >
              {tm('editNumber')}
            </Text>
          </Touchable>
          {USE_MOCKS && (
            <View style={styles.hint}>
              <RichText variant="small" color={brand[800]}>
                {tm.raw('codeHint', { code: `<b>${MOCK_OTP}</b>` })}
              </RichText>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  heroBack: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { letterSpacing: -0.6, marginBottom: space.sm },
  steps: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  stepPill: {
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  stepPillOn: { backgroundColor: accent[400] },
  hint: {
    backgroundColor: brand[50],
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: brand[100],
    overflow: 'hidden',
  },
  resend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  switch: {
    minHeight: BUTTON_HEIGHT,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand[100],
    backgroundColor: colors.surface,
  },
  resendBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
}));
