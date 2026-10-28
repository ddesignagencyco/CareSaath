import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { caregiversApi } from '../../../api/customer/api';
import { keys } from '../../../api/customer/keys';
import type {
  CaregiverBookingStatus,
  CaregiverSearchItem,
  CustomerBookingListItem,
  PatientProfile,
  PublicCaregiver,
  VisitStatus,
} from '../../../api/types';
import { Check, Clock, MapPin, Repeat, ShieldCheck, Star } from '../../../components/icons';
import { Briefcase } from './icons';
import { Text, useTextStyle } from '../../../components/Text';
import { Avatar, Badge, Card, DateBlock, DirChevron, Touchable, type Tone } from '../../../components/ui';
import { useT } from '../../../i18n';
import { formatMoney, localDayKey, useFmt, useLabels } from '../../../i18n/format';
import { useQuery } from '../../../lib/query';
import { accent, brand, colors, ink, radius, space, themed, feedback } from '../../../theme';

/* ---- Visit / booking rules (web: features/customer/lib/labels.ts) -------- */

export const VISIT_TONE: Record<VisitStatus, Tone> = {
  REQUESTED: 'accent',
  CONFIRMED: 'brand',
  EN_ROUTE: 'brand',
  CHECKED_IN: 'brand',
  IN_PROGRESS: 'brand',
  CHECKED_OUT: 'brand',
  COMPLETED: 'success',
  DECLINED: 'neutral',
  CANCELLED: 'neutral',
};

export const BOOKING_TONE: Record<CaregiverBookingStatus, Tone> = {
  REQUESTED: 'accent',
  CONFIRMED: 'success',
  DECLINED: 'neutral',
  CANCELLED: 'neutral',
  COMPLETED: 'success',
};

export const ACTIVE_VISIT: VisitStatus[] = ['EN_ROUTE', 'CHECKED_IN', 'IN_PROGRESS', 'CHECKED_OUT'];

/** A still-CONFIRMED booking whose live visits are all done shows as completed. */
export function bookingDisplayStatus(b: { status: CaregiverBookingStatus; visits: { status: VisitStatus }[] }): CaregiverBookingStatus {
  if (b.status !== 'CONFIRMED') return b.status;
  const live = b.visits.filter(v => v.status !== 'CANCELLED' && v.status !== 'DECLINED');
  return live.length > 0 && live.every(v => v.status === 'COMPLETED') ? 'COMPLETED' : b.status;
}

export function hasCancellableVisits(b: { status: CaregiverBookingStatus; visits: { status: VisitStatus }[] }): boolean {
  return (b.status === 'REQUESTED' || b.status === 'CONFIRMED') && b.visits.some(v => v.status === 'REQUESTED' || v.status === 'CONFIRMED');
}

