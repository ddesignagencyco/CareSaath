"use client";

import { Bell, ChevronRight, LogOut, MapPin, MessagesSquare, Phone, Scale, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { useLocaleControl } from "@shared/i18n/provider";
import { useFmt } from "@shared/i18n/use-fmt";
import { formatPkMobile } from "@shared/lib/phone";
import { PageHeader } from "@shared/page-header";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { Field, Input } from "@shared/ui/field";
import { Avatar, Skeleton } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import type { Me } from "@shared/caregiver-types";
import { NotificationPrefsCard } from "@shared/notifications/notification-prefs";
import { meApi, notificationsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";
import { useMe, useSignOut } from "@/features/customer/lib/auth";

/** Phones only: on desktop these pages are in the sidebar. */
const MOBILE_LINKS = [
  { href: "/customer/messages", key: "messages", icon: MessagesSquare },
  { href: "/customer/account/patients", key: "patients", icon: Users },
  { href: "/customer/account/addresses", key: "addresses", icon: MapPin },
  { href: "/customer/account/disputes", key: "disputes", icon: Scale },
  { href: "/customer/account/payments", key: "payments", icon: Wallet },
  { href: "/customer/notifications", key: "notifications", icon: Bell },
] as const;

function ProfileForm({ me }: { me: Me }) {
  const t = useTranslations("customerB.account");
  const tc = useTranslations("common");
  const { setLocale } = useLocaleControl();
  const [name, setName] = useState(me.fullName);
  const [email, setEmail] = useState(me.email ?? "");
  const [language, setLanguage] = useState<"EN" | "UR">(me.preferredLanguage);
  const emailValid = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const dirty = name.trim() !== me.fullName || email.trim() !== (me.email ?? "") || language !== me.preferredLanguage;
  const save = useAction(() => meApi.update({ fullName: name.trim(), email: email.trim() || undefined, preferredLanguage: language }), {
    invalidate: [keys.me],
    success: t("saved"),
    onSuccess: () => setLocale(language === "UR" ? "ur" : "en"),
  });

  return (
    <form
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && name.trim() && emailValid) save.mutate(undefined);
      }}
    >
      <Field label={t("fullName")} required>
        {(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />}
      </Field>
      <Field label={t("email")} hint={t("emailHint")} error={email.trim().length > 0 && !emailValid ? t("emailInvalid") : undefined}>
        {(id) => <Input id={id} type="email" value={email} maxLength={160} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} />}
      </Field>
      <Field label={tc("language.appLanguage")} hint={t("languageHint")}>
        {(id) => (
          <Select<"EN" | "UR">
            inputId={id}
            value={language}
            onChange={(v) => v && setLanguage(v)}
            options={[
              { value: "EN", label: tc("language.en") },
              { value: "UR", label: t("languageUr") },
            ]}
          />
        )}
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={!dirty || !name.trim() || !emailValid} loading={save.isPending}>
          {tc("actions.saveChanges")}
        </Button>
      </div>
    </form>
  );
}

export default function AccountPage() {
  const t = useTranslations("customerB.account");
  const tc = useTranslations("common");
  const f = useFmt();
  const me = useMe();
  const signOut = useSignOut();

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-5">
        <Card>
          <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-start">
            <div className="flex items-center gap-4 lg:w-72 lg:shrink-0 lg:flex-col lg:items-center lg:border-e lg:border-ink-100 lg:pe-6 lg:text-center">
              <Avatar name={me.data?.fullName || t("you")} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold text-ink-900">{me.data?.fullName || t("addName")}</p>
                <p className="tabular text-sm text-ink-500">{me.data ? formatPkMobile(me.data.phone) : " "}</p>
                {me.data && <p className="mt-1 text-xs text-ink-400">{t("memberSince", { date: f.date(me.data.createdAt) })}</p>}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              {me.data ? <ProfileForm key={`${me.data.fullName}-${me.data.preferredLanguage}`} me={me.data} /> : <Skeleton className="h-32" />}
            </div>
          </div>
        </Card>

        <Card className="divide-y divide-ink-100 overflow-hidden lg:hidden">
          {MOBILE_LINKS.map(({ href, key, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-5 py-4 text-sm font-semibold text-ink-800 hover:bg-ink-25">
              <Icon className="size-5 text-ink-400" />
              <span className="flex-1">{key === "notifications" ? tc("nav.notifications") : t(`links.${key}`)}</span>
              <ChevronRight className="rtl:-scale-x-100 size-4 text-ink-300" />
            </Link>
          ))}
        </Card>

        <NotificationPrefsCard api={{ prefs: notificationsApi.prefs, setPref: notificationsApi.setPref }} />

        <Card className="divide-y divide-ink-100 overflow-hidden">
          <button onClick={signOut} className="flex w-full items-center gap-3 px-5 py-4 text-start text-sm font-semibold text-danger-600 hover:bg-danger-50">
            <LogOut className="size-5" /> {tc("actions.signOut")}
          </button>
        </Card>
      </div>
    </>
  );
}
