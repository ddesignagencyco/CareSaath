import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeroBand } from '../../components/brand';
import {
  BadgeCheck,
  Clock,
  MapPin,
  ShieldCheck,
  Siren,
  type IconType,
} from '../../components/icons';
import { ErrorState, Screen, Section, Skeleton } from '../../components/screen';
import { Text } from '../../components/Text';
import {
  Avatar,
  Button,
  Card,
  DirChevron,
  Divider,
  Touchable,
} from '../../components/ui';
import { useT } from '../../i18n';
import { formatMoney, useFmt, useLabels } from '../../i18n/format';
import type { CustomerScreen } from '../../navigation/types';
import { brand, colors, ink, radius, shadow, space, themed, brandFixed } from '../../theme';
import { IconLine, Rating, firstName, useCaregiver, LineIcon } from './components/bits';

/** Monday-first display; availability uses 0 = Sunday … 6 = Saturday. */
const DAYS = [1, 2, 3, 4, 5, 6, 0];

/** FR-C4: qualifications, license number, experience, ratings, rate. */
export function CaregiverProfileScreen({
  route,
  navigation,
}: CustomerScreen<'CaregiverProfile'>) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const t = useT('customerA.profile');
  const tp = useT('mobileCustomer.profile');
  const tc = useT('common.actions');
  const f = useFmt();
  const L = useLabels();
  const c = useCaregiver(id);
  const p = c.data;

  return (
    <Screen
      // Teal strip behind the status bar; the hero below scrolls with the page.
      header={<View style={[styles.statusStrip, { height: insets.top }]} />}
      contentStyle={styles.content}
      footer={
        p ? (
          <Button
            label={t('bookMobile', {
              name: firstName(p.user.fullName),
              price: formatMoney(p.ratePerVisit),
            })}
            size="lg"
            block
            onPress={() => navigation.navigate('Book', { caregiverId: p.id })}
          />
        ) : undefined
      }
    >
      <HeroBand overlap={OVERLAP} style={styles.hero}>
        <Touchable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={tc('back')}
          rippleColor="rgba(255,255,255,0.2)"
          hitSlop={4}
          style={styles.back}
        >
          <DirChevron back color="#fff" size={24} />
        </Touchable>
        {p && (
          <View style={styles.heroBody}>
            <View style={styles.avatarRing}>
              <Avatar name={p.user.fullName} uri={p.photoUrl} size={88} />
            </View>
            <Text variant="h2" weight="extrabold" color="#fff" align="center" numberOfLines={1}>
              {p.user.fullName}
            </Text>
            <Text color={brandFixed[100]} align="center" numberOfLines={1}>
              {L.specialty(p.specialty)}
            </Text>
            <View style={styles.ratingChip}>
              <Rating average={p.ratingAverage} count={p.ratingCount} />
            </View>
          </View>
        )}
      </HeroBand>

      <View style={styles.body}>
        {c.error && !p ? (
          <ErrorState error={c.error} onRetry={c.refetch} />
        ) : !p ? (
          <>
            <Skeleton height={120} />
            <Skeleton height={260} />
          </>
        ) : (
          <>
            {/* Floating facts card: price is the decision-maker, so it leads. */}
            <Card style={styles.stats}>
              <View style={styles.stat}>
                <Text
                  variant="h2"
                  weight="extrabold"
                  color={brand[800]}
                  tabular
                  align="center"
                  numberOfLines={1}
                >
                  {formatMoney(p.ratePerVisit)}
                </Text>
                <Text variant="caption" color={colors.textMuted} align="center">
                  {t('perVisit')}
                </Text>
              </View>
              {p.experienceYears !== null && (
                <>
                  <View style={styles.statDivider} />
                  <View style={styles.stat}>
                    <Text
                      variant="h2"
                      weight="extrabold"
                      color={brand[800]}
                      tabular
                      align="center"
                      numberOfLines={1}
                    >
                      {String(p.experienceYears)}
                    </Text>
                    <Text
                      variant="caption"
                      color={colors.textMuted}
                      align="center"
                    >
                      {tp('yearsLabel', { n: p.experienceYears })}
                    </Text>
                  </View>
                </>
              )}
            </Card>

            <Card style={styles.gapLg}>
              <View style={styles.license}>
                <LineIcon icon={BadgeCheck} size={22} color={brand[600]} />
                <View style={styles.flex}>
                  <Text variant="small" weight="bold">
                    {t('licenseVerified')}
                  </Text>
                  {/* The licence number itself stays with the admin team (confidential). */}
                  <Text variant="small" color={ink[600]}>
                    {tp('verifiedBy', { body: L.licenseBody(p.licenseBody) })}
                  </Text>
                </View>
              </View>
              <IconLine
                icon={MapPin}
                color={ink[700]}
                text={t('cities', { cities: f.list(p.serviceArea.cities) })}
              />
              {!!p.bio && (
                <View style={styles.about}>
                  <Text weight="bold">{t('about')}</Text>
                  <Text color={ink[700]}>{p.bio}</Text>
                </View>
              )}
            </Card>

            <Section title={t('weeklyHours')}>
              <Text variant="small" color={colors.textMuted}>
                {t('weeklyHoursHint')}
              </Text>
              <Card padded={false}>
                {DAYS.map((dow, i) => {
                  const wins = p.availabilityRules.filter(
                    r => r.dayOfWeek === dow,
                  );
                  return (
                    <View key={dow}>
                      {i > 0 && <Divider inset={space.lg} />}
                      <View style={styles.day}>
                        <Text weight="semibold" style={styles.dayName} numberOfLines={1}>
                          {f.dayOfWeek(dow)}
                        </Text>
                        <View style={styles.wins}>
                          {wins.length === 0 ? (
                            <Text variant="small" color={ink[400]}>
                              {t('notAvailable')}
                            </Text>
                          ) : (
                            wins.map(w => (
                              <View key={w.startTime} style={styles.win}>
                                <Clock size={12} color={brand[800]} />
                                <Text
                                  variant="caption"
                                  weight="semibold"
                                  color={brand[800]}
                                  tabular
                                  numberOfLines={1}
                                >
                                  {f.timeWindow(w.startTime, w.endTime)}
                                </Text>
                              </View>
                            ))
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </Section>

            <Section title={t('safeTitle')}>
              <Card style={styles.safety}>
                <SafetyLine icon={ShieldCheck} text={t('safety.identity')} />
                <SafetyLine icon={MapPin} text={t('safety.notified')} />
                <SafetyLine icon={Siren} text={t('safety.sos')} />
              </Card>
            </Section>
          </>
        )}
      </View>
    </Screen>
  );
}

function SafetyLine({ icon: Icon, text }: { icon: IconType; text: string }) {
  return (
    <View style={styles.safeLine}>
      <LineIcon icon={Icon} color={brand[600]} />
      <Text variant="small" color={ink[700]} style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

const OVERLAP = 40;

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  gapLg: { gap: space.lg },
  statusStrip: { backgroundColor: brandFixed[800] },
  content: { padding: 0, gap: 0 },
  hero: { paddingTop: space.sm, paddingHorizontal: space.md },
  // Same as the shared Header back button.
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroBody: { alignItems: 'center', gap: 2, paddingBottom: space.sm },
  avatarRing: {
    padding: 4,
    borderRadius: 52,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: space.sm,
  },
  ratingChip: {
    marginTop: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  body: { paddingHorizontal: space.lg, gap: space.lg, marginTop: -OVERLAP },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.lg,
    ...shadow.pop,
  },
  stat: { flex: 1, gap: 2 },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: ink[200],
  },
  license: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: brand[50],
    borderWidth: 1,
    borderColor: brand[100],
  },
  about: { gap: 4 },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 52,
  },
  dayName: { width: 64 },
  wins: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  win: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: brand[50],
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  safety: { gap: space.md },
  safeLine: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
}));
