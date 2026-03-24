"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchCalendar } from "@/lib/api";

interface DayData {
  date: string;
  profit: number;
  trades: number;
}

interface CalendarData {
  year: number;
  month: number;
  currency: string;
  monthly_pl: number;
  monthly_trades: number;
  days: DayData[];
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function TradingCalendar({ account, currency }: { account: string; currency?: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    try {
      const res = await fetchCalendar(account, year, month);
      setData(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [account, year, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  }

  function goToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  }

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1);
  const startDow = firstDay.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month;

  const dayMap: Record<string, DayData> = {};
  if (data) {
    for (const d of data.days) dayMap[d.date] = d;
  }

  const weeks: (number | null)[][] = [];
  let week: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const weeklySummaries = weeks.map((w) => {
    let profit = 0;
    let trades = 0;
    for (const d of w) {
      if (d === null) continue;
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dd = dayMap[key];
      if (dd) { profit += dd.profit; trades += dd.trades; }
    }
    return { profit: Math.round(profit * 100) / 100, trades };
  });

  const sym = (data?.currency || currency || "USD") === "USC" ? "\u00a2" : "$";

  function formatPL(val: number): string {
    const abs = Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return val < 0 ? `-${sym}${abs}` : `${sym}${abs}`;
  }

  return (
    <div className="space-y-3">
      {/* Monthly P/L + Month Navigation */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="text-gray-400 hover:text-white text-lg px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center">&lt;</button>
          <span className="text-sm font-medium min-w-[100px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="text-gray-400 hover:text-white text-lg px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center">&gt;</button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            Monthly P/L:{" "}
            <span className={`font-bold ${(data?.monthly_pl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatPL(data?.monthly_pl ?? 0)}
            </span>
          </span>
          <button
            onClick={goToday}
            className="text-xs text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-2 min-h-[44px] transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Calendar Content */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : (
        <>
          {/* ── Desktop: Grid View (md+) ── */}
          <div className="hidden md:block bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {/* Weekday Headers */}
            <div className="grid grid-cols-8 border-b border-gray-800">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-xs text-gray-500 font-medium py-2">{d}</div>
              ))}
              <div className="text-center text-xs text-gray-500 font-medium py-2">Weekly</div>
            </div>

            {/* Weeks */}
            {weeks.map((w, wi) => (
              <div key={wi} className="grid grid-cols-8 border-b border-gray-800/50 last:border-b-0">
                {w.map((day, di) => {
                  if (day === null) {
                    return <div key={di} className="border-r border-gray-800/30 min-h-[80px]" />;
                  }

                  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dd = dayMap[dateKey];
                  const isToday = isCurrentMonth && day === today.getDate();
                  const hasData = !!dd;
                  const isProfit = hasData && dd.profit > 0;
                  const isLoss = hasData && dd.profit < 0;

                  let bgClass = "";
                  if (isProfit) bgClass = "bg-emerald-900/40";
                  else if (isLoss) bgClass = "bg-red-900/40";

                  return (
                    <div key={di} className={`border-r border-gray-800/30 min-h-[80px] p-1.5 flex flex-col ${bgClass}`}>
                      <span
                        className={`text-xs ${
                          isToday
                            ? "bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold"
                            : "text-gray-400"
                        }`}
                      >
                        {day}
                      </span>
                      {hasData && (
                        <div className="mt-auto text-center">
                          <div className={`text-xs font-bold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                            {formatPL(dd.profit)}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {dd.trades} trade{dd.trades !== 1 ? "s" : ""}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Weekly Summary */}
                <div className="min-h-[80px] p-1.5 flex flex-col items-center justify-center bg-gray-800/30">
                  <div className="text-[10px] text-gray-500 font-medium">Week {wi + 1}</div>
                  <div
                    className={`text-xs font-bold ${
                      weeklySummaries[wi].profit > 0 ? "text-emerald-400"
                        : weeklySummaries[wi].profit < 0 ? "text-red-400"
                          : "text-gray-500"
                    }`}
                  >
                    {formatPL(weeklySummaries[wi].profit)}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {weeklySummaries[wi].trades} trade{weeklySummaries[wi].trades !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Mobile: List View (<md) ── */}
          <div className="block md:hidden bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            {weeks.map((w, wi) => {
              const weekDays = w
                .map((day) => {
                  if (day === null) return null;
                  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dd = dayMap[dateKey];
                  const isToday = isCurrentMonth && day === today.getDate();
                  return { day, dateKey, data: dd, isToday };
                })
                .filter((d): d is NonNullable<typeof d> => d !== null);

              const hasTrades = weekDays.some((d) => d.data);
              const ws = weeklySummaries[wi];

              return (
                <div key={wi} className="border-b border-gray-800/50 last:border-b-0">
                  {/* Week header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-800/40">
                    <span className="text-xs text-gray-500 font-medium">Week {wi + 1}</span>
                    <div className="flex items-center gap-3">
                      {ws.trades > 0 && (
                        <span className="text-[11px] text-gray-500">
                          {ws.trades} trade{ws.trades !== 1 ? "s" : ""}
                        </span>
                      )}
                      <span
                        className={`text-xs font-bold ${
                          ws.profit > 0 ? "text-emerald-400"
                            : ws.profit < 0 ? "text-red-400"
                              : "text-gray-500"
                        }`}
                      >
                        {formatPL(ws.profit)}
                      </span>
                    </div>
                  </div>

                  {/* Day rows — show all days, highlight ones with trades */}
                  {hasTrades ? (
                    weekDays
                      .filter((d) => d.data)
                      .map((d) => {
                        const dd = d.data!;
                        const isProfit = dd.profit > 0;
                        const isLoss = dd.profit < 0;
                        const dayOfWeek = WEEKDAYS[new Date(d.dateKey).getDay()];

                        let bgClass = "";
                        if (isProfit) bgClass = "bg-emerald-900/20";
                        else if (isLoss) bgClass = "bg-red-900/20";

                        return (
                          <div
                            key={d.day}
                            className={`flex items-center justify-between px-3 py-2.5 border-t border-gray-800/30 ${bgClass}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`text-xs w-5 text-center ${d.isToday ? "text-blue-400 font-bold" : "text-gray-500"}`}>
                                {d.day}
                              </span>
                              <span className="text-[11px] text-gray-500">{dayOfWeek}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[11px] text-gray-500">
                                {dd.trades} trade{dd.trades !== 1 ? "s" : ""}
                              </span>
                              <span className={`text-xs font-bold min-w-[60px] text-right ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                                {formatPL(dd.profit)}
                              </span>
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <div className="px-3 py-2 border-t border-gray-800/30 text-xs text-gray-600">
                      No trades
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
