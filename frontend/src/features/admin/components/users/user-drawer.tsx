"use client";

import { useQuery } from "@tanstack/react-query";
import { Ban, CalendarDays, KeyRound, Mail, Phone, Power, RotateCcw, ShieldAlert, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ReasonDialog } from "@shared/reason-dialog";
import { UserStatusBadge } from "@shared/status";
import { Badge, type Tone } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Drawer } from "@shared/ui/overlay";
import { ErrorState, Skeleton } from "@shared/ui/misc";
import { usersApi } from "@/features/admin/lib/api/admin";
import { keys, useAction } from "@/features/admin/lib/api/hooks";
import { useFmt } from "@shared/i18n/use-fmt";
import { useLabels } from "@shared/i18n/use-labels";
import type { AdminUser } from "@shared/types";

const ROLE_TONE: Record<string, Tone> = {
  CUSTOMER: "neutral",
  CAREGIVER: "info",
  ADMIN: "warning",
};

export function UserDrawer({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const t = useTranslations("adminB.customers");
  const tl = useTranslations("labels");
  const f = useFmt();
  const L = useLabels();
  const [suspending, setSuspending] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const detail = useQuery({
    queryKey: [...keys.users, "detail", user.id],
    queryFn: () => usersApi.get(user.id),
  });
  const u = detail.data ?? user;
  const isActive = u.status === "ACTIVE";

  const suspend = useAction((reason: string) => usersApi.suspend(user.id, reason || undefined), {
    invalidate: [keys.users],
    success: `Account suspended for ${user.fullName}`,
    onSuccess: () => setSuspending(false),
  });

  const deactivate = useAction((reason: string) => usersApi.deactivate(user.id, reason || undefined), {
    invalidate: [keys.users],
    success: t("toast.deactivated", { name: user.fullName }),
    onSuccess: () => setDeactivating(false),
  });

  const reactivate = useAction(() => usersApi.reactivate(user.id), {
    invalidate: [keys.users],
    success: t("toast.reactivated", { name: user.fullName }),
  });

  const revoke = useAction(() => usersApi.revokeSessions(user.id), {
    invalidate: [keys.users],
    success: `Active sessions revoked for ${user.fullName}`,
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title={user.fullName}
      subtitle={
        <div className="flex items-center gap-2">
          <Badge tone={ROLE_TONE[user.role] ?? "neutral"}>{tl(`role.${user.role}`)}</Badge>
          <UserStatusBadge status={u.status} />
        </div>
      }
      footer={
        <div className="space-y-2">
          {isActive ? (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setSuspending(true)}>
                <Ban className="size-4 text-warning-600" /> Suspend
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => setDeactivating(true)}>
                <Power className="size-4" /> Deactivate
              </Button>
            </div>
          ) : (
            <Button variant="success" className="w-full" loading={reactivate.isPending} onClick={() => reactivate.mutate(undefined)}>
              <RotateCcw className="size-4" /> Reactivate Account
            </Button>
          )}
          <Button
            variant="secondary"
            className="w-full"
            loading={revoke.isPending}
            onClick={() => revoke.mutate(undefined)}
          >
            <KeyRound className="size-4 text-brand-600" /> Force Logout / Revoke Sessions
          </Button>
        </div>
      }
    >
      <dl className="space-y-3 text-sm">
        <div className="flex items-center gap-2.5 text-ink-700">
          <Phone className="size-4 text-ink-400" />
          <dd dir="ltr" className="tabular">{u.phone}</dd>
        </div>
        <div className="flex items-center gap-2.5 text-ink-700">
          <Mail className="size-4 text-ink-400" />
          <dd dir="ltr">{u.email || <span className="text-ink-400">{t("noEmail")}</span>}</dd>
        </div>
        <div className="flex items-center gap-2.5 text-ink-700">
          <CalendarDays className="size-4 text-ink-400" />
          <dd>{t("joinedOn", { date: f.date(u.createdAt) })}</dd>
        </div>
        <div className="text-xs text-ink-500">
          {u.lastLoginAt ? t("lastLogin", { when: f.relativeTime(u.lastLoginAt) }) : t("neverLoggedIn")}
        </div>
      </dl>

      {detail.data?.recentBookings && detail.data.recentBookings.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-bold tracking-wide text-ink-500 uppercase">
            {t("bookingsCount", { count: detail.data.bookingsTotal })}
          </p>
          <ul className="space-y-2">
            {detail.data.recentBookings.map((b) => (
              <li key={b.id} className="rounded-lg border border-ink-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink-800">{L.specialty(b.serviceType)}</span>
                  <Badge tone={b.status === "COMPLETED" ? "success" : b.status === "CANCELLED" || b.status === "DECLINED" ? "danger" : "info"} dot>
                    {L.bookingCaregiver(b.status)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">
                  {f.date(b.startDate)} · {b.caregiver.user.fullName}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ReasonDialog
        open={suspending}
        onClose={() => setSuspending(false)}
        title={`Suspend ${user.fullName}'s Account`}
        description="Suspended accounts are immediately blocked from logging in or making requests. You can reactivate anytime."
        placeholder="Reason for suspension (optional)..."
        confirmLabel="Suspend Account"
        confirmVariant="danger"
        loading={suspend.isPending}
        onConfirm={(reason) => suspend.mutate(reason)}
      />

      <ReasonDialog
        open={deactivating}
        onClose={() => setDeactivating(false)}
        title={t("deactivateTitle", { name: user.fullName })}
        description={t("deactivateDesc")}
        placeholder={t("deactivatePlaceholder")}
        confirmLabel={t("actions.deactivate")}
        confirmVariant="danger"
        loading={deactivate.isPending}
        onConfirm={(reason) => deactivate.mutate(reason)}
      />
    </Drawer>
  );
}
