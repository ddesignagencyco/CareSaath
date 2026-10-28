import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { moneyApi } from '../../api/caregiver/api';
import { keys } from '../../api/caregiver/keys';
import { ApiError, USE_MOCKS } from '../../api/http';
import type {
  CaregiverPayoutRequest,
  PayoutAccount,
  PayoutAccountType,
  PayoutStatus,
} from '../../api/types';
import { Select, TextField } from '../../components/form';
import {
  Banknote,
  CircleCheck,
  Download,
  Hourglass,
  Landmark,
  Pencil,
  Plus,
  Smartphone,
  Trash,
  Wallet,
  type IconType,
} from '../../components/icons';
import { ConfirmSheet, Sheet } from '../../components/overlay';
import {
  EmptyState,
  ErrorState,
  Screen,
  SkeletonList,
} from '../../components/screen';
import { Text } from '../../components/Text';
import {
  Badge,
  Button,
  IconButton,
  OnDark,
  IconTile,
  Segmented,
  type TileTone,
  type Tone,
} from '../../components/ui';
import { useT } from '../../i18n';
import { formatMoney, useFmt, useLabels } from '../../i18n/format';
import { parsePkMobile, type PhoneErrorCode } from '../../lib/phone';
import { useAction, useQuery } from '../../lib/query';
import { brand, colors, feedback, ink, radius, shadow, space, themed, brandFixed, accentFixed } from '../../theme';
import { Panel } from './components/Bits';
import { digits } from './components/helpers';

const PAYOUT_TONE: Record<PayoutStatus, Tone> = {
  REQUESTED: 'warning',
  PROCESSING: 'info',
  TRANSFERRED: 'accent',
  PAID: 'success',
  REJECTED: 'danger',
};

/**
 * One payout in the history. A TRANSFERRED payout asks the caregiver to
 * confirm it arrived (it then turns PAID) or to report it missing, which
 * flags it for the admin to check and resend.
 */
function PayoutRow({ p }: { p: CaregiverPayoutRequest }) {
  const t = useT('caregiverB.earnings');
  const tc = useT('common.actions');
  const f = useFmt();
  const L = useLabels();
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState('');
  const confirm = useAction(() => moneyApi.confirmPayoutReceived(p.id), {
    invalidate: [keys.earnings, keys.payouts],
    success: t('history.confirmedToast'),
  });
  const report = useAction(() => moneyApi.reportPayoutNotReceived(p.id, note.trim()), {
    invalidate: [keys.payouts],
    success: t('history.reportedToast'),
    onSuccess: () => {
      setReporting(false);
      setNote('');
    },
  });
  const awaiting = p.status === 'TRANSFERRED' && !p.caregiverConfirmedAt;
  const receipt = useAction(() => moneyApi.openPayoutReceipt(p.id), { success: null });
  const hasReceipt = !USE_MOCKS && (p.status === 'PAID' || p.status === 'TRANSFERRED');
  return (
    <View style={styles.payoutBlock}>
      <View style={styles.payout}>
        <IconTile icon={Banknote} tone={p.status === 'PAID' ? 'mint' : p.status === 'REJECTED' ? 'danger' : p.status === 'TRANSFERRED' ? 'marigold' : 'sand'} size={40} />
        <View style={styles.flex}>
          <Text weight="bold" tabular numeric numberOfLines={1}>
            {f.money(p.amount)}
          </Text>
          <Text variant="caption" color={colors.textMuted}>
            {`${p.payoutAccount.provider} · ${t('history.requested', { date: f.date(p.requestedAt) })}${
              p.processedAt ? ` · ${p.status === 'PAID' ? t('history.paid', { date: f.date(p.processedAt) }) : t('history.closed', { date: f.date(p.processedAt) })}` : ''
            }`}
          </Text>
        </View>
        <Badge tone={PAYOUT_TONE[p.status]} label={L.payout(p.status)} />
      </View>
      {hasReceipt && <Button label={t('history.receipt')} icon={Download} variant="ghost" loading={receipt.isPending} onPress={() => receipt.run(undefined)} style={styles.receiptBtn} />}
      {awaiting &&
        (p.issueReportedAt ? (
          <Text variant="small" weight="semibold" color={colors.textMuted}>
            {t('history.reported')}
          </Text>
        ) : (
          <View style={styles.payoutActions}>
            <Button label={t('history.reportNot')} variant="secondary" style={styles.flex} onPress={() => setReporting(true)} />
            <Button label={t('history.confirmReceived')} variant="success" style={styles.flex} loading={confirm.isPending} onPress={() => confirm.run(undefined)} />
          </View>
        ))}
      <Sheet
        visible={reporting}
        onClose={() => setReporting(false)}
        title={t('history.reportNot')}
        footer={
          <View style={styles.payoutSheetButtons}>
            <Button label={t('history.reportNot')} block size="lg" loading={report.isPending} disabled={!note.trim()} onPress={() => report.run(undefined)} />
            <Button label={tc('cancel')} variant="secondary" block onPress={() => setReporting(false)} />
          </View>
        }>
        <TextField label={t('history.reportPlaceholder')} value={note} onChangeText={setNote} maxLength={500} multiline />
      </Sheet>
    </View>
  );
}

