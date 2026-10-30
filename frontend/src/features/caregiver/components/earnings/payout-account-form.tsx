"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { Button } from "@shared/ui/button";
import { Field, Input } from "@shared/ui/field";
import { Modal } from "@shared/ui/overlay";
import { Select } from "@shared/ui/select";
import { parsePkMobile, type PhoneErrorCode } from "@shared/lib/phone";
import { useLabels } from "@shared/i18n/use-labels";
import type { PayoutAccount, PayoutAccountType } from "@shared/types";
import { moneyApi } from "@/features/caregiver/lib/api/caregiver";
import { keys } from "@/features/caregiver/lib/api/keys";

const WALLETS = ["JazzCash", "Easypaisa", "SadaPay", "NayaPay"];
const BANKS = [
  "Meezan Bank",
  "HBL",
  "UBL",
  "MCB Bank",
  "Allied Bank",
  "Bank Alfalah",
  "Bank Al Habib",
  "Faysal Bank",
  "Askari Bank",
  "Standard Chartered",
  "National Bank of Pakistan",
  "Bank of Punjab",
];

/** PK IBAN: PK + 2 check digits + 4-letter bank code + 16 digits (24 chars). */
const IBAN = /^PK\d{2}[A-Z]{4}\d{16}$/;

type NumberError = { kind: "phone"; code: PhoneErrorCode } | { kind: "iban" } | { kind: "account" };

function validateNumber(type: PayoutAccountType, raw: string): { value: string } | { error: NumberError } {
  const v = raw.replace(/\s/g, "").toUpperCase();
  if (type === "MOBILE_WALLET") {
    const phone = parsePkMobile(v);
    if (!phone.ok) return { error: { kind: "phone", code: phone.code } };
    return { value: `0${phone.e164.slice(3)}` };
  }
  if (v.startsWith("PK")) {
    return IBAN.test(v) ? { value: v } : { error: { kind: "iban" } };
  }
  return /^\d{8,20}$/.test(v) ? { value: v } : { error: { kind: "account" } };
}

export function PayoutAccountForm({ account, onClose }: { account: PayoutAccount | null; onClose: () => void }) {
  const t = useTranslations("caregiverB.payoutForm");
  const ts = useTranslations("shared");
  const tc = useTranslations("common.actions");
  const L = useLabels();
  const [type, setType] = useState<PayoutAccountType>(account?.type ?? "MOBILE_WALLET");
  const [provider, setProvider] = useState(account?.provider ?? "");
  const [title, setTitle] = useState(account?.accountTitle ?? "");
  const [number, setNumber] = useState("");
  const [touched, setTouched] = useState(false);

  const providers = type === "MOBILE_WALLET" ? WALLETS : BANKS;
  const checked = number ? validateNumber(type, number) : null;
  const numberErr = touched && checked && "error" in checked ? checked.error : null;
  const numberError = !numberErr
    ? null
    : numberErr.kind === "phone"
      ? ts(`phone.${numberErr.code}`)
      : numberErr.kind === "iban"
        ? t("ibanError")
        : t("accountError");
  // Editing: number may be left blank to keep the existing one.
  const numberOk = account ? !number || (checked !== null && "value" in checked) : checked !== null && "value" in checked;
  const valid = provider.length >= 2 && title.trim().length >= 2 && numberOk;

  const save = useAction(
    () => {
      const accountNumber = checked && "value" in checked ? checked.value : undefined;
      if (account) {
        return moneyApi.updateAccount(account.id, { type, provider, accountTitle: title.trim(), ...(accountNumber ? { accountNumber } : {}) });
      }
      return moneyApi.createAccount({ type, provider, accountTitle: title.trim(), accountNumber: accountNumber! });
    },
    { invalidate: [keys.accounts], success: account ? t("updated") : t("added"), onSuccess: onClose },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={account ? t("editTitle") : t("addTitle")}
      description={t("description")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={!valid}
            loading={save.isPending}
            onClick={() => {
              setTouched(true);
              if (valid) save.mutate(undefined);
            }}
          >
            {account ? tc("save") : t("addAccount")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-50 p-1" role="radiogroup" aria-label={t("accountType")}>
          {(
            ["MOBILE_WALLET", "BANK"] as const
          ).map((value) => (
            <button
              key={value}
              role="radio"
              aria-checked={type === value}
              onClick={() => {
                setType(value);
                setProvider("");
                setNumber("");
              }}
              className={`rounded-lg py-2 text-sm font-semibold transition-colors ${type === value ? "bg-white text-ink-900 shadow-card" : "text-ink-500"}`}
            >
              {L.payoutAccount(value)}
            </button>
          ))}
        </div>
        <Field label={type === "MOBILE_WALLET" ? t("wallet") : t("bank")} required>
          {(id) => (
            <Select
              inputId={id}
              isSearchable={type === "BANK"}
              placeholder={type === "MOBILE_WALLET" ? t("chooseWallet") : t("searchBank")}
              value={provider || null}
              onChange={(v) => setProvider(v ?? "")}
              options={providers.map((p) => ({ value: p, label: p }))}
            />
          )}
        </Field>
        <Field label={t("accountTitle")} required>
          {(id) => <Input id={id} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t("asOnCnic")} />}
        </Field>
        <Field
          label={type === "MOBILE_WALLET" ? t("walletNumber") : t("ibanOrAccount")}
          required={!account}
          error={numberError}
          hint={account ? t("currentHint", { number: account.accountNumber }) : undefined}
        >
          {(id) => (
            <Input
              id={id}
              inputMode={type === "MOBILE_WALLET" ? "tel" : "text"}
              dir="ltr"
              value={number}
              maxLength={40}
              className="tabular uppercase"
              placeholder={type === "MOBILE_WALLET" ? "0300 1234567" : "PK36MEZN0002010104274471"}
              onBlur={() => setTouched(true)}
              onChange={(e) => setNumber(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}
