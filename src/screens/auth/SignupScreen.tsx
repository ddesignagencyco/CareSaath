import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import * as customerApi from '../../api/customer/api';
import { ApiError } from '../../api/http';
import type { AppRole } from '../../auth/AuthContext';
import { useAuth } from '../../auth/AuthContext';
import { HeroBand } from '../../components/brand';
import { OtpInput, PhoneField, TextField } from '../../components/form';
import { LogoMark } from '../../components/Logo';
import { Screen } from '../../components/screen';
import { Text } from '../../components/Text';
import { Button, DirChevron, Touchable } from '../../components/ui';
import { useT } from '../../i18n';
import { formatPkMobile, parsePkMobile } from '../../lib/phone';
import { useApiErrorText } from '../../lib/query';
import type { AuthScreen } from '../../navigation/types';
import { brand, brandFixed, colors, feedback, ink, radius, space, themed } from '../../theme';

const RESEND_SECONDS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Proper sign-up: role + name (+ optional email) + number + OTP, matching the web. */
export function SignupScreen({ route, navigation }: AuthScreen<'Signup'>) {
  const t = useT('shared');
  const ts = useT('mobile.signup');
  const ta = useT('common.actions');
  const apiError = useApiErrorText();
  const { signUp } = useAuth();

  const [role, setRole] = useState<AppRole>(route.params?.role ?? 'customer');
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const parsed = parsePkMobile(phone);

  // Android back on the code step returns to the details, not out of sign-up.
  useEffect(() => {
    if (step !== 'otp') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep('details');
      return true;
    });
    return () => sub.remove();
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  function validate(): boolean {
    let ok = true;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(ts('nameRequired'));
      ok = false;
    } else if (trimmed.length < 2) {
      setNameError(ts('nameTooShort'));
      ok = false;
    }
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      setEmailError(ts('emailInvalid'));
      ok = false;
    }
    if (!parsed.ok) {
      setError(t(`phone.${parsed.code}`));
      ok = false;
    }
    return ok;
  }

  async function createAccount() {
    setError(null);
    setNameError(null);
    setEmailError(null);
    if (!validate() || !parsed.ok) return;
    setLoading(true);
    try {
      await customerApi.authApi.signup({
        phone: parsed.e164,
        fullName: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        role: role === 'caregiver' ? 'CAREGIVER' : 'CUSTOMER',
      });
      setStep('otp');
      setCode('');
      setResendIn(RESEND_SECONDS);
    } catch (e) {
      // The backend rejects a taken phone OR email with 409 BEFORE sending the OTP,
      // so the clash shows here on the details step (not after a code is sent). An
      // email clash is shown on the email field; a number clash points to log in.
      if (e instanceof ApiError && e.status === 409) {
        if ((e.message || '').toLowerCase().includes('email')) {
          setEmailError(ts('emailExists'));
        } else {
          setError(ts('exists'));
        }
      } else {
        setError(apiError(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function verify(value = code) {
    if (!parsed.ok || value.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      const msg = await signUp(parsed.e164, value, role);
      if (msg) {
        setError(msg);
        setLoading(false);
      }
      // On success the root navigator swaps to the role's app (caregiver → onboarding).
    } catch (e) {
      setError(apiError(e));
      setCode('');
      setLoading(false);
    }
  }

  return (
    <Screen
      header={
        <HeroBand>
          <View style={styles.heroTop}>
            <Touchable
              onPress={step === 'otp' ? () => setStep('details') : () => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Welcome'))}
              accessibilityRole="button"
              accessibilityLabel={ta('back')}
              style={styles.heroBack}>
              <DirChevron back color="#fff" size={24} />
            </Touchable>
            <View style={styles.flex} />
            <LogoMark size={36} variant="onDark" />
          </View>
          <Text variant="h1" weight="extrabold" color="#fff" accessibilityRole="header" style={styles.heroTitle}>
            {step === 'details' ? ts('title') : t('login.checkPhone')}
          </Text>
          <Text color={brandFixed[100]}>
            {step === 'details'
              ? ts(role === 'caregiver' ? 'caregiverSubtitle' : 'customerSubtitle')
              : `${t('login.stepVerify')} · ${parsed.ok ? formatPkMobile(parsed.e164) : ''}`}
          </Text>
        </HeroBand>
      }
      footer={
        step === 'details' ? (
          <View style={styles.footer}>
            <Button label={ts('create')} size="lg" block loading={loading} onPress={createAccount} />
            <Touchable onPress={() => navigation.navigate('Login', { intent: role })} accessibilityRole="button" style={styles.link}>
              <Text variant="small" color={colors.textMuted} align="center">
                {ts('haveAccount')}{' '}
                <Text variant="small" weight="bold" color={brand[700]}>
                  {ts('logIn')}
                </Text>
              </Text>
            </Touchable>
            {/* Role was chosen on Welcome; switching is a quiet option here, not a second picker. */}
            <Touchable onPress={() => setRole(role === 'customer' ? 'caregiver' : 'customer')} accessibilityRole="button" style={styles.link}>
              <Text variant="small" color={colors.textMuted} align="center">
                {ts(role === 'customer' ? 'giveInstead' : 'getInstead')}{' '}
                <Text variant="small" weight="bold" color={brand[700]}>
                  {ts('switch')}
                </Text>
              </Text>
            </Touchable>
          </View>
        ) : (
          <Button label={t('login.verify')} size="lg" block loading={loading} disabled={code.length !== 6} onPress={() => verify()} />
        )
      }>
      {step === 'details' ? (
        <>
          <TextField
            label={ts('name')}
            placeholder={ts('namePlaceholder')}
            value={name}
            onChangeText={v => {
              setName(v);
              setNameError(null);
            }}
            error={nameError}
            autoCapitalize="words"
            autoComplete="name"
            returnKeyType="next"
          />
          <TextField
            label={ts('email')}
            hint={ts('emailHint')}
            optional
            placeholder={ts('emailPlaceholder')}
            value={email}
            onChangeText={v => {
              setEmail(v);
              setEmailError(null);
            }}
            error={emailError}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            ltr
            returnKeyType="next"
          />
          <PhoneField
            value={phone}
            onChangeText={v => {
              setPhone(v);
              setError(null);
            }}
            error={error}
            onSubmitEditing={createAccount}
            returnKeyType="done"
          />

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
            <Text variant="small" color={feedback.danger700} align="center" accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
          <View style={styles.resend}>
            <Text variant="small" color={colors.textMuted}>
              {t('login.didntGet')}
            </Text>
            {resendIn > 0 ? (
              <Text variant="small" weight="semibold" color={ink[500]} tabular numberOfLines={1}>
                {t('login.resendIn', { time: `0:${String(resendIn).padStart(2, '0')}` })}
              </Text>
            ) : (
              <Touchable onPress={createAccount} accessibilityRole="button" style={styles.resendBtn}>
                <Text variant="small" weight="bold" color={brand[700]} numberOfLines={1}>
                  {t('login.resend')}
                </Text>
              </Touchable>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
    heroBack: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
    heroTitle: { letterSpacing: -0.6, marginBottom: space.sm },
    footer: { gap: 0 },
    link: { minHeight: 40, justifyContent: 'center' },
    resend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, flexWrap: 'wrap' },
    resendBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: radius.sm, overflow: 'hidden' },
  }),
);
