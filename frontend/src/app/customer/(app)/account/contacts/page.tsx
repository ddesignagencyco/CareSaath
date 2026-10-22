"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Phone, Siren, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAction } from "@shared/api/use-action";
import { formatPkMobile, parsePkMobile } from "@shared/lib/phone";
import { PageHeader } from "@shared/page-header";
import { Button, IconButton } from "@shared/ui/button";
import { Card, CardBody, CardHeader } from "@shared/ui/card";
import { Field, Input } from "@shared/ui/field";
import { Avatar, ErrorState, Skeleton } from "@shared/ui/misc";
import { PhoneField } from "@shared/ui/phone-field";
import { contactsApi } from "@/features/customer/lib/api/customer";
import { keys } from "@/features/customer/lib/api/keys";

export default function ContactsPage() {
  const t = useTranslations("customerB.contacts");
  const ts = useTranslations("shared");
  const contacts = useQuery({ queryKey: keys.contacts, queryFn: contactsApi.list });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const parsed = parsePkMobile(phone);
  const phoneError = touched && phone && !parsed.ok ? ts(`phone.${parsed.code}`) : null;

  const add = useAction(() => contactsApi.add({ name: name.trim(), phone: parsed.ok ? parsed.e164 : phone }), {
    invalidate: [keys.contacts],
    success: t("added"),
    onSuccess: () => {
      setName("");
      setPhone("");
      setTouched(false);
    },
  });
  const remove = useAction((id: string) => contactsApi.remove(id), { invalidate: [keys.contacts], success: t("removed") });

  return (
    <>
      <Link href="/customer/account" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-900">
        <ArrowLeft className="rtl:-scale-x-100 size-4" /> {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("yours")} />
          <CardBody>
            {contacts.isError ? (
              <ErrorState error={contacts.error} onRetry={() => contacts.refetch()} />
            ) : !contacts.data ? (
              <Skeleton className="h-16" />
            ) : contacts.data.length === 0 ? (
              <p className="flex items-start gap-2 rounded-xl bg-warning-50 p-3 text-sm text-warning-700">
                <Siren className="mt-0.5 size-4 shrink-0" /> {t("empty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {contacts.data.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-xl border border-ink-100 p-3">
                    <Avatar name={c.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{c.name}</p>
                      <a href={`tel:${c.phone}`} className="tabular inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
                        <Phone className="size-3" /> {formatPkMobile(c.phone)}
                      </a>
                    </div>
                    <IconButton label={t("removeLabel", { name: c.name })} onClick={() => remove.mutate(c.id)} className="hover:text-danger-600">
                      <Trash2 className="size-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("addTitle")} />
          <CardBody>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setTouched(true);
                if (name.trim() && parsed.ok) add.mutate(undefined);
              }}
            >
              <Field label={t("nameLabel")} required>
                {(id) => <Input id={id} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />}
              </Field>
              <PhoneField id="contact-phone" value={phone} onChange={setPhone} onBlur={() => setTouched(true)} error={phoneError} />
              <Button type="submit" className="w-full" loading={add.isPending} disabled={!name.trim() || !parsed.ok}>
                <UserPlus className="size-4" /> {t("addSubmit")}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