/** FR-CG9: earnings, payout request, payout accounts. */
export function EarningsScreen() {
  const t = useT('caregiverB.earnings');
  const tp = useT('caregiverB.payoutForm');
  const f = useFmt();
  const earnings = useQuery(keys.earnings, moneyApi.earnings);
  const payouts = useQuery([...keys.payouts, 'list'], () =>
    moneyApi.payouts({ limit: 20 }),
  );
  const accounts = useQuery(keys.accounts, moneyApi.accounts);
  const [withdraw, setWithdraw] = useState(false);
  const [editing, setEditing] = useState<PayoutAccount | 'new' | null>(null);

  const e = earnings.data;
  const accs = accounts.data ?? [];
  const paidOut = e
    ? e.lifetimeEarnings - e.availableAmount - e.pendingAmount
    : 0;
  const refresh = () => {
    earnings.refetch();
    payouts.refetch();
    accounts.refetch();
  };

  return (
    <Screen
      title={t('title')}
      subtitle={t('description')}
      back
      refreshing={earnings.isFetching && !earnings.isLoading}
      onRefresh={refresh}
    >
      {earnings.error ? (
        <ErrorState error={earnings.error} onRetry={earnings.refetch} />
      ) : !e ? (
        <SkeletonList count={2} height={140} />
      ) : (
        <>
          {/* OnDark: the disabled Withdraw button gets the clean translucent style on teal. */}
          <OnDark.Provider value>
            <View style={styles.balance}>
              <Text variant="small" weight="semibold" color={brandFixed[100]}>
                {t('availableToWithdraw')}
              </Text>
              <Text
                variant="display"
                weight="extrabold"
                color="#fff"
                tabular
                numeric
                numberOfLines={1}
                style={styles.amount}
              >
                {f.money(e.availableAmount)}
              </Text>
              <Text variant="small" color={brandFixed[200]} numberOfLines={1}>
                {t('fromVisits', { count: e.availableCount })}
              </Text>
              <Button
                label={t('withdrawButton')}
                icon={Wallet}
                variant="live"
                size="lg"
                block
                style={styles.withdraw}
                disabled={e.availableAmount < 100 || accs.length === 0}
                onPress={() => setWithdraw(true)}
              />
              {accs.length === 0 && accounts.data && (
                <Text variant="caption" color={accentFixed[200]}>
                  {t('addAccountFirst')}
                </Text>
              )}
            </View>
          </OnDark.Provider>

          <View style={styles.stats}>
            <Stat
              icon={Hourglass}
              tone="sand"
              label={t('stats.pending')}
              value={f.money(e.pendingAmount)}
              note={t('stats.pendingNote', { count: e.pendingCount })}
            />
            <Stat
              icon={CircleCheck}
              tone="mint"
              label={t('stats.paidOut')}
              value={f.money(paidOut)}
              note={t('stats.allTime')}
            />
            <Stat
              icon={Wallet}
              tone="teal"
              label={t('stats.total')}
              value={f.money(e.lifetimeEarnings)}
              note={t('stats.totalNote', { count: e.lifetimeVisits })}
            />
            <Stat
              icon={Landmark}
              tone="ink"
              label={t('stats.commission')}
              value={f.money(e.lifetimeCommission)}
              note={t('stats.allTime')}
            />
          </View>
        </>
      )}

      <Panel
        title={t('accounts.title')}
        action={
          <IconButton
            icon={Plus}
            label={tp('addAccount')}
            color={brand[700]}
            onPress={() => setEditing('new')}
          />
        }
      >
        {accounts.isLoading ? (
          <SkeletonList count={1} height={60} />
        ) : accs.length === 0 ? (
          <Text variant="small" color={colors.textMuted}>
            {t('accounts.empty')}
          </Text>
        ) : (
          accs.map(a => (
            <AccountRow key={a.id} account={a} onEdit={() => setEditing(a)} />
          ))
        )}
      </Panel>

      <Panel title={t('history.title')}>
        {payouts.error ? (
          <ErrorState error={payouts.error} onRetry={payouts.refetch} />
        ) : payouts.isLoading ? (
          <SkeletonList count={2} height={56} />
        ) : (payouts.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title={t('history.emptyTitle')}
            text={t('history.emptyDescription')}
          />
        ) : (
          payouts.data!.items.map(p => <PayoutRow key={p.id} p={p} />)
        )}
      </Panel>

      {e && (
        <WithdrawSheet
          key={`${e.availableAmount}-${accs.length}`}
          visible={withdraw}
          available={e.availableAmount}
          accounts={accs}
          onClose={() => setWithdraw(false)}
        />
      )}
      <AccountSheet
        account={editing === 'new' ? null : editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}

function Stat({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: IconType;
  tone: TileTone;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <View style={styles.stat}>
      <IconTile icon={icon} tone={tone} size={36} />
      <Text
        variant="caption"
        weight="semibold"
        color={colors.textMuted}
        numberOfLines={2}
      >
        {label}
      </Text>
      <Text variant="lead" weight="extrabold" tabular numeric numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" color={ink[400]} numberOfLines={1}>
        {note}
      </Text>
    </View>
  );
}

function AccountRow({
  account,
  onEdit,
}: {
  account: PayoutAccount;
  onEdit: () => void;
}) {
  const t = useT('caregiverB.earnings.accounts');
  const L = useLabels();
  const tc = useT('common.actions');
  const [confirming, setConfirming] = useState(false);
  const Icon = account.type === 'BANK' ? Banknote : Smartphone;
  const remove = useAction(() => moneyApi.deleteAccount(account.id), {
    invalidate: [keys.accounts],
    success: t('removed'),
    onError: err => {
      // The API returns a 500 (FK constraint) for accounts with payout history.
      if (err instanceof ApiError && err.status === 500)
        err.message = t('removeBlocked');
    },
  });
  return (
    <View style={styles.account}>
      <IconTile
        icon={Icon}
        tone={account.type === 'BANK' ? 'teal' : 'marigold'}
        size={40}
      />
      <View style={styles.flex}>
        <Text weight="bold" numberOfLines={1}>
          {account.provider}
          {/* LTR isolate keeps the masked number intact inside Urdu text. */}
          <Text
            color={colors.textMuted}
          >{`  \u2066${account.accountNumber}\u2069`}</Text>
        </Text>
        <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
          {`${L.payoutAccount(account.type)} · ${account.accountTitle}`}
        </Text>
      </View>
      <IconButton
        icon={Pencil}
        label={t('edit', { provider: account.provider })}
        onPress={onEdit}
      />
      <IconButton
        icon={Trash}
        label={t('remove', { provider: account.provider })}
        color={feedback.danger600}
        onPress={() => setConfirming(true)}
      />
      <ConfirmSheet
        visible={confirming}
        title={t('remove', { provider: account.provider })}
        confirmLabel={tc('remove')}
        danger
        loading={remove.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.run(undefined).then(() => setConfirming(false))}
      />
    </View>
  );
}

function WithdrawSheet({
  visible,
  available,
  accounts,
  onClose,
}: {
  visible: boolean;
  available: number;
  accounts: PayoutAccount[];
  onClose: () => void;
}) {
  const t = useT('caregiverB.earnings.withdraw');
  const L = useLabels();
  /*
   * Full balance only: the payout endpoint locks whole visit payments oldest
   * first, so a partial amount would lock (and hide) more than requested.
   * Re-enable a custom amount once the backend can split payments.
   */
  const amount = available;
  const [accountId, setAccountId] = useState<string | null>(
    accounts[0]?.id ?? null,
  );
  const error = amount < 100 ? t('minAmount') : null;
  const request = useAction(
    () => moneyApi.requestPayout({ payoutAccountId: accountId!, amount }),
    {
      invalidate: [keys.earnings, keys.payouts],
      success: t('requested', { amount: formatMoney(amount) }),
      onSuccess: onClose,
    },
  );
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('title')}
      footer={
        <Button
          label={
            error
              ? t('requestPayout')
              : t('requestAmount', { amount: formatMoney(amount) })
          }
          size="lg"
          block
          disabled={!!error || !accountId}
          loading={request.isPending}
          onPress={() => request.run(undefined)}
        />
      }
    >
      <View style={styles.withdrawAmount}>
        <Text variant="small" color={colors.textMuted} align="center">
          {t('amount')}
        </Text>
        <Text
          variant="display"
          weight="extrabold"
          color={brand[800]}
          align="center"
          tabular
          numeric
          numberOfLines={1}
          style={styles.ltr}
        >
          {formatMoney(amount)}
        </Text>
      </View>
      <Select
        label={t('sendTo')}
        value={accountId}
        onChange={setAccountId}
        options={accounts.map(a => ({
          value: a.id,
          label: `${a.provider} ${a.accountNumber}`,
          description: `${L.payoutAccount(a.type)} · ${a.accountTitle}`,
        }))}
      />
      <Text variant="caption" color={colors.textMuted}>
        {t('note')}
      </Text>
    </Sheet>
  );
}