const CIPHERTEXT = /^[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/;

/** The backend returns raw "iv:tag:ciphertext" when it can't decrypt; never show or save it back. */
export const isUnreadableMedical = (value: string | null | undefined) => !!value && CIPHERTEXT.test(value);

/** @db.Date "YYYY-MM-DDT00:00:00.000Z" -> "YYYY-MM-DD". */
export const dayKey = (dateOnly: string) => dateOnly.slice(0, 10);

/** Visit start as epoch ms in local time. */
export function visitStart(dateOnly: string, hhmm: string): number {
  const [y, m, d] = dayKey(dateOnly).split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

export const todayKey = () => localDayKey(Date.now());

export function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Pilot launch is Lahore only (web: shared/lib/options.ts CITY_OPTIONS). */
export const CITIES = ['Lahore'];

/** City centres, the default pin until a maps provider is added. */
export const CITY_CENTRES: Record<string, { lat: string; lng: string }> = {
  Lahore: { lat: '31.520400', lng: '74.358700' },
  Islamabad: { lat: '33.684400', lng: '73.047900' },
  Rawalpindi: { lat: '33.565100', lng: '73.016900' },
  Karachi: { lat: '24.860700', lng: '67.001100' },
};

/** Day number + short label ("Today", "Tomorrow", "Thu") for a DateBlock. */
export function useDayLabel() {
  const f = useFmt();
  const t = useT('labels.time');
  return (dateOnly: string) => {
    const key = dayKey(dateOnly);
    const [y, m, d] = key.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = todayKey();
    const tomorrow = localDayKey(Date.now() + 86_400_000);
    return {
      day: d,
      label: key === today ? t('today') : key === tomorrow ? t('tomorrow') : f.dayOfWeek(date.getDay()),
      isToday: key === today,
    };
  };
}

export const firstName = (full: string | undefined) => (full ?? '').split(' ')[0];

/* ---- Caregiver data ------------------------------------------------------- */

export function useCaregiver(id: string | undefined) {
  return useQuery([...keys.caregivers, 'profile', id], () => caregiversApi.get(id!), { enabled: !!id });
}

/** Public profiles for many ids (bookings only carry caregiverId). Missing ones map to undefined. */
export function useCaregiverMap(ids: string[]): Record<string, PublicCaregiver | undefined> {
  const unique = [...new Set(ids)].sort();
  const q = useQuery(
    [...keys.caregivers, 'map', unique.join(',')],
    async () => {
      const rows = await Promise.all(unique.map(id => caregiversApi.get(id).catch(() => null)));
      return Object.fromEntries(unique.map((id, i) => [id, rows[i] ?? undefined])) as Record<string, PublicCaregiver | undefined>;
    },
    { enabled: unique.length > 0 },
  );
  return q.data ?? {};
}

/* ---- Rating bits ---------------------------------------------------------- */

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  const t = useT('customerA.bits');
  return (
    <View style={styles.stars} accessible accessibilityLabel={t('starsAria', { value: value.toFixed(1) })}>
      {Array.from({ length: 5 }, (_, i) => {
        const on = i < Math.round(value);
        return <Star key={i} size={size} color={on ? accent[500] : ink[200]} fill={on ? accent[500] : ink[100]} />;
      })}
    </View>
  );
}

export function Rating({ average, count }: { average: string; count: number }) {
  const t = useT('customerA.bits');
  if (count === 0) {
    return (
      <Text variant="caption" weight="semibold" color={brand[700]}>
        {t('newOn')}
      </Text>
    );
  }
  return (
    <View style={styles.rating}>
      <Stars value={Number(average)} />
      <Text variant="caption" weight="bold" tabular>
        {Number(average).toFixed(1)}
      </Text>
      <Text variant="caption" color={ink[400]}>
        ({count})
      </Text>
    </View>
  );
}

export function VerifiedTag() {
  const t = useT('customerA.bits');
  return (
    <View style={styles.rating}>
      <ShieldCheck size={15} color={brand[700]} />
      <Text variant="caption" weight="semibold" color={brand[700]}>
        {t('verified')}
      </Text>
    </View>
  );
}

/* ---- Cards ---------------------------------------------------------------- */

/** Search result card (memoized for FlatList). */
export const CaregiverCard = memo(function CaregiverCardView({ c, onPress }: { c: CaregiverSearchItem; onPress: (id: string) => void }) {
  const t = useT('customerA.bits');
  const L = useLabels();
  const f = useFmt();
  return (
    <Card onPress={() => onPress(c.id)}>
      <View style={styles.cardTop}>
        <Avatar name={c.user.fullName} uri={c.photoUrl} size={64} />
        <View style={styles.flex}>
          <Text variant="lead" weight="bold" numberOfLines={1}>
            {c.user.fullName}
          </Text>
          <Text variant="small" weight="semibold" color={brand[700]} numberOfLines={1}>
            {L.specialty(c.specialty)}
          </Text>
          <View style={styles.wrapRow}>
            <Rating average={c.ratingAverage} count={c.ratingCount} />
          </View>
        </View>
      </View>
      {!!c.bio && (
        <Text variant="small" color={ink[600]} numberOfLines={2} style={styles.bio}>
          {c.bio}
        </Text>
      )}
      <View style={styles.cardMeta}>
        <VerifiedTag />
        {c.experienceYears !== null && <IconLine icon={Briefcase} text={t('experience', { n: c.experienceYears })} />}
        <IconLine icon={MapPin} text={f.list(c.serviceArea.cities)} />
      </View>
      <View style={styles.cardBottom}>
        <View style={styles.flex}>
          <Text variant="title" weight="extrabold" color={brand[800]} tabular numberOfLines={1}>
            {formatMoney(c.ratePerVisit)}
          </Text>
          <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
            {t('perVisit')}
          </Text>
        </View>
        <View style={styles.go}>
          <DirChevron color="#fff" />
        </View>
      </View>
    </Card>
  );
});

export function IconLine({ icon: Icon, text, color = ink[500] }: { icon: typeof MapPin; text: string; color?: string }) {
  return (
    <View style={styles.iconLine}>
      <Icon size={14} color={ink[400]} />
      <Text variant="small" color={color} style={styles.flexShrink} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

/** Booking summary for lists (memoized). Leads with the next visit's date. */
export const BookingCard = memo(function BookingCardView({
  booking,
  caregiver,
  patient,
  paymentDue,
  onPress,
}: {
  booking: CustomerBookingListItem;
  caregiver?: PublicCaregiver;
  patient?: PatientProfile;
  paymentDue?: boolean;
  onPress: (id: string) => void;
}) {
  const t = useT('customerB.bookingCard');
  const f = useFmt();
  const L = useLabels();
  const dayLabel = useDayLabel();
  const active = booking.visits.filter(v => v.status !== 'CANCELLED' && v.status !== 'DECLINED');
  const done = active.filter(v => v.status === 'COMPLETED').length;
  const name = caregiver?.user.fullName ?? t('caregiverFallback');
  const shown = bookingDisplayStatus(booking);
  const today = todayKey();
  const next = active.filter(v => v.status !== 'COMPLETED' && dayKey(v.scheduledDate) >= today).sort((x, y) => x.scheduledDate.localeCompare(y.scheduledDate))[0];
  const d = dayLabel(next?.scheduledDate ?? booking.startDate);
  return (
    <Card onPress={() => onPress(booking.id)}>
      <View style={styles.cardTop}>
        <DateBlock day={d.day} label={d.label} highlight={d.isToday && !!next} />
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Avatar name={name} uri={caregiver?.photoUrl} size={26} />
            <Text weight="bold" style={styles.flex} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
            {t('serviceFor', { service: L.specialty(booking.serviceType), patient: patient?.name ?? t('patientFallback') })}
          </Text>
          <View style={styles.bookingMeta}>
            {booking.recurrenceRule && <IconLine icon={Repeat} color={ink[700]} text={f.weekdays(booking.recurrenceRule.weekdays)} />}
            <IconLine icon={Clock} color={ink[700]} text={f.timeWindow(booking.timeWindowStart, booking.timeWindowEnd)} />
          </View>
        </View>
        <DirChevron />
      </View>
      <View style={styles.cardFoot}>
        <Badge tone={BOOKING_TONE[shown]} label={L.bookingCustomer(shown)} />
        {paymentDue && <Badge tone="danger" label={t('paymentDue')} />}
        <Text variant="caption" color={colors.textMuted} style={styles.footText} numberOfLines={1}>
          {active.length > 1 ? t('visitsDone', { done, total: active.length }) : active.length === 1 ? t('oneVisit') : t('noActiveVisits')}
        </Text>
      </View>
    </Card>
  );
});

/* ---- Choice card (radio) ---------------------------------------------------- */

export function Choice({ selected, onPress, children, label }: { selected: boolean; onPress: () => void; children: React.ReactNode; label: string }) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.choice, selected ? styles.choiceOn : styles.choiceOff]}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <Check size={14} color="#fff" strokeWidth={3} />}</View>
      <View style={styles.flex}>{children}</View>
    </Touchable>
  );
}

