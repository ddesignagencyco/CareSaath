"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  type SortingState,
  type Table as RTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronsUpDown, ChevronUp, Search } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "./cn";
import { Input } from "./field";
import { Pagination, TableSkeleton } from "./misc";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Extra classes applied to this column's <th> and <td> (e.g. responsive hiding). */
    className?: string;
  }
}

/**
 * Reusable data table (shadcn + @tanstack/react-table): global search, sortable
 * columns, pagination, and a `toolbar` slot for per-page filters (which drive
 * column filters). One component for every list page in the app.
 */
export function DataTable<T>({
  columns,
  data,
  searchPlaceholder,
  emptyText,
  toolbar,
  onRowClick,
  pageSize = 10,
  loading,
  serverPagination,
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  searchPlaceholder?: string;
  emptyText?: string;
  /** Filter controls (dropdowns etc.) that set column filters via the table. */
  toolbar?: (table: RTable<T>) => ReactNode;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  loading?: boolean;
  /** Server-side pagination: `data` is just the current page; the backend supplies page/limit/total. */
  serverPagination?: { page: number; limit: number; total: number; onPageChange: (page: number) => void };
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      columnFilters,
      ...(serverPagination ? { pagination: { pageIndex: serverPagination.page - 1, pageSize: serverPagination.limit } } : {}),
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    manualPagination: !!serverPagination,
    pageCount: serverPagination ? Math.max(1, Math.ceil(serverPagination.total / serverPagination.limit)) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(serverPagination ? {} : { getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize } } }),
  });

  const rows = table.getRowModel().rows;
  const serverMode = !!serverPagination;
  const curPage = serverMode ? serverPagination.page : table.getState().pagination.pageIndex + 1;
  const limit = serverMode ? serverPagination.limit : table.getState().pagination.pageSize;
  const total = serverMode ? serverPagination.total : table.getFilteredRowModel().rows.length;
  const totalPages = serverMode ? Math.max(1, Math.ceil(total / limit)) : table.getPageCount();
  const onPage = (p: number) => (serverMode ? serverPagination.onPageChange(p) : table.setPageIndex(p - 1));

  if (loading) return <TableSkeleton rows={pageSize} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {searchPlaceholder !== undefined && (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-ink-400" />
            <Input value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} className="ps-9" />
          </div>
        )}
        {toolbar?.(table)}
      </div>

      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
        <div className="overflow-x-auto">
        <table className="w-full text-start text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort();
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      onClick={sortable ? h.column.getToggleSortingHandler() : undefined}
                      className={cn(
                        "border-b border-ink-100 bg-ink-25 px-5 py-3 text-start text-xs font-bold tracking-wide whitespace-nowrap text-ink-500 uppercase",
                        sortable && "cursor-pointer select-none hover:text-ink-700",
                        (h.column.columnDef.meta as { className?: string } | undefined)?.className,
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sortable && (sorted === "asc" ? <ChevronUp className="size-3.5" /> : sorted === "desc" ? <ChevronDown className="size-3.5" /> : <ChevronsUpDown className="size-3.5 opacity-40" />)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-sm text-ink-500">
                  {emptyText ?? "No results"}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn("border-b border-ink-100 last:border-0", onRowClick && "cursor-pointer transition-colors hover:bg-brand-50/40")}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("px-5 py-3.5 align-middle", (cell.column.columnDef.meta as { className?: string } | undefined)?.className)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        {totalPages > 1 && <Pagination page={curPage} limit={limit} total={total} onPage={onPage} />}
      </div>
    </div>
  );
}
