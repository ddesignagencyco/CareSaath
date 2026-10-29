"use client";

import { BadgeCheck, Ban, CalendarClock, CheckCircle2, Power, RotateCcw, Star, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ReasonDialog } from "@shared/reason-dialog";
import { UserStatusBadge, VerificationBadge } from "@shared/status";
import { Button } from "@shared/ui/button";
import { Field, Input } from "@shared/ui/field";
import { Avatar, DetailList } from "@shared/ui/misc";
import { Drawer } from "@shared/ui/overlay";
import { Select } from "@shared/ui/select";
import { TierBadge } from "@shared/ui/tier-badge";
import { CAN_DEACTIVATE_CAREGIVER, CAN_MANAGE_STRIKES, CAN_OVERRIDE_BADGE, caregiversApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import { daysUntil } from "@shared/lib/format";
import type { AdminCaregiver, AdminCaregiverRecord, CaregiverBadge, StrikeReason, UserStatus } from "@shared/types";
import { DocumentList } from "./document-viewer";

type ActionKind = "approve" | "reject" | "suspend" | "reverify" | "deactivate" | "reactivate";

/** Ciphertext from field-encryption ("iv:tag:data", base64) the API failed to decrypt. */
const looksEncrypted = (value: string) => {
  const parts = value.split(":");
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/=]+$/.test(p));
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold text-ink-900">{title}</h3>
      {children}
    </section>
  );
}

