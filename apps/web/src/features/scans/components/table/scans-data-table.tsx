import React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
}

export function ScansDataTable<TData>({
  columns,
  data,
}: DataTableProps<TData>) {
  const safeColumns = React.useMemo(() => columns ?? [], [columns]);
  const safeData = React.useMemo(() => data ?? [], [data]);

  const table = useReactTable({
    data: safeData,
    columns: safeColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const headerGroups = table.getHeaderGroups();
  const { rows } = table.getRowModel();

  return (
    <div className="card">
      <div className="relative w-full overflow-x-auto rounded-md">
        <table className="min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[hsl(var(--def-300))">
            {headerGroups.map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => {
                  const size = header.column.getSize();

                  return (
                    <th
                      key={header.id}
                      className="h-12 px-4 text-left font-semibold text-muted-foreground"
                      style={{ width: size, minWidth: size }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border last:border-0 transition-colors hover:bg-muted/50"
              >
                {row.getVisibleCells().map((cell) => {
                  const size = cell.column.getSize();

                  return (
                    <td
                      key={cell.id}
                      className="h-12 px-4 align-middle"
                      style={{ width: size, minWidth: size }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
