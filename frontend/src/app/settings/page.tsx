"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  getToken,
  clearToken,
  fetchAccounts,
  fetchTerminals,
  addAccount,
  updateAccount,
  deleteAccount,
} from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";

interface Account {
  id: string;
  login: number;
  server: string;
  terminal_path: string;
  platform: string;
  label: string;
  is_live?: boolean;
}

interface AccountForm {
  id: string;
  login: string;
  password: string;
  server: string;
  terminal_path: string;
  platform: string;
}

const emptyForm: AccountForm = {
  id: "",
  login: "",
  password: "",
  server: "",
  terminal_path: "",
  platform: "mt5",
};

export default function SettingsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [terminals, setTerminals] = useState<string[]>([]);
  const [form, setForm] = useState<AccountForm>({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    loadAccounts();
    loadTerminals();
  }, [router]);

  async function loadAccounts() {
    try {
      setAccounts(await fetchAccounts());
    } catch (err) {
      console.error("Failed to load accounts:", err);
    }
  }

  async function loadTerminals() {
    try {
      setTerminals(await fetchTerminals());
    } catch {
      // ignore
    }
  }

  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function handleEdit(acc: Account) {
    setForm({
      id: acc.id,
      login: String(acc.login),
      password: "",
      server: acc.server,
      terminal_path: acc.terminal_path || "",
      platform: acc.platform || "mt5",
    });
    setEditingId(acc.id);
    setShowForm(true);
    setError("");
    setSuccess("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    const loginNum = parseInt(form.login, 10);
    if (!form.id.trim()) {
      setError("Account ID is required");
      setLoading(false);
      return;
    }
    if (isNaN(loginNum) || loginNum <= 0) {
      setError("Login must be a valid number");
      setLoading(false);
      return;
    }
    if (!/^[a-z0-9-]+$/.test(form.id.trim())) {
      setError("Account ID must be lowercase letters, numbers, or hyphens");
      setLoading(false);
      return;
    }

    try {
      const data = {
        id: form.id.trim(),
        login: loginNum,
        password: form.password,
        server: form.server.trim(),
        terminal_path: form.platform === "mt5" ? form.terminal_path.trim() : "",
        platform: form.platform,
      };

      if (editingId) {
        await updateAccount(editingId, data);
        setSuccess(`Account "${data.id}" updated`);
      } else {
        await addAccount(data);
        setSuccess(`Account "${data.id}" added`);
      }
      resetForm();
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(accountId: string) {
    setError("");
    setSuccess("");
    try {
      await deleteAccount(accountId);
      setSuccess(`Account "${accountId}" deleted`);
      setDeleteConfirm(null);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
      setDeleteConfirm(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Account Settings"
        subtitle="Manage your MT4 / MT5 trading accounts"
        currentPage="settings"
        onLogout={() => {
          clearToken();
          router.replace("/login");
        }}
      />

      {/* Messages */}
      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-900/40 border border-emerald-700 text-emerald-300 text-sm rounded-lg px-4 py-3">
          {success}
        </div>
      )}

      {/* Detected Terminals */}
      {terminals.length > 0 && (
        <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-4">
          <p className="text-sm text-blue-300 font-medium mb-1">
            Detected MT5 Terminals ({terminals.length})
          </p>
          {terminals.map((t, i) => (
            <p key={i} className="text-xs text-blue-400/70 font-mono">
              {t}
            </p>
          ))}
        </div>
      )}

      {/* Account List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-400">
            Accounts ({accounts.length})
          </h2>
          {!showForm && (
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
                setSuccess("");
              }}
              className="text-sm bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-1.5 font-medium transition-colors"
            >
              + Add Account
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-800/50">
          {accounts.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              No accounts configured
            </div>
          ) : (
            accounts.map((acc) => (
              <div
                key={acc.id}
                className="px-3 sm:px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:bg-gray-800/30"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold uppercase ${
                      acc.is_live
                        ? "bg-emerald-600/20 text-emerald-400"
                        : "bg-yellow-600/20 text-yellow-400"
                    }`}
                  >
                    {acc.id.slice(0, 2)}
                  </div>
                  <div>
                    <p className="font-medium">
                      {acc.id.toUpperCase()}
                      <span
                        className={`ml-2 px-1.5 py-0.5 text-xs rounded font-medium ${
                          (acc.platform || "mt5") === "mt4"
                            ? "bg-purple-500/20 text-purple-400"
                            : "bg-blue-500/20 text-blue-400"
                        }`}
                      >
                        {(acc.platform || "mt5").toUpperCase()}
                      </span>
                      {acc.is_live ? (
                        <span className="ml-1 px-1.5 py-0.5 text-xs rounded font-medium bg-emerald-500/20 text-emerald-400">
                          LIVE
                        </span>
                      ) : (
                        <span className="ml-1 px-1.5 py-0.5 text-xs rounded font-medium bg-yellow-500/20 text-yellow-400">
                          WAITING
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">
                      Login: {acc.login} &middot; Server: {acc.server || "—"}
                    </p>
                    {acc.terminal_path && (
                      <p className="text-xs text-gray-600 font-mono truncate max-w-[200px] sm:max-w-md">
                        {acc.terminal_path}
                      </p>
                    )}
                    {(acc.platform || "mt5") === "mt4" && (
                      <p className="text-xs text-gray-600 font-mono mt-0.5">
                        File: monitor_{acc.login}.json
                      </p>
                    )}
                    {(acc.platform || "mt5") === "mt4" && !acc.is_live && (
                      <p className="text-xs text-yellow-500/70 mt-0.5">
                        Waiting for EA file data...
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleEdit(acc)}
                    className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Edit
                  </button>
                  {deleteConfirm === acc.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(acc.id)}
                        className="text-sm text-red-400 hover:text-red-300 border border-red-700 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-sm text-gray-400 hover:text-white border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(acc.id)}
                      className="text-sm text-red-400 hover:text-red-300 border border-gray-700 rounded-lg px-3 py-1.5 transition-colors"
                      disabled={accounts.length <= 1}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-medium mb-4">
            {editingId ? `Edit Account: ${editingId}` : "Add New Account"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Platform selector */}
            <div className="space-y-1">
              <label className="text-sm text-gray-400">Platform</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, platform: "mt5" })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.platform === "mt5"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white border border-gray-700"
                  }`}
                >
                  MetaTrader 5
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, platform: "mt4" })}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.platform === "mt4"
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white border border-gray-700"
                  }`}
                >
                  MetaTrader 4
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm text-gray-400">
                  Account ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={form.id}
                  onChange={(e) =>
                    setForm({ ...form, id: e.target.value.toLowerCase() })
                  }
                  placeholder="e.g. main, hedge, scalp"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-600">
                  Lowercase letters, numbers, hyphens
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-400">
                  Login <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  placeholder="e.g. 12345678"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                {form.platform === "mt4" && form.login && (
                  <p className="text-xs text-purple-400">
                    EA will write to: monitor_{form.login}.json
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-400">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder={editingId ? "(unchanged if empty)" : "password"}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm text-gray-400">Server</label>
                <input
                  type="text"
                  value={form.server}
                  onChange={(e) => setForm({ ...form, server: e.target.value })}
                  placeholder="e.g. RoboForex-Pro"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* MT5: Terminal Path */}
            {form.platform === "mt5" && (
              <div className="space-y-1">
                <label className="text-sm text-gray-400">
                  Terminal Path
                  <span className="text-gray-600 ml-1">
                    (required for live data)
                  </span>
                </label>
                {terminals.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={form.terminal_path}
                      onChange={(e) =>
                        setForm({ ...form, terminal_path: e.target.value })
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- No terminal (demo mode) --</option>
                      {terminals.map((t, i) => (
                        <option key={i} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-600">
                      Or type a custom path below:
                    </p>
                    <input
                      type="text"
                      value={form.terminal_path}
                      onChange={(e) =>
                        setForm({ ...form, terminal_path: e.target.value })
                      }
                      placeholder="C:\Program Files\...\terminal64.exe"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={form.terminal_path}
                    onChange={(e) =>
                      setForm({ ...form, terminal_path: e.target.value })
                    }
                    placeholder="C:\Program Files\...\terminal64.exe"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                )}
                <p className="text-xs text-gray-600">
                  Full path to terminal64.exe. Leave empty for demo/simulated
                  data.
                </p>
              </div>
            )}

            {/* MT4: Setup instructions (file-based) */}
            {form.platform === "mt4" && (
              <div className="bg-purple-900/20 border border-purple-800 rounded-xl p-4 space-y-3">
                <p className="text-sm text-purple-300 font-medium">
                  MT4 Setup Instructions
                </p>
                <div className="text-xs text-purple-300/80 space-y-2">
                  <p>
                    MT4 sends data via an Expert Advisor (EA) that writes to a
                    local file. The backend reads this file automatically.
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 ml-1">
                    <li>
                      Copy{" "}
                      <span className="font-mono text-purple-400">
                        MonitorEA.mq4
                      </span>{" "}
                      to your MT4{" "}
                      <span className="font-mono text-purple-400">
                        MQL4/Experts/
                      </span>{" "}
                      folder and compile it
                    </li>
                    <li>
                      In MT4: enable{" "}
                      <span className="text-purple-400">AutoTrading</span>{" "}
                      (toolbar button)
                    </li>
                    <li>
                      Drag{" "}
                      <span className="text-purple-400">MonitorEA</span> onto
                      any chart
                    </li>
                    <li>
                      Tick{" "}
                      <span className="text-purple-400">
                        &quot;Allow live trading&quot;
                      </span>{" "}
                      in EA properties &gt; Common tab
                    </li>
                  </ol>
                  <div className="mt-2 pt-2 border-t border-purple-800/50">
                    <p className="text-purple-400 font-medium mb-1">
                      How it works:
                    </p>
                    <p>
                      The EA writes account data every 10 seconds to:
                      <br />
                      <code className="bg-purple-900/50 px-1.5 py-0.5 rounded text-purple-300 text-[11px]">
                        %APPDATA%\MetaQuotes\Terminal\Common\Files\monitor_
                        {form.login || "<login>"}.json
                      </code>
                    </p>
                    <p className="mt-1">
                      The backend automatically detects and reads this file. No
                      network configuration needed.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg px-6 py-2.5 font-medium transition-colors"
              >
                {loading
                  ? "Saving..."
                  : editingId
                    ? "Update Account"
                    : "Add Account"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="text-gray-400 hover:text-white border border-gray-700 rounded-lg px-6 py-2.5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