const WALLETS = ['JazzCash', 'Easypaisa', 'SadaPay', 'NayaPay'];
const BANKS = [
  'Meezan Bank',
  'HBL',
  'UBL',
  'MCB Bank',
  'Allied Bank',
  'Bank Alfalah',
  'Bank Al Habib',
  'Faysal Bank',
  'Askari Bank',
  'Standard Chartered',
  'National Bank of Pakistan',
  'Bank of Punjab',
];
/** PK IBAN: PK + 2 check digits + 4-letter bank code + 16 digits (24 chars). */
const IBAN = /^PK\d{2}[A-Z]{4}\d{16}$/;

type NumberError =
  | { kind: 'phone'; code: PhoneErrorCode }
  | { kind: 'iban' }
  | { kind: 'account' };

function validateNumber(
  type: PayoutAccountType,
  raw: string,
): { value: string } | { error: NumberError } {
  const v = raw.replace(/\s/g, '').toUpperCase();
  if (type === 'MOBILE_WALLET') {
    const phone = parsePkMobile(v);
    if (!phone.ok) return { error: { kind: 'phone', code: phone.code } };
    return { value: `0${phone.e164.slice(3)}` };
  }
  if (v.startsWith('PK'))
    return IBAN.test(v) ? { value: v } : { error: { kind: 'iban' } };
  return /^\d{8,20}$/.test(v) ? { value: v } : { error: { kind: 'account' } };
}

