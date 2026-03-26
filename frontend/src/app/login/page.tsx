"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loginAll, getVpsList, type LoginResult } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LoginResult[]>([]);

  const vpsList = getVpsList();
  const showVpsResults = vpsList.length > 1 && results.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResults([]);
    setLoading(true);
    try {
      const res = await loginAll(username, password);
      setResults(res);
      const anyOk = res.some((r) => r.ok);
      if (anyOk) {
        router.push("/overview");
      } else {
        setError(res[0]?.error || "Login failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 border border-gray-800 rounded-xl p-8 w-full max-w-sm space-y-5 shadow-2xl"
      >
        <h1 className="text-2xl font-bold text-center">Trading Monitor</h1>
        <p className="text-gray-400 text-center text-sm">
          Sign in to your dashboard
        </p>

        {error && !showVpsResults && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        {showVpsResults && (
          <div className="space-y-1.5">
            {results.map((r) => (
              <div
                key={r.vpsId}
                className={`flex items-center justify-between text-sm px-3 py-1.5 rounded-lg ${
                  r.ok
                    ? "bg-emerald-900/30 text-emerald-400"
                    : "bg-red-900/30 text-red-400"
                }`}
              >
                <span>{r.label}</span>
                <span>{r.ok ? "Connected" : r.error}</span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-sm text-gray-400">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-gray-400">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg py-2.5 font-medium transition-colors"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
