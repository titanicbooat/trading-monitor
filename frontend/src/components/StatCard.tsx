interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "green" | "red" | "yellow";
}

const colorMap = {
  default: "text-white",
  green: "text-emerald-400",
  red: "text-red-400",
  yellow: "text-yellow-400",
};

export function StatCard({ label, value, sub, color = "default" }: StatCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4 h-full flex flex-col justify-between">
      <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      <div className="text-right mt-2">
        <p className={`text-xl sm:text-2xl md:text-3xl font-bold ${colorMap[color]}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}
