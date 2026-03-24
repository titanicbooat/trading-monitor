"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";

export interface Position {
  ticket: number;
  symbol: string;
  type: number;
  volume: number;
  price_open: number;
  price_current: number;
  sl: number;
  tp: number;
  profit: number;
  time: string;
}

const col = createColumnHelper<Position>();

const columns = [
  col.accessor("ticket", { header: "Ticket", size: 100 }),
  col.accessor("symbol", { header: "Symbol", size: 80 }),
  col.accessor("type", {
    header: "Type",
    size: 60,
    cell: (info) => (
      <span className={info.getValue() === 0 ? "text-emerald-400" : "text-red-400"}>
        {info.getValue() === 0 ? "BUY" : "SELL"}
      </span>
    ),
  }),
  col.accessor("volume", {
    header: "Lots",
    size: 60,
    cell: (info) => info.getValue().toFixed(2),
  }),
  col.accessor("price_open", {
    header: "Open",
    size: 80,
    cell: (info) => info.getValue().toFixed(5),
  }),
  col.accessor("price_current", {
    header: "Current",
    size: 80,
    cell: (info) => info.getValue().toFixed(5),
  }),
  col.accessor("sl", {
    header: "SL",
    size: 80,
    cell: (info) => (info.getValue() ? info.getValue().toFixed(5) : "—"),
  }),
  col.accessor("tp", {
    header: "TP",
    size: 80,
    cell: (info) => (info.getValue() ? info.getValue().toFixed(5) : "—"),
  }),
  col.accessor("profit", {
    header: "Profit",
    size: 80,
    cell: (info) => {
      const v = info.getValue();
      return (
        <span className={v >= 0 ? "text-emerald-400" : "text-red-400"}>
          {v >= 0 ? "+" : ""}
          {v.toFixed(2)}
        </span>
      );
    },
  }),
];

export function PositionsTable({ data }: { data: Position[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-400">
          Open Positions ({data.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-gray-800">
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="px-4 py-2.5 text-left text-xs text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 select-none"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{ asc: " ↑", desc: " ↓" }[
                      h.column.getIsSorted() as string
                    ] ?? ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No open positions
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
