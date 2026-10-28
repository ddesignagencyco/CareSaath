import React, { memo, useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { paymentsApi } from '../../api/customer/api';
import { USE_MOCKS } from '../../api/config';
import { keys } from '../../api/customer/keys';
import type { CustomerPaymentWithVisit, PaymentMethod, PaymentStatus } from '../../api/types';
import { Banknote, CreditCard, Smartphone, type IconType, Download } from '../../components/icons';
import { Sheet } from '../../components/overlay';
import { EmptyState, ErrorState, Screen, Skeleton, SkeletonList } from '../../components/screen';
import { Text } from '../../components/Text';
import { Badge, Button, Card, Chip, Divider, HScroll, type Tone } from '../../components/ui';
import { useT } from '../../i18n';
import { formatMoney, useFmt, useLabels } from '../../i18n/format';
import { useAction, useQuery } from '../../lib/query';
import type { CustomerScreen } from '../../navigation/types';
import { brand, colors, ink, radius, space, themed } from '../../theme';
import { Banner } from './components/bits';

const ICON: Record<PaymentMethod, IconType> = { CASH: Banknote, CARD: CreditCard, JAZZCASH: Smartphone, EASYPAISA: Smartphone };
const TONE: Record<PaymentStatus, Tone> = { PAID: 'success', PENDING: 'accent', FAILED: 'danger', REFUNDED: 'neutral' };
const STATUSES = ['ALL', 'PAID', 'PENDING', 'FAILED', 'REFUNDED'] as const;
const PAGE = 20;

function useStatusText() {
  const t = useT('customerB.payments');
  const L = useLabels();
  return (p: Pick<CustomerPaymentWithVisit, 'status' | 'method'>) => (p.status === 'PENDING' ? (p.method === 'CASH' ? t('cashDue') : t('awaitingGateway')) : L.paymentStatus(p.status));
}

/** Every payment, with an in-app receipt. */
export function PaymentsScreen({ navigation }: CustomerScreen<'Payments'>) {
  const insets = useSafeAreaInsets();
  const t = useT('customerB.payments');
  const tm = useT('mobileCustomer.find');
  const L = useLabels();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('ALL');
  const [limit, setLimit] = useState(PAGE);
  const [viewing, setViewing] = useState<string | null>(null);
  const list = useQuery([...keys.payments, 'page', status, limit], () => paymentsApi.list({ page: 1, limit, status: status === 'ALL' ? undefined : status }));
  const onPress = useCallback((id: string) => setViewing(id), []);
  const renderItem = useCallback(({ item }: { item: CustomerPaymentWithVisit }) => <PaymentRow p={item} onPress={onPress} />, [onPress]);

  return (
    <Screen title={t('title')} back scroll={false}>
      <View style={styles.filters}>
        <HScroll contentContainerStyle={styles.chips}>
          {STATUSES.map(s => (
            <Chip
              key={s}
              label={s === 'ALL' ? t('all') : L.paymentStatus(s)}
              selected={status === s}
              onPress={() => {
                setStatus(s);
                setLimit(PAGE);
              }}
            />
          ))}
        </HScroll>
      </View>
      {list.error && !list.data ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : (
        <FlatList
          data={list.data?.items ?? []}
          keyExtractor={p => p.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, { paddingBottom: space.xxxl + insets.bottom }]}
          ItemSeparatorComponent={Separator}
          refreshControl={<RefreshControl refreshing={list.isFetching && !list.isLoading} onRefresh={list.refetch} colors={[brand[600]]} />}
          ListEmptyComponent={list.isLoading ? <SkeletonList count={4} height={72} /> : <EmptyState title={t('emptyTitle')} text={t('emptyHint')} />}
          ListFooterComponent={
            list.data && list.data.total > list.data.items.length ? <Button label={tm('loadMore')} variant="secondary" loading={list.isFetching} onPress={() => setLimit(l => l + PAGE)} style={styles.more} /> : undefined
          }
        />
      )}
      <Receipt
        id={viewing}
        onClose={() => setViewing(null)}
        onViewVisit={visitId => {
          setViewing(null);
          navigation.navigate('VisitDetail', { id: visitId });
        }}
      />
    </Screen>
  );
}

