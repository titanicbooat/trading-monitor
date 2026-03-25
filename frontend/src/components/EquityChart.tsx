"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export interface SnapshotPoint {
  timestamp: string;
  equity: number;
  balance: number;
  drawdown_pct: number;
  floating_pl: number;
  profit: number;
}

export interface TradePoint {
  ticket: number;
  symbol: string;
  type: number;
  volume: number;
  profit: number;
  time: string;
}

type Tab = "growth" | "balance" | "equity" | "dd" | "profit" | "pl";

const TABS: { key: Tab; label: string }[] = [
  { key: "growth", label: "Growth" },
  { key: "balance", label: "Balance" },
  { key: "equity", label: "Equity" },
  { key: "dd", label: "DD" },
  { key: "profit", label: "Profit" },
  { key: "pl", label: "P/L" },
];

export function EquityChart({ data, currency, trades }: { data: SnapshotPoint[]; currency?: string; trades?: TradePoint[] }) {
  const [tab, setTab] = useState<Tab>("growth");
  const sym = currency === "USC" ? "¢" : "$";

  if (!data.length) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center justify-center h-[280px] sm:h-[370px]">
        <p className="text-gray-500">No chart data yet</p>
      </div>
    );
  }

  const initialBalance = data[0]?.balance || 1;

  const formatted = data.map((d) => {
    const growthPct = ((d.equity - initialBalance) / initialBalance) * 100;
    const netProfit = d.equity - initialBalance;
    return {
      ...d,
      time: new Date(d.timestamp).toLocaleTimeString(),
      growth: Math.round(growthPct * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      dd: d.drawdown_pct ?? 0,
    };
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 sm:py-1 rounded-md text-[11px] sm:text-xs font-medium transition-colors min-h-[36px] sm:min-h-0 ${
              tab === t.key
                ? "bg-gray-700 text-white"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="h-[250px] sm:h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        {tab === "growth" ? (
          <AreaChart data={formatted}>
            <defs>
              <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
            <YAxis
              stroke="#6b7280"
              fontSize={11}
              tickFormatter={(v) => `${v}%`}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [`${value.toFixed(2)}%`, "Growth"]}
            />
            <Area
              type="monotone"
              dataKey="growth"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#growthGrad)"
              dot={false}
              name="Growth"
            />
          </AreaChart>
        ) : tab === "balance" ? (
          <LineChart data={formatted}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
            <YAxis stroke="#6b7280" fontSize={11} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [`${sym}${value.toFixed(2)}`, "Balance"]}
            />
            <Line
              type="monotone"
              dataKey="balance"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="Balance"
            />
          </LineChart>
        ) : tab === "equity" ? (
          <LineChart data={formatted}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
            <YAxis stroke="#6b7280" fontSize={11} domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => [
                `${sym}${value.toFixed(2)}`,
                name,
              ]}
            />
            <Line
              type="monotone"
              dataKey="equity"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
              name="Equity"
            />
            <Line
              type="monotone"
              dataKey="balance"
              stroke="#6b7280"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              name="Balance"
            />
          </LineChart>
        ) : tab === "dd" ? (
          <AreaChart data={formatted}>
            <defs>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
            <YAxis
              stroke="#6b7280"
              fontSize={11}
              tickFormatter={(v) => `${v}%`}
              domain={[0, "auto"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [
                `${value.toFixed(2)}%`,
                "Drawdown",
              ]}
            />
            <Area
              type="monotone"
              dataKey="dd"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#ddGrad)"
              dot={false}
              name="Drawdown"
            />
          </AreaChart>
        ) : tab === "profit" ? (
          <AreaChart data={formatted}>
            <defs>
              <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" stroke="#6b7280" fontSize={11} />
            <YAxis
              stroke="#6b7280"
              fontSize={11}
              tickFormatter={(v) => `${sym}${v}`}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [
                `${sym}${value.toFixed(2)}`,
                "Net Profit",
              ]}
            />
            <Area
              type="monotone"
              dataKey="net_profit"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#profitGrad)"
              dot={false}
              name="Net Profit"
            />
          </AreaChart>
        ) : (
          /* P/L from closed trades */
          <CumulativePLChart trades={trades || []} currency={sym} />
        )}
      </ResponsiveContainer>
      </div>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "8px",
  fontSize: 12,
};

function CumulativePLChart({ trades, currency }: { trades: TradePoint[]; currency: string }) {
  if (!trades.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No closed trades yet
      </div>
    );
  }

  // trades are already sorted ASC from backend
  let cumulative = 0;
  const plData = trades.map((t) => {
    cumulative += t.profit;
    const d = new Date(t.time);
    return {
      date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      symbol: t.symbol,
      profit: Math.round(t.profit * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
    };
  });

  const lastCum = plData[plData.length - 1]?.cumulative ?? 0;
  const color = lastCum >= 0 ? "#10b981" : "#ef4444";

  return (
    <AreaChart data={plData}>
      <defs>
        <linearGradient id="plGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={0.3} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
      <XAxis dataKey="date" stroke="#6b7280" fontSize={11} />
      <YAxis
        stroke="#6b7280"
        fontSize={11}
        tickFormatter={(v) => `${currency}${v}`}
        domain={["auto", "auto"]}
      />
      <Tooltip
        contentStyle={tooltipStyle}
        content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload;
          return (
            <div style={tooltipStyle} className="px-3 py-2">
              <p className="text-gray-400 text-xs">{d.symbol} | {d.date}</p>
              <p className={`text-sm font-medium ${d.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                Trade: {d.profit >= 0 ? "+" : ""}{currency}{d.profit.toFixed(2)}
              </p>
              <p className={`text-sm font-medium ${d.cumulative >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                Cumulative: {d.cumulative >= 0 ? "+" : ""}{currency}{d.cumulative.toFixed(2)}
              </p>
            </div>
          );
        }}
      />
      <Area
        type="monotone"
        dataKey="cumulative"
        stroke={color}
        strokeWidth={2}
        fill="url(#plGrad)"
        dot={false}
        name="Cumulative P/L"
      />
    </AreaChart>
  );
}