export function CaregiverDrawer({
  caregiver,
  onClose,
  onChange,
}: {
  caregiver: AdminCaregiver;
  onClose: () => void;
  onChange: (next: AdminCaregiver) => void;
}) {
  const t = useTranslations("adminA.drawer");
  const f = useFmt();
  const L = useLabels();
  const [action, setAction] = useState<ActionKind | null>(null);
  const [reverifyDays, setReverifyDays] = useState("365");
  const [strikeReason, setStrikeReason] = useState<StrikeReason>("LATE_ARRIVAL");
  const name = caregiver.user.fullName || t("unnamed");

  // Action responses omit `user` and carry the CNIC still encrypted, so keep
  // the ones we have (from the list route) and patch the user status.
  const merge = (userStatus?: UserStatus) => (result: AdminCaregiverRecord) => {
    onChange({
      ...caregiver,
      ...result,
      cnic: caregiver.cnic,
      user: { ...caregiver.user, ...(userStatus ? { status: userStatus } : {}) },
    });
    setAction(null);
  };
  const opts = (success: string, userStatus?: UserStatus) => ({
    invalidate: [keys.caregivers, keys.analytics],
    success,
    onSuccess: merge(userStatus),
  });

  const approve = useAction((r: string) => caregiversApi.approve(caregiver.id, r || undefined), opts(t("toast.approved", { name })));
  const reject = useAction((r: string) => caregiversApi.reject(caregiver.id, r), opts(t("toast.rejected", { name })));
  const suspend = useAction((r: string) => caregiversApi.suspend(caregiver.id, r), opts(t("toast.suspended", { name })));
  const reverify = useAction(() => caregiversApi.reverify(caregiver.id, Number(reverifyDays) || 365), opts(t("toast.reverify", { name })));
  const deactivate = useAction((r: string) => caregiversApi.deactivate(caregiver.id, r), opts(t("toast.deactivated", { name }), "DEACTIVATED"));
  const status = caregiver.verificationStatus;
  const auditReason = t("dialogs.reactivate.auditReason");
  // POST /reactivate only re-activates the user account; it leaves a SUSPENDED
  // verification status as is. Until the API lifts suspensions, follow it with
  // an approve (allowed for SUSPENDED profiles that have documents).
  const reactivate = useAction(async () => {
    const result = await caregiversApi.reactivate(caregiver.id);
    if (result.verificationStatus !== "SUSPENDED") return result;
    return caregiversApi.approve(caregiver.id, auditReason);
  }, opts(t("toast.reactivated", { name }), "ACTIVE"));
  const setBadge = useAction((badge: CaregiverBadge | null) => caregiversApi.setBadge(caregiver.id, badge), opts(t("toast.badge", { name })));
  const strikeAction = useAction(
    (body: { op: "reset" } | { op: "add"; reason: StrikeReason; note?: string }) => caregiversApi.setStrikes(caregiver.id, body),
    opts(t("toast.strikes", { name })),
  );

  const deactivated = caregiver.user.status === "DEACTIVATED";
  const due = caregiver.reverifyDueAt ? daysUntil(caregiver.reverifyDueAt) : null;

  const footer = (
    <>
      {(status === "PENDING" || status === "REJECTED") && (
        <>
          {status === "PENDING" && (
            <Button variant="secondary" onClick={() => setAction("reject")}>
              <XCircle className="size-4 text-danger-600" /> {t("actions.reject")}
            </Button>
          )}
          <Button variant="success" onClick={() => setAction("approve")} disabled={caregiver.documents.length === 0}>
            <CheckCircle2 className="size-4" /> {t("actions.approve")}
          </Button>
        </>
      )}
      {status === "APPROVED" && (
        <>
          <Button variant="secondary" onClick={() => setAction("reverify")}>
            <CalendarClock className="size-4" /> {t("actions.requestReverify")}
          </Button>
          <Button variant="secondary" onClick={() => setAction("suspend")}>
            <Ban className="size-4 text-warning-600" /> {t("actions.suspend")}
          </Button>
        </>
      )}
      {(status === "SUSPENDED" || deactivated) && (
        <Button variant="primary" onClick={() => setAction("reactivate")}>
          <RotateCcw className="size-4" /> {t("actions.reactivate")}
        </Button>
      )}
      {CAN_DEACTIVATE_CAREGIVER && !deactivated && status !== "PENDING" && (
        <Button variant="ghost" className="text-danger-600 hover:bg-danger-50 hover:text-danger-700" onClick={() => setAction("deactivate")}>
          <Power className="size-4" /> {t("actions.deactivate")}
        </Button>
      )}
    </>
  );

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={name} />
            <span className="min-w-0">
              <span className="block truncate">{name}</span>
              <span className="tabular block text-sm font-medium text-ink-500">{f.phone(caregiver.user.phone)}</span>
            </span>
          </span>
        }
        footer={footer}
      >
        <div className="space-y-7">
          <div className="flex flex-wrap gap-2">
            <VerificationBadge status={status} />
            {caregiver.user.status !== "ACTIVE" && <UserStatusBadge status={caregiver.user.status} />}
            {caregiver.ratingCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700">
                <Star className="size-3 fill-current" /> {t("reviews", { rating: Number(caregiver.ratingAverage).toFixed(2), count: caregiver.ratingCount })}
              </span>
            )}
          </div>

          <Section title={t("sections.tier")}>
            <div className="flex flex-wrap items-center gap-2">
              {caregiver.badge ? <TierBadge badge={caregiver.badge} /> : <span className="text-sm text-ink-500">{t("tier.none")}</span>}
              <span className="text-xs text-ink-500">{caregiver.badgeOverride ? t("tier.overridden") : t("tier.auto")}</span>
            </div>
            {CAN_OVERRIDE_BADGE ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-700">{t("tier.overrideLabel")}</label>
                <Select<string>
                  className="w-full"
                  isSearchable={false}
                  value={caregiver.badgeOverride ?? ""}
                  onChange={(v) => setBadge.mutate(v ? (v as CaregiverBadge) : null)}
                  options={[
                    { value: "", label: t("tier.optAuto") },
                    { value: "BRONZE", label: L.caregiverBadge("BRONZE") },
                    { value: "SILVER", label: L.caregiverBadge("SILVER") },
                    { value: "GOLD", label: L.caregiverBadge("GOLD") },
                    { value: "PLATINUM", label: L.caregiverBadge("PLATINUM") },
                  ]}
                />
                <p className="text-xs text-ink-500">{t("tier.overrideHint")}</p>
              </div>
            ) : (
              <p className="text-xs text-ink-500">{t("tier.overridePending")}</p>
            )}
          </Section>

          {CAN_MANAGE_STRIKES && (
            <Section title={t("sections.strikes")}>
              <p className="text-sm text-ink-600">{t("strikes.current", { count: caregiver.strikeCount ?? 0 })}</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="text-xs font-semibold text-ink-700">{t("strikes.addReason")}</label>
                  <Select<StrikeReason>
                    className="w-full"
                    isSearchable={false}
                    value={strikeReason}
                    onChange={(v) => v && setStrikeReason(v)}
                    options={[
                      { value: "DECLINED", label: t("strikes.reason.DECLINED") },
                      { value: "LATE_ARRIVAL", label: t("strikes.reason.LATE_ARRIVAL") },
                      { value: "NO_SHOW", label: t("strikes.reason.NO_SHOW") },
                    ]}
                  />
                </div>
                <Button variant="secondary" loading={strikeAction.isPending} onClick={() => strikeAction.mutate({ op: "add", reason: strikeReason })}>
                  {t("strikes.add")}
                </Button>
                <Button
                  variant="ghost"
                  className="text-danger-600 hover:bg-danger-50"
                  loading={strikeAction.isPending}
                  disabled={!caregiver.strikeCount}
                  onClick={() => strikeAction.mutate({ op: "reset" })}
                >
                  {t("strikes.reset")}
                </Button>
              </div>
            </Section>
          )}

          <Section title={t("sections.credentials")}>
            <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
              <DetailList
                items={[
                  { label: t("fields.licenseNumber"), value: <span className="tabular font-semibold" dir="ltr">{caregiver.licenseNumber}</span> },
                  { label: t("fields.licensingBody"), value: L.licenseBody(caregiver.licenseBody) },
                  {
                    label: t("fields.cnic"),
                    value: looksEncrypted(caregiver.cnic) ? (
                      <span className="text-ink-500">{t("fields.cnicUnavailable")}</span>
                    ) : (
                      <span className="tabular font-semibold" dir="ltr">{caregiver.cnic}</span>
                    ),
                  },
                  { label: t("fields.specialty"), value: L.specialty(caregiver.specialty) },
                ]}
              />
            </div>
            <p className="text-xs text-ink-500">
              {t("verifyHint", { body: caregiver.licenseBody })}
            </p>
          </Section>

          <Section title={t("sections.documents")}>
            <DocumentList documents={caregiver.documents} pending={status === "PENDING"} />
          </Section>

          <Section title={t("sections.profile")}>
            <DetailList
              items={[
                { label: t("fields.experience"), value: caregiver.experienceYears !== null ? t("fields.experienceYears", { count: caregiver.experienceYears }) : "—" },
                { label: t("fields.rate"), value: <span className="tabular">{f.money(caregiver.ratePerVisit)}</span> },
                ...(caregiver.minRatePerVisit != null && caregiver.maxRatePerVisit != null
                  ? [{ label: t("fields.bracket"), value: <span className="tabular">{`${f.money(caregiver.minRatePerVisit)} – ${f.money(caregiver.maxRatePerVisit)}`}</span> }]
                  : []),
                ...(caregiver.strikeCount ? [{ label: t("fields.strikes"), value: <span className="font-semibold text-danger-600">{caregiver.strikeCount}</span> }] : []),
                { label: t("fields.serviceArea"), value: f.list(caregiver.serviceArea.cities) || "—" },
                { label: t("fields.registered"), value: f.date(caregiver.createdAt) },
                { label: t("fields.approved"), value: f.date(caregiver.approvedAt) },
                {
                  label: t("fields.reverifyDue"),
                  value: caregiver.reverifyDueAt ? (
                    <span className={due !== null && due < 0 ? "font-semibold text-danger-600" : undefined}>
                      {f.date(caregiver.reverifyDueAt)}
                      {due !== null && due < 0 && t("fields.overdue", { days: -due })}
                    </span>
                  ) : (
                    "—"
                  ),
                },
              ]}
            />
            {caregiver.bio && <p dir="auto" className="rounded-xl bg-ink-50 p-4 text-sm leading-relaxed text-ink-700">{caregiver.bio}</p>}
          </Section>
        </div>
      </Drawer>

      <ReasonDialog
        open={action === "approve"}
        onClose={() => setAction(null)}
        title={t("dialogs.approve.title", { name })}
        description={t("dialogs.approve.description")}
        label={t("dialogs.approve.label")}
        placeholder={t("dialogs.approve.placeholder")}
        confirmLabel={t("dialogs.approve.confirm")}
        confirmVariant="success"
        loading={approve.isPending}
        onConfirm={(r) => approve.mutate(r)}
      >
        <p className="flex items-start gap-2 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700">
          <BadgeCheck className="mt-0.5 size-4 shrink-0" />
          {t("dialogs.approve.checked", { license: caregiver.licenseNumber, body: L.licenseBodyShort(caregiver.licenseBody) })}
        </p>
      </ReasonDialog>
      <ReasonDialog
        open={action === "reject"}
        onClose={() => setAction(null)}
        title={t("dialogs.reject.title", { name })}
        description={t("dialogs.reject.description")}
        required
        placeholder={t("dialogs.reject.placeholder")}
        confirmLabel={t("dialogs.reject.confirm")}
        confirmVariant="danger"
        loading={reject.isPending}
        onConfirm={(r) => reject.mutate(r)}
      />
      <ReasonDialog
        open={action === "suspend"}
        onClose={() => setAction(null)}
        title={t("dialogs.suspend.title", { name })}
        description={t("dialogs.suspend.description")}
        required
        placeholder={t("dialogs.suspend.placeholder")}
        confirmLabel={t("dialogs.suspend.confirm")}
        confirmVariant="danger"
        loading={suspend.isPending}
        onConfirm={(r) => suspend.mutate(r)}
      />
      <ReasonDialog
        open={CAN_DEACTIVATE_CAREGIVER && action === "deactivate"}
        onClose={() => setAction(null)}
        title={t("dialogs.deactivate.title", { name })}
        description={t("dialogs.deactivate.description")}
        required
        confirmLabel={t("dialogs.deactivate.confirm")}
        confirmVariant="danger"
        loading={deactivate.isPending}
        onConfirm={(r) => deactivate.mutate(r)}
      />
      {action === "reverify" && (
        <ReasonDialog
          open
          onClose={() => setAction(null)}
          title={t("dialogs.reverify.title")}
          description={t("dialogs.reverify.description")}
          withReason={false}
          confirmLabel={t("dialogs.reverify.confirm")}
          loading={reverify.isPending}
          onConfirm={() => reverify.mutate("")}
        >
          <Field label={t("dialogs.reverify.daysLabel")} hint={t("dialogs.reverify.daysHint")}>
            {(id) => (
              <Input id={id} type="number" dir="ltr" min={1} value={reverifyDays} onChange={(e) => setReverifyDays(e.target.value)} />
            )}
          </Field>
        </ReasonDialog>
      )}
      {action === "reactivate" && (
        <ReasonDialog
          open
          onClose={() => setAction(null)}
          title={t("dialogs.reactivate.title", { name })}
          description={t("dialogs.reactivate.description")}
          withReason={false}
          confirmLabel={t("dialogs.reactivate.confirm")}
          loading={reactivate.isPending}
          onConfirm={() => reactivate.mutate(undefined)}
        >
          {status === "SUSPENDED" && (
            <p className="rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700">{t("dialogs.reactivate.suspendedNote")}</p>
          )}
        </ReasonDialog>
      )}
    </>
  );
}
