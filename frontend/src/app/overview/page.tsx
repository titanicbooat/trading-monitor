"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getToken,
  clearToken,
  createWsUrl,
  fetchOverview,
} from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { StatCard } from "@/components/StatCard";
import { PositionsTable, type Position } from "@/components/PositionsTable";
import { PerformanceCard } from "@/components/PerformanceCard";
import { PageHeader } from "@/components/PageHeader";

interface CombinedStatus {
  balance: number;
  equity: number;
  floating_pl: number;
  drawdown_pct: number;
  margin: number;
  margin_free: number;
  positions_count: number;
  accounts_count: number;
}

interface AccountSummary {
  id: string;
  currency?: string;
  balance: number;
  equity: number;
  floating_pl: number;
  drawdown_pct: number;
  positions_count: number;
  total_trades: number;
  is_live?: boolean;
  mode?: string;
  platform?: string;
}

interface PerfData {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  profit_factor: number;
  net_profit: number;
  total_profit: number;
  total_loss: number;
  average_profit: number;
  average_loss: number;
  largest_win: number;
  largest_loss: number;
}

interface PositionWithAccount extends Position {
  account_id: string;
}

export default function OverviewPage() {
  const router = useRouter();
  const [combined, setCombined] = useState<CombinedStatus | null>(null);
  const [accountsList, setAccountsList] = useState<AccountSummary[]>([]);
  const [positions, setPositions] = useState<PositionWithAccount[]>([]);
  const [performance, setPerformance] = useState<PerfData | null>(null);
  const [lastUpdate, setLastUpdate] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    loadOverview();
  }, [router]);

  async function loadOverview() {
    try {
      const data = await fetchOverview();
      setCombined(data.combined_status);
      setAccountsList(data.accounts);
      setPositions(data.positions);
      setPerformance(data.performance);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Overview fetch failed:", err);
    }
  }

  // Auto-refresh on WS updates (any account triggers a re-fetch)
  const handleMessage = useCallback(() => {
    loadOverview();
  }, []);

  const token = getToken();
  const { connected } = useWebSocket({
    url: token ? createWsUrl() : "",
    onMessage: handleMessage,
  });

  const floatingColor = (combined?.floating_pl ?? 0) >= 0 ? "green" : "red";
  const ddColor =
    (combined?.drawdown_pct ?? 0) > 5
      ? "red"
      : (combined?.drawdown_pct ?? 0) > 2
        ? "yellow"
        : "green";

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="All Accounts Overview"
        subtitle={
          <>
            {connected ? (
              <span className="text-emerald-400">● Connected</span>
            ) : (
              <span className="text-red-400">● Disconnected</span>
            )}
            {lastUpdate && (
              <span className="text-gray-500">
                Last update: {lastUpdate}
              </span>
            )}
            {combined && (
              <span className="text-gray-500">
                {combined.accounts_count} account(s)
              </span>
            )}
          </>
        }
        currentPage="overview"
        onLogout={() => {
          clearToken();
          router.replace("/login");
        }}
      />

      {/* Combined stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
        <StatCard
          label="Total Balance"
          value={combined ? `$${combined.balance.toLocaleString()}` : "—"}
        />
        <StatCard
          label="Total Equity"
          value={combined ? `$${combined.equity.toLocaleString()}` : "—"}
        />
        <StatCard
          label="Floating P/L"
          value={
            combined
              ? `${combined.floating_pl >= 0 ? "+" : ""}$${Math.abs(combined.floating_pl).toFixed(2)}`
              : "—"
          }
          color={floatingColor}
        />
        <StatCard
          label="Drawdown"
          value={combined ? `${combined.drawdown_pct.toFixed(2)}%` : "—"}
          color={ddColor}
        />
        <StatCard
          label="Free Margin"
          value={
            combined ? `$${combined.margin_free.toLocaleString()}` : "—"
          }
        />
        <StatCard
          label="Open Positions"
          value={combined?.positions_count ?? "—"}
        />
      </div>

      {/* Per-account cards */}
      <div>
        <h2 className="text-sm font-medium text-gray-400 mb-3">
          Per-Account Breakdown
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accountsList.map((acc) => {
            const fl = acc.floating_pl;
            const dd = acc.drawdown_pct;
            const sym = acc.currency === "USC" ? "¢" : "$";
            return (
              <div
                key={acc.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors cursor-pointer"
                onClick={() => router.push(`/dashboard?account=${acc.id}`)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600/20 text-blue-400 rounded-lg flex items-center justify-center text-xs font-bold uppercase">
                      {acc.id.slice(0, 2)}
                    </div>
                    <span className="font-medium uppercase">{acc.id}</span>
                    <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${
                      (acc.platform || "mt5") === "mt4"
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}>
                      {(acc.platform || "mt5").toUpperCase()}
                    </span>
                    {acc.currency && acc.currency !== "USD" && (
                      <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded font-medium">
                        {acc.currency}
                      </span>
                    )}
                    {acc.mode === "live" || acc.is_live ? (
                      <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded font-medium">
                        LIVE
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded font-medium">
                        DEMO
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      fl >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {fl >= 0 ? "+" : ""}{sym}{Math.abs(fl).toFixed(2)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-gray-500">Balance</p>
                    <p className="text-sm font-medium">
                      {sym}{acc.balance.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Equity</p>
                    <p className="text-sm font-medium">
                      {sym}{acc.equity.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">DD</p>
                    <p
                      className={`text-sm font-medium ${
                        dd > 5
                          ? "text-red-400"
                          : dd > 2
                            ? "text-yellow-400"
                            : "text-emerald-400"
                      }`}
                    >
                      {dd.toFixed(2)}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
                  <span className="text-xs text-gray-500">
                    {acc.positions_count} position(s)
                  </span>
                  <span className="text-xs text-gray-500">
                    {acc.total_trades} trades (30d)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Combined Performance + All Positions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AllPositionsTable data={positions} />
        </div>
        <div>
          <PerformanceCard data={performance} currency="USD" />
        </div>
      </div>
    </div>
  );
}

// ── All Positions Table (with account column) ───────────────────────────────

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useIsMobile } from "@/lib/useMediaQuery";

interface PositionRow extends Position {
  account_id: string;
}

const col = createColumnHelper<PositionRow>();

const overviewColumns = [
  col.accessor("account_id", {
    header: "Account",
    size: 80,
    cell: (info) => (
      <span className="uppercase text-blue-400 font-medium text-xs">
        {info.getValue()}
      </span>
    ),
  }),
  col.accessor("symbol", { header: "Symbol", size: 80 }),
  col.accessor("type", {
    header: "Type",
    size: 60,
    cell: (info) => (
      <span
        className={info.getValue() === 0 ? "text-emerald-400" : "text-red-400"}
      >
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

function AllPositionsTable({ data }: { data: PositionRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const isMobile = useIsMobile();
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  useEffect(() => {
    setColumnVisibility(
      isMobile
        ? { price_open: false, price_current: false }
        : {}
    );
  }, [isMobile]);

  const table = useReactTable({
    data,
    columns: overviewColumns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-3 sm:px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-medium text-gray-400">
          All Open Positions ({data.length})
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
                    className="px-2 py-2 md:px-4 md:py-2.5 text-left text-xs text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-300 select-none"
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
                  colSpan={table.getVisibleLeafColumns().length}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No open positions across all accounts
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-2 md:px-4 md:py-2.5">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
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
