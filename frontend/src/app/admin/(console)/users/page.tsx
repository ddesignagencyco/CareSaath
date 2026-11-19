"use client";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@shared/page-header";
import { UserStatusBadge } from "@shared/status";
import { Badge, type Tone } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card } from "@shared/ui/card";
import { DataTable } from "@shared/ui/data-table";
import { Input } from "@shared/ui/field";
import { ErrorState } from "@shared/ui/misc";
import { Select } from "@shared/ui/select";
import { UserAvatar } from "@shared/ui/user-avatar";
import { UserDrawer } from "@/features/admin/components/users/user-drawer";
import { usersApi } from "@/features/admin/lib/api/admin";
import { keys } from "@/features/admin/lib/api/hooks";
import { useDebouncedValue } from "@shared/hooks/use-debounced-value";
import { useFmt } from "@shared/i18n/use-fmt";
import type { AdminUser, UserRole, UserStatus } from "@shared/types";

const LIMIT = 15;

const ROLE_TONE: Record<string, Tone> = {
  CUSTOMER: "neutral",
  CAREGIVER: "info",
  ADMIN: "warning",
};

const ROLE_OPTIONS: { value: UserRole | "ALL"; label: string }[] = [
  { value: "ALL", label: "All roles" },
  { value: "CUSTOMER", label: "Customers" },
  { value: "CAREGIVER", label: "Caregivers" },
  { value: "ADMIN", label: "Admins" },
];

const STATUS_OPTIONS: { value: UserStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "DEACTIVATED", label: "Deactivated" },
];

export default function UsersPage() {
  const t = useTranslations("adminB.customers");
  const tl = useTranslations("labels");
  const f = useFmt();
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams?.get("id") ?? searchParams?.get("userId") ?? "";
  const qParam = searchParams?.get("q") ?? "";

  const [role, setRole] = useState<UserRole | "ALL">("ALL");
  const [status, setStatus] = useState<UserStatus | "ALL">("ALL");
  const [qInput, setQInput] = useState(qParam);
  const q = useDebouncedValue(qInput.trim());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminUser | null>(null);

  // Sync qInput when URL query changes
  useEffect(() => {
    setQInput(searchParams?.get("q") ?? "");
  }, [searchParams]);

  const list = useQuery({
    queryKey: [...keys.users, "list", role, status, q, page, idParam],
    queryFn: () =>
      usersApi.list({
        page,
        limit: LIMIT,
        ...(role !== "ALL" ? { role } : {}),
        ...(status !== "ALL" ? { status } : {}),
        ...(idParam ? { id: idParam } : {}),
        ...(q ? { q } : {}),
      }),
  });

  useEffect(() => {
    if (idParam && list.data?.items?.length) {
      const match = list.data.items.find((u) => u.id === idParam);
      if (match) {
        setSelected(match);
      }
    }
  }, [idParam, list.data?.items]);

  const clearIdFilter = () => {
    router.replace("/admin/users");
  };

  const columns: ColumnDef<AdminUser, unknown>[] = [
    {
      id: "user",
      header: "User",
      accessorFn: (u) => u.fullName,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <UserAvatar userId={row.original.id} name={row.original.fullName} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{row.original.fullName || "Unnamed User"}</p>
            <p className="font-mono text-xs text-ink-400 truncate max-w-[140px]">{row.original.id}</p>
          </div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      accessorFn: (u) => u.role,
      cell: ({ row }) => (
        <Badge tone={ROLE_TONE[row.original.role] ?? "neutral"}>
          {tl(`role.${row.original.role}`)}
        </Badge>
      ),
    },
    {
      id: "contact",
      header: t("columns.contact"),
      meta: { className: "hidden sm:table-cell" },
      cell: ({ row }) => (
        <div className="text-sm">
          <p dir="ltr" className="tabular text-ink-700 font-medium">{row.original.phone}</p>
          {row.original.email && <p dir="ltr" className="truncate text-xs text-ink-500">{row.original.email}</p>}
        </div>
      ),
    },
    {
      id: "status",
      header: t("columns.status"),
      accessorFn: (u) => u.status,
      cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
    },
    {
      id: "lastSeen",
      header: "Last Seen",
      meta: { className: "hidden lg:table-cell" },
      accessorFn: (u) => u.lastLoginAt,
      cell: ({ row }) => (
        <span className="text-xs text-ink-500">
          {row.original.lastLoginAt ? f.relativeTime(row.original.lastLoginAt) : "Never"}
        </span>
      ),
    },
    {
      id: "joined",
      header: t("columns.joined"),
      meta: { className: "hidden md:table-cell" },
      accessorFn: (u) => u.createdAt,
      cell: ({ row }) => <span className="text-xs text-ink-600">{f.date(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            setSelected(row.original);
          }}
        >
          Manage
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="User Management"
        description="Search, view, suspend, reactivate, or revoke sessions for any user on the platform."
      />

      {list.isError ? (
        <Card>
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={list.data?.items ?? []}
          loading={!list.data}
          emptyText="No users match these criteria."
          onRowClick={(row) => setSelected(row)}
          serverPagination={
            list.data
              ? {
                  page: list.data.page,
                  limit: list.data.limit,
                  total: list.data.total,
                  onPageChange: setPage,
                }
              : undefined
          }
          toolbar={() => (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <Input
                  value={qInput}
                  onChange={(e) => {
                    setQInput(e.target.value);
                    setPage(1);
                    if (idParam) router.replace("/admin/users");
                  }}
                  placeholder="Search by name, phone or email…"
                />
              </div>
              <Select<UserRole | "ALL">
                className="w-44"
                value={role}
                isSearchable={false}
                onChange={(v) => {
                  if (v) {
                    setRole(v);
                    setPage(1);
                  }
                }}
                options={ROLE_OPTIONS}
              />
              <Select<UserStatus | "ALL">
                className="w-44"
                value={status}
                isSearchable={false}
                onChange={(v) => {
                  if (v) {
                    setStatus(v);
                    setPage(1);
                  }
                }}
                options={STATUS_OPTIONS}
              />
              {idParam && (
                <button
                  type="button"
                  onClick={clearIdFilter}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs font-semibold text-brand-800 transition-colors hover:bg-brand-100"
                  title="Clear ID filter and show all users"
                >
                  <span>Filtered user</span>
                  <X className="size-3.5 text-brand-600" />
                </button>
              )}
            </div>
          )}
        />
      )}

      {selected && (
        <UserDrawer
          user={selected}
          onClose={() => {
            setSelected(null);
            if (idParam) {
              router.replace("/admin/users");
            }
          }}
        />
      )}
    </>
  );
}
