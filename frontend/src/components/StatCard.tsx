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
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