const PaymentRow = memo(function PaymentRowView({ p, onPress }: { p: CustomerPaymentWithVisit; onPress: (id: string) => void }) {
  const t = useT('customerB.payments');
  const f = useFmt();
  const L = useLabels();
  const statusText = useStatusText();
  const Icon = ICON[p.method];
  return (
    <Card onPress={() => onPress(p.id)} style={styles.row}>
      <View style={styles.icon}>
        <Icon size={20} color={brand[600]} />
      </View>
      <View style={styles.flex}>
        <Text weight="semibold" numberOfLines={1}>
          {t('visitFor', { patient: p.visit.booking.patient.name })}
        </Text>
        <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
          {f.date(p.visit.scheduledDate.slice(0, 10))} · {L.paymentMethod(p.method)}
        </Text>
      </View>
      <View style={styles.end}>
        <Text weight="bold" tabular numberOfLines={1}>
          {formatMoney(p.amount)}
        </Text>
        <Badge tone={TONE[p.status]} label={statusText(p)} />
      </View>
    </Card>
  );
});

function Receipt({ id, onClose, onViewVisit }: { id: string | null; onClose: () => void; onViewVisit: (visitId: string) => void }) {
  const t = useT('customerB.payments');
  const tr = useT('customerB.payments.receipt');
  const f = useFmt();
  const L = useLabels();
  const statusText = useStatusText();
  const q = useQuery([...keys.payments, 'detail', id], () => paymentsApi.get(id!), { enabled: !!id, refetchOnFocus: false });
  const p = q.data;
  const pdf = useAction(() => paymentsApi.openReceipt(id!), { success: null });
  const rows: [string, string][] = p
    ? [
        [tr('method'), L.paymentMethod(p.method)],
        [tr('visitDate'), f.date(p.visit.scheduledDate.slice(0, 10))],
        [tr('caregiverShare'), formatMoney(p.caregiverAmount)],
        [tr('commission'), formatMoney(p.commissionAmount)],
        [tr('reference'), p.gatewayRef ?? tr('noReference')],
        [tr('paidAt'), p.paidAt ? f.dateTime(p.paidAt) : tr('notPaidYet')],
        [tr('createdAt'), f.dateTime(p.createdAt)],
        [tr('receiptNo'), p.id],
      ]
    : [];
  return (
    <Sheet
      visible={!!id}
      onClose={onClose}
      title={tr('title')}
      footer={
        p ? (
          <View style={styles.footerButtons}>
            {p.status === 'PAID' && !USE_MOCKS && <Button label={tr('downloadPdf')} icon={Download} block loading={pdf.isPending} onPress={() => pdf.run(undefined)} />}
            <Button label={tr('viewVisit')} variant="secondary" block onPress={() => onViewVisit(p.visitId)} />
          </View>
        ) : undefined
      }>
      {q.error && !p ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : !p ? (
        <Skeleton height={260} />
      ) : (
        <>
          <Text variant="small" color={colors.textMuted}>
            {t('visitFor', { patient: p.visit.booking.patient.name })}
          </Text>
          <View style={styles.amount}>
            <View style={styles.flex}>
              <Text variant="small" color={colors.textMuted}>
                {tr('amount')}
              </Text>
              <Text variant="h2" weight="extrabold" tabular numberOfLines={1}>
                {formatMoney(p.amount)}
              </Text>
            </View>
            <Badge tone={TONE[p.status]} label={statusText(p)} />
          </View>
          <View>
            {rows.map(([label, value], i) => (
              <View key={label}>
                {i > 0 && <Divider />}
                <View style={styles.detail}>
                  <Text variant="small" color={colors.textMuted} style={styles.detailLabel}>
                    {label}
                  </Text>
                  <Text variant="small" weight="semibold" style={styles.flex} selectable>
                    {value}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          {p.status === 'PENDING' && <Banner tone="accent">{p.method === 'CASH' ? tr('pendingCash') : tr('pendingGateway')}</Banner>}
        </>
      )}
    </Sheet>
  );
}

const Separator = () => <View style={styles.sep} />;

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  // Capped so a long Urdu status can't squeeze the visit details out.
  end: { alignItems: 'flex-end', gap: 4, maxWidth: '45%' },
  filters: { paddingTop: space.lg, paddingBottom: space.md },
  chips: { gap: space.sm, paddingHorizontal: space.lg },
  list: { padding: space.lg, paddingTop: 0 },
  sep: { height: space.sm },
  more: { marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: brand[50], alignItems: 'center', justifyContent: 'center' },
  amount: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.md, backgroundColor: ink[50] },
  detail: { flexDirection: 'row', gap: space.md, paddingVertical: space.md },
  detailLabel: { width: 128 },
  footerButtons: { gap: space.sm },
}));