/** Add or edit a payout account. Remounted per open so it starts fresh. */
function AccountSheet({
  visible,
  account,
  onClose,
}: {
  visible: boolean;
  account: PayoutAccount | null;
  onClose: () => void;
}) {
  return visible ? (
    <AccountForm
      key={account?.id ?? 'new'}
      account={account}
      onClose={onClose}
    />
  ) : null;
}

function AccountForm({
  account,
  onClose,
}: {
  account: PayoutAccount | null;
  onClose: () => void;
}) {
  const t = useT('caregiverB.payoutForm');
  const ts = useT('shared');
  const tc = useT('common.actions');
  const [type, setType] = useState<PayoutAccountType>(
    account?.type ?? 'MOBILE_WALLET',
  );
  const [provider, setProvider] = useState(account?.provider ?? '');
  const [title, setTitle] = useState(account?.accountTitle ?? '');
  const [number, setNumber] = useState('');
  const [touched, setTouched] = useState(false);

  const providers = type === 'MOBILE_WALLET' ? WALLETS : BANKS;
  const checked = number ? validateNumber(type, number) : null;
  const numberErr =
    touched && checked && 'error' in checked ? checked.error : null;
  const numberError = !numberErr
    ? null
    : numberErr.kind === 'phone'
    ? ts(`phone.${numberErr.code}`)
    : numberErr.kind === 'iban'
    ? t('ibanError')
    : t('accountError');
  // Editing: the number may be left blank to keep the existing one.
  const numberOk = account
    ? !number || (checked !== null && 'value' in checked)
    : checked !== null && 'value' in checked;
  const valid = provider.length >= 2 && title.trim().length >= 2 && numberOk;

  const save = useAction(
    () => {
      const accountNumber =
        checked && 'value' in checked ? checked.value : undefined;
      if (account)
        return moneyApi.updateAccount(account.id, {
          type,
          provider,
          accountTitle: title.trim(),
          ...(accountNumber ? { accountNumber } : {}),
        });
      return moneyApi.createAccount({
        type,
        provider,
        accountTitle: title.trim(),
        accountNumber: accountNumber!,
      });
    },
    {
      invalidate: [keys.accounts],
      success: account ? t('updated') : t('added'),
      onSuccess: onClose,
    },
  );

  return (
    <Sheet
      visible
      onClose={onClose}
      title={account ? t('editTitle') : t('addTitle')}
      footer={
        <Button
          label={account ? tc('saveChanges') : t('addAccount')}
          size="lg"
          block
          disabled={!valid}
          loading={save.isPending}
          onPress={() => {
            setTouched(true);
            if (valid) save.run(undefined);
          }}
        />
      }
    >
      <Text color={colors.textMuted}>{t('description')}</Text>
      <Segmented<PayoutAccountType>
        value={type}
        onChange={v => {
          setType(v);
          setProvider('');
          setNumber('');
        }}
        options={[
          { value: 'MOBILE_WALLET', label: t('wallet') },
          { value: 'BANK', label: t('bank') },
        ]}
      />
      <Select
        label={type === 'MOBILE_WALLET' ? t('chooseWallet') : t('searchBank')}
        value={provider || null}
        onChange={setProvider}
        options={providers.map(p => ({ value: p, label: p }))}
      />
      <TextField
        label={t('accountTitle')}
        hint={t('asOnCnic')}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        autoCapitalize="words"
      />
      <TextField
        label={
          type === 'MOBILE_WALLET' ? t('walletNumber') : t('ibanOrAccount')
        }
        value={number}
        onChangeText={v =>
          setNumber(
            type === 'MOBILE_WALLET'
              ? digits(v, 13)
              : v
                  .toUpperCase()
                  .replace(/[^A-Z0-9 ]/g, '')
                  .slice(0, 30),
          )
        }
        onBlur={() => setTouched(true)}
        keyboardType={type === 'MOBILE_WALLET' ? 'phone-pad' : 'default'}
        autoCapitalize="characters"
        placeholder={
          type === 'MOBILE_WALLET' ? '0300 1234567' : 'PK36MEZN0002010104274471'
        }
        ltr
        error={numberError}
        hint={
          account
            ? t('currentHint', { number: account.accountNumber })
            : undefined
        }
      />
    </Sheet>
  );
}

const styles = themed(() => StyleSheet.create({
  withdrawAmount: {
    paddingVertical: 20,
    borderRadius: 16,
    backgroundColor: brand[50],
    gap: 4,
  },
  flex: { flex: 1 },
  ltr: { writingDirection: 'ltr' },
  balance: {
    backgroundColor: brand[900],
    borderRadius: radius.xl + 4,
    padding: space.xl,
    gap: space.xs,
    overflow: 'hidden',
    ...shadow.pop,
  },
  amount: { writingDirection: 'ltr', alignSelf: 'flex-start', maxWidth: '100%' },
  withdraw: { marginTop: space.md },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 4,
    ...shadow.card,
  },
  payout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  payoutBlock: { gap: space.sm },
  receiptBtn: { alignSelf: 'flex-start' },
  payoutActions: { flexDirection: 'row', gap: space.sm },
  payoutSheetButtons: { gap: space.sm },
  account: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
}));
