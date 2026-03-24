"use client";

import { useEffect, useState } from "react";
import { fetchDeposits } from "@/lib/api";

interface Deal {
  ticket: number;
  deal_type: "deposit" | "withdrawal";
  amount: number;
  time: string;
  comment: string;
}

interface DepositsData {
  deals: Deal[];
  currency: string;
  summary: {
    total_deposit: number;
    total_withdrawal: number;
    net: number;
  };
}

export function DepositHistory({ account, currency }: { account?: string; currency?: string }) {
  const [data, setData] = useState<DepositsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDeposits(account).then((d) => { if (!cancelled) setData(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [account]);

  const sym = currency === "USC" ? "¢" : "$";

  if (!data || data.deals.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
        <h3 className="text-sm font-semibold text-gray-400 mb-2">Deposit & Withdrawal History</h3>
        <p className="text-gray-600 text-sm">No deposit/withdrawal records</p>
      </div>
    );
  }

  const { deals, summary } = data;

  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Deposit & Withdrawal History</h3>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Total Deposit</div>
          <div className="text-sm font-semibold text-green-400">+{sym}{summary.total_deposit.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Total Withdrawal</div>
          <div className="text-sm font-semibold text-red-400">-{sym}{summary.total_withdrawal.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Net</div>
          <div className={`text-sm font-semibold ${summary.net >= 0 ? "text-green-400" : "text-red-400"}`}>
            {summary.net >= 0 ? "+" : "-"}{sym}{Math.abs(summary.net).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Deals table — desktop */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-800">
              <th className="text-left py-2 pr-2">Date</th>
              <th className="text-left py-2 pr-2">Type</th>
              <th className="text-right py-2 pr-2">Amount</th>
              <th className="text-left py-2">Comment</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.ticket} className="border-b border-gray-800/50">
                <td className="py-2 pr-2 text-gray-400">
                  {d.time ? new Date(d.time).toLocaleDateString() : "—"}
                </td>
                <td className="py-2 pr-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    d.deal_type === "deposit"
                      ? "bg-green-900/40 text-green-400"
                      : "bg-red-900/40 text-red-400"
                  }`}>
                    {d.deal_type === "deposit" ? "Deposit" : "Withdrawal"}
                  </span>
                </td>
                <td className={`py-2 pr-2 text-right font-mono ${
                  d.deal_type === "deposit" ? "text-green-400" : "text-red-400"
                }`}>
                  {d.deal_type === "deposit" ? "+" : "-"}{sym}{d.amount.toLocaleString()}
                </td>
                <td className="py-2 text-gray-500 truncate max-w-[200px]">{d.comment || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Deals list — mobile */}
      <div className="sm:hidden space-y-2">
        {deals.map((d) => (
          <div key={d.ticket} className="flex items-center justify-between py-2 border-b border-gray-800/50">
            <div>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                d.deal_type === "deposit"
                  ? "bg-green-900/40 text-green-400"
                  : "bg-red-900/40 text-red-400"
              }`}>
                {d.deal_type === "deposit" ? "Deposit" : "Withdrawal"}
              </span>
              <div className="text-xs text-gray-500 mt-1">
                {d.time ? new Date(d.time).toLocaleDateString() : "—"}
                {d.comment ? ` · ${d.comment}` : ""}
              </div>
            </div>
            <div className={`font-mono text-sm font-semibold ${
              d.deal_type === "deposit" ? "text-green-400" : "text-red-400"
            }`}>
              {d.deal_type === "deposit" ? "+" : "-"}{sym}{d.amount.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
