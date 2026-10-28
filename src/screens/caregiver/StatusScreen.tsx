import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { profileApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import type { MyCaregiverProfile } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { CareIllustration } from '../../components/brand';
import { Check, Clock, FileText, ListChecks, RefreshCw, Settings, ShieldCheck, Stethoscope } from '../../components/icons';
import { ErrorState, Header, Screen, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Button, IconButton } from '../../components/ui';
import { useT } from '../../i18n';
import { formatMoney, useFmt, useLabels } from '../../i18n/format';
import { useApiErrorText, useQuery } from '../../lib/query';
import { useToast } from '../../components/overlay';
import type { CaregiverSetupScreen } from '../../navigation/types';
import { accent, brand, colors, feedback, ink, radius, shadow, space, themed } from '../../theme';
import { DetailRow, Panel } from './components/Bits';
import { DocumentList, DocumentUploader } from './components/Documents';
import { Ban, CircleX, FileSearch } from './components/icons';

function Timeline({ profile }: { profile: MyCaregiverProfile }) {
  const t = useT('caregiverB.status.timeline');
  const f = useFmt();
  const hasDocs = profile.documents.length > 0;
  const steps = [
    { label: t('created'), detail: f.date(profile.createdAt), done: true, current: false },
    { label: t('uploaded'), detail: hasDocs ? t('files', { count: profile.documents.length }) : t('uploadBelow'), done: hasDocs, current: !hasDocs },
    { label: t('licenseCheck'), detail: t('licenseCheckDetail'), done: false, current: hasDocs },
    { label: t('live'), detail: t('liveDetail'), done: false, current: false },
  ];
  return (
    <View>
      {steps.map((s, i) => (
        <View key={s.label} style={styles.tlRow}>
          <View style={styles.tlRail}>
            <View style={[styles.tlDot, s.done ? styles.tlDone : s.current ? styles.tlCurrent : styles.tlTodo]}>
              {s.done ? (
                <Check size={14} color="#fff" strokeWidth={3} />
              ) : s.current ? (
                <Clock size={14} color="#fff" strokeWidth={2.5} />
              ) : (
                <Text variant="caption" weight="bold" color={ink[400]} align="center">
                  {String(i + 1)}
                </Text>
              )}
            </View>
            {i < steps.length - 1 && <View style={[styles.tlLine, s.done && styles.tlLineDone]} />}
          </View>
          <View style={styles.tlBody}>
            <Text variant="small" weight="bold" color={s.done || s.current ? ink[900] : ink[400]}>
              {s.label}
            </Text>
            <Text variant="caption" color={colors.textMuted}>
              {s.detail}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** FR-CG2: profile waits for admin approval before going live. */
export function StatusScreen({ navigation }: CaregiverSetupScreen<'Status'>) {
  const t = useT('caregiverB.status');
  const tm = useT('mobileCaregiver.status');
  const f = useFmt();
  const L = useLabels();
  const { reloadMe } = useAuth();
  const toast = useToast();
  const apiError = useApiErrorText();
  const profile = useQuery(keys.profile, profileApi.get);
  const p = profile.data;
  const status = p?.verificationStatus;
  const { refetch } = profile;

  // Caregivers aren't notified of decisions by the API, so poll every minute.
  useEffect(() => {
    const id = setInterval(refetch, 60_000);
    return () => clearInterval(id);
  }, [refetch]);

  // Approved: refresh /me so the navigator opens the working app.
  const reloaded = useRef(false);
  useEffect(() => {
    if (status === 'APPROVED' && !reloaded.current) {
      reloaded.current = true;
      // On failure, allow the next poll / pull-to-refresh to try again.
      reloadMe().catch(e => {
        reloaded.current = false;
        toast.error(apiError(e));
      });
    }
  }, [status, reloadMe, toast, apiError]);

  const header = (
    <Header
      title={t('progress')}
      // Refresh lives in the "Check status" button and pull-to-refresh; one header action is enough.
      right={<IconButton icon={Settings} label={tm('settings')} onPress={() => navigation.navigate('Settings')} />}
    />
  );

  if (profile.error) {
    return (
      <Screen header={header}>
        <ErrorState error={profile.error} onRetry={refetch} />
      </Screen>
    );
  }
  if (!p) {
    return (
      <Screen header={header}>
        <SkeletonList count={3} height={140} />
      </Screen>
    );
  }

  const rejection = p.credentialReviews.find(r => r.decision === 'REJECTED');
  const hero =
    status === 'REJECTED'
      ? { icon: CircleX, bg: feedback.danger50, ring: feedback.danger100, fg: feedback.danger700, title: t('rejected.title'), text: t('rejected.text') }
      : status === 'SUSPENDED'
        ? { icon: Ban, bg: ink[50], ring: ink[100], fg: ink[700], title: t('suspended.title'), text: t('suspended.text') }
        : {
            icon: FileSearch,
            bg: colors.surface,
            ring: accent[100],
            fg: brand[800],
            title: p.documents.length ? t('reviewing.title') : t('needDocs.title'),
            text: p.documents.length ? t('reviewing.text') : t('needDocs.text'),
          };
  const Icon = hero.icon;

  return (
    <Screen header={header} refreshing={profile.isFetching} onRefresh={refetch}>
      <View style={[styles.hero, { backgroundColor: hero.bg }]}>
        {status === 'PENDING' ? (
          <CareIllustration size={120} />
        ) : (
          <View style={[styles.heroIcon, { backgroundColor: hero.ring }]}>
            <Icon size={30} color={hero.fg} />
          </View>
        )}
        <Text variant="title" weight="extrabold" color={hero.fg} align="center">
          {hero.title}
        </Text>
        <Text color={hero.fg} align="center">
          {hero.text}
        </Text>
        {status === 'REJECTED' && !!rejection?.reason && (
          <View style={styles.reason}>
            <Text variant="small" color={ink[800]}>
              <Text variant="small" weight="bold">{`${t('reason')} `}</Text>
              {rejection.reason}
            </Text>
            <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
              {f.dateTime(rejection.decidedAt)}
            </Text>
          </View>
        )}
      </View>

      {status === 'PENDING' ? (
        <Panel icon={ListChecks} tone="teal" title={tm('steps')}>
          <Timeline profile={p} />
        </Panel>
      ) : (
        <Panel icon={Stethoscope} tone="teal" title={t('details.title')}>
          <DetailRow label={t('details.specialty')} value={L.specialty(p.specialty)} />
          <DetailRow label={t('details.license')} value={`\u2066${p.licenseNumber}\u2069 · ${L.licenseBodyShort(p.licenseBody)}`} />
          <DetailRow label={t('details.rate')} value={formatMoney(p.ratePerVisit)} />
          <DetailRow label={t('details.cities')} value={f.list(p.serviceArea.cities)} />
        </Panel>
      )}

      <Panel icon={FileText} tone="marigold" title={t('documents')}>
        <DocumentList documents={p.documents} />
        {status !== 'SUSPENDED' && (
          <View style={styles.uploader}>
            <DocumentUploader key={p.documents.length} defaultType={p.documents.some(d => d.type === 'LICENSE') ? 'CNIC_COPY' : 'LICENSE'} />
          </View>
        )}
      </Panel>

      <Button label={t('checkStatus')} icon={RefreshCw} variant="secondary" block loading={profile.isFetching} onPress={refetch} />

      {status === 'PENDING' && (
        <View style={styles.footer}>
          <ShieldCheck size={16} color={ink[500]} />
          <Text variant="caption" color={colors.textMuted} align="center" style={styles.flexShrink}>
            {t('footer')}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg, borderRadius: radius.xl + 4, borderWidth: 1, borderColor: ink[100], ...shadow.card },
  heroIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  reason: { alignSelf: 'stretch', marginTop: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md },
  tlRow: { flexDirection: 'row', gap: space.md },
  tlRail: { alignItems: 'center' },
  tlDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tlDone: { backgroundColor: brand[600] },
  tlCurrent: { backgroundColor: accent[500], borderWidth: 3, borderColor: accent[100] },
  tlTodo: { backgroundColor: ink[100] },
  tlLine: { width: 2, flex: 1, minHeight: 20, backgroundColor: ink[100], marginVertical: 2 },
  tlLineDone: { backgroundColor: brand[300] },
  tlBody: { flex: 1, paddingBottom: space.lg },
  uploader: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink[200], paddingTop: space.lg },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
}));
