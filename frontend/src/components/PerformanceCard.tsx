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

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-800/50 last:border-0">
      <span className="text-gray-400 text-xs sm:text-sm">{label}</span>
      <span className={`text-xs sm:text-sm font-medium ${color || "text-white"}`}>{value}</span>
    </div>
  );
}

export function PerformanceCard({ data, currency }: { data: PerfData | null; currency?: string }) {
  if (!data || data.total_trades === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Performance</h3>
        <p className="text-gray-500 text-sm">No closed trades yet</p>
      </div>
    );
  }

  const sym = currency === "USC" ? "¢" : "$";
  const pf = data.profit_factor === Infinity ? "∞" : data.profit_factor.toFixed(2);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Performance (30d)</h3>
      <div className="space-y-0">
        <Row label="Total Trades" value={String(data.total_trades)} />
        <Row label="Win / Loss" value={`${data.winning_trades} / ${data.losing_trades}`} />
        <Row
          label="Win Rate"
          value={`${data.win_rate}%`}
          color={data.win_rate >= 50 ? "text-emerald-400" : "text-red-400"}
        />
        <Row label="Profit Factor" value={pf} color={data.profit_factor >= 1 ? "text-emerald-400" : "text-red-400"} />
        <Row
          label="Net P/L"
          value={`${sym}${data.net_profit.toFixed(2)}`}
          color={data.net_profit >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <Row label="Avg Win" value={`${sym}${data.average_profit.toFixed(2)}`} color="text-emerald-400" />
        <Row label="Avg Loss" value={`-${sym}${data.average_loss.toFixed(2)}`} color="text-red-400" />
        <Row label="Largest Win" value={`${sym}${data.largest_win.toFixed(2)}`} color="text-emerald-400" />
        <Row label="Largest Loss" value={`${sym}${Math.abs(data.largest_loss).toFixed(2)}`} color="text-red-400" />
      </div>
    </div>
  );
}
