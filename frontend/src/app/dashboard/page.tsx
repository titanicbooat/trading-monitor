"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getToken,
  clearToken,
  createWsUrl,
  fetchAccounts,
  fetchStatus,
  fetchPositions,
  fetchPerformance,
  fetchHistory,
} from "@/lib/api";
import { useWebSocket } from "@/lib/useWebSocket";
import { StatCard } from "@/components/StatCard";
import { EquityChart } from "@/components/EquityChart";
import { PositionsTable, type Position } from "@/components/PositionsTable";
import { PerformanceCard } from "@/components/PerformanceCard";
import { TradingCalendar } from "@/components/TradingCalendar";
import { PageHeader } from "@/components/PageHeader";

interface Account {
  id: string;
  label: string;
  is_live?: boolean;
  platform?: string;
}

interface AccountStatus {
  balance: number;
  equity: number;
  margin: number;
  margin_free: number;
  margin_level: number;
  floating_pl: number;
  drawdown_pct: number;
  positions_count: number;
  profit: number;
  timestamp: string;
  [key: string]: unknown;
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

interface SnapshotPoint {
  timestamp: string;
  equity: number;
  balance: number;
  drawdown_pct: number;
  floating_pl: number;
  profit: number;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountFromUrl = searchParams.get("account");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>(accountFromUrl || "");
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [performance, setPerformance] = useState<PerfData | null>(null);
  const [history, setHistory] = useState<SnapshotPoint[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  // Auth guard
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    }
  }, [router]);

  // Load accounts list
  useEffect(() => {
    async function loadAccounts() {
      try {
        const accs = await fetchAccounts();
        setAccounts(accs);
        if (accs.length > 0 && !selectedAccount) {
          setSelectedAccount(accs[0].id);
        }
      } catch (err) {
        console.error("Failed to load accounts:", err);
      }
    }
    if (getToken()) loadAccounts();
  }, []);

  // Fetch data when selected account changes
  useEffect(() => {
    if (!selectedAccount || !getToken()) return;

    // Clear old data immediately
    setStatus(null);
    setPositions([]);
    setHistory([]);
    setPerformance(null);

    async function loadData() {
      try {
        const [s, p, perf, h] = await Promise.all([
          fetchStatus(selectedAccount),
          fetchPositions(selectedAccount),
          fetchPerformance(selectedAccount),
          fetchHistory(selectedAccount),
        ]);
        if (s && !s.detail) setStatus(s);
        setPositions(p || []);
        setPerformance(perf);
        setHistory(
          (h || []).map((snap: Record<string, unknown>) => ({
            timestamp: snap.timestamp as string,
            equity: snap.equity as number,
            balance: snap.balance as number,
            drawdown_pct: (snap.drawdown_pct as number) ?? 0,
            floating_pl: (snap.floating_pl as number) ?? 0,
            profit: (snap.profit as number) ?? 0,
          }))
        );
      } catch (err) {
        console.error("Data fetch failed:", err);
      }
    }
    loadData();
  }, [selectedAccount]);

  // Refetch performance every 60s
  useEffect(() => {
    if (!selectedAccount) return;
    const interval = setInterval(async () => {
      try {
        const perf = await fetchPerformance(selectedAccount);
        setPerformance(perf);
      } catch {
        // ignore
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [selectedAccount]);

  // WebSocket handler — filter by selected account
  const handleMessage = useCallback(
    (data: unknown) => {
      const msg = data as {
        type: string;
        account_id: string;
        status: AccountStatus;
        positions: Position[];
        history: SnapshotPoint[];
      };
      if (msg.type === "update" && msg.account_id === selectedAccount) {
        if (msg.status) setStatus(msg.status);
        if (msg.positions) setPositions(msg.positions);
        if (msg.history) {
          setHistory((prev) => {
            const combined = [...prev, ...msg.history];
            const seen = new Set<string>();
            const unique = combined.filter((p) => {
              if (seen.has(p.timestamp)) return false;
              seen.add(p.timestamp);
              return true;
            });
            return unique.slice(-500);
          });
        }
        setLastUpdate(new Date().toLocaleTimeString());
      }
    },
    [selectedAccount]
  );

  const token = getToken();
  const { connected } = useWebSocket({
    url: token ? createWsUrl() : "",
    onMessage: handleMessage,
  });

  function handleLogout() {
    clearToken();
    router.replace("/login");
  }

  const floatingColor =
    (status?.floating_pl ?? 0) >= 0 ? "green" : "red";
  const ddColor =
    (status?.drawdown_pct ?? 0) > 5
      ? "red"
      : (status?.drawdown_pct ?? 0) > 2
        ? "yellow"
        : "green";

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Trading Dashboard"
        subtitle={
          <>
            {connected ? (
              <span className="text-emerald-400">● Connected</span>
            ) : (
              <span className="text-red-400">● Disconnected</span>
            )}
            {(() => {
              const currentAcc = accounts.find((a) => a.id === selectedAccount);
              const mode = (status as Record<string, unknown>)?._mode;
              const isLive = mode === "live" || currentAcc?.is_live;
              if (status) {
                return isLive ? (
                  <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded font-medium">
                    LIVE
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded font-medium">
                    DEMO
                  </span>
                );
              }
              return null;
            })()}
            {lastUpdate && (
              <span className="text-gray-500">
                Last update: {lastUpdate}
              </span>
            )}
          </>
        }
        currentPage="dashboard"
        onLogout={handleLogout}
        rightSlot={
          accounts.length > 1 ? (
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-h-[44px]"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.label} {acc.is_live ? "" : " [DEMO]"}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
        {(() => {
          const cur = status?.currency || "USD";
          const sym = cur === "USC" ? "¢" : "$";
          return (
            <>
              <StatCard
                label="Balance"
                value={status ? `${sym}${status.balance.toLocaleString()}` : "—"}
              />
              <StatCard
                label="Equity"
                value={status ? `${sym}${status.equity.toLocaleString()}` : "—"}
              />
              <StatCard
                label="Floating P/L"
                value={
                  status
                    ? `${status.floating_pl >= 0 ? "+" : ""}${sym}${Math.abs(status.floating_pl).toFixed(2)}`
                    : "—"
                }
                color={floatingColor}
              />
              <StatCard
                label="Drawdown"
                value={status ? `${status.drawdown_pct.toFixed(2)}%` : "—"}
                color={ddColor}
              />
              <StatCard
                label="Free Margin"
                value={
                  status ? `${sym}${status.margin_free?.toLocaleString() ?? "—"}` : "—"
                }
              />
              <StatCard
                label="Positions"
                value={status?.positions_count ?? "—"}
              />
            </>
          );
        })()}
      </div>

      {/* Chart + Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <EquityChart data={history} currency={status?.currency as string} />
        </div>
        <div>
          <PerformanceCard data={performance} currency={status?.currency as string} />
        </div>
      </div>

      {/* Positions table */}
      <PositionsTable data={positions} />

      {/* Trading Calendar */}
      {selectedAccount && (
        <TradingCalendar account={selectedAccount} currency={status?.currency as string} />
      )}
    </div>
  );
}