/** Tinted inline message. */
/**
 * Icon for a row whose text may wrap (alignItems: 'flex-start'): its box is
 * as tall as the first text line, so the icon centres on that line in both
 * languages (Urdu's line is ~1.6x its size, taller than Latin).
 */
export function LineIcon({ icon: Icon, size = 18, color, variant = 'small' }: { icon: typeof MapPin; size?: number; color: string; variant?: 'small' | 'body' }) {
  const line = useTextStyle(variant).lineHeight ?? 20;
  return (
    <View style={[styles.lineIcon, { height: line }]}>
      <Icon size={size} color={color} />
    </View>
  );
}

export function Banner({ tone = 'brand', children, icon: Icon }: { tone?: 'brand' | 'accent' | 'warning' | 'danger' | 'neutral' | 'success'; children: React.ReactNode; icon?: typeof MapPin }) {
  const c = BANNER[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c.bg, borderColor: c.border }]}>
      {Icon && <LineIcon icon={Icon} color={c.fg} />}
      <View style={styles.flex}>{typeof children === 'string' ? <Text variant="small" color={c.fg}>{children}</Text> : children}</View>
    </View>
  );
}

const BANNER = themed(() => ({
  brand: { bg: brand[50], fg: brand[800], border: brand[100] },
  accent: { bg: accent[50], fg: accent[700], border: accent[100] },
  warning: { bg: feedback.warning50, fg: feedback.warning700, border: feedback.warning200 },
  danger: { bg: feedback.danger50, fg: feedback.danger700, border: feedback.danger200 },
  neutral: { bg: ink[100], fg: ink[700], border: ink[200] },
  success: { bg: feedback.success50, fg: feedback.success700, border: feedback.success200 },
}));

export const bannerColor = (tone: keyof typeof BANNER) => BANNER[tone].fg;

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  stars: { flexDirection: 'row', gap: 1 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space.md, rowGap: 2, marginTop: 4 },
  bio: { marginTop: space.md },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: 6, marginTop: space.md },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ink[200],
  },
  go: { width: 40, height: 40, borderRadius: 20, backgroundColor: brand[700], alignItems: 'center', justifyContent: 'center' },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bookingMeta: { gap: 4, marginTop: space.sm },
  cardFoot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ink[200],
  },
  footText: { flexGrow: 1 },
  choice: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 2, overflow: 'hidden' },
  choiceOn: { borderColor: brand[500], backgroundColor: brand[50] },
  choiceOff: { borderColor: ink[100], backgroundColor: colors.surface },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: ink[300], alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOn: { borderColor: brand[600], backgroundColor: brand[600] },
  lineIcon: { justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
}));
