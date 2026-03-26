const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mt5_token");
}

export function setToken(token: string) {
  localStorage.setItem("mt5_token", token);
}

export function clearToken() {
  localStorage.removeItem("mt5_token");
}

export async function login(
  username: string,
  password: string
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "1",
    },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Login failed");
  }
  const data = await res.json();
  setToken(data.access_token);
  return data.access_token;
}

async function authFetch(path: string, params?: Record<string, string>) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "ngrok-skip-browser-warning": "1",
    },
  });
  if (res.status === 401) {
    clearToken();
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const fetchAccounts = () => authFetch("/api/accounts");
export const fetchOverview = () => authFetch("/api/overview");
export const fetchTerminals = () => authFetch("/api/terminals");
export const fetchStatus = (account?: string) => authFetch("/api/status", account ? { account } : undefined);
export const fetchPositions = (account?: string) => authFetch("/api/positions", account ? { account } : undefined);
export const fetchPerformance = (account?: string) => authFetch("/api/performance", account ? { account } : undefined);
export const fetchHistory = (account?: string) => authFetch("/api/history", account ? { account } : undefined);

export const fetchCalendar = (account?: string, year?: number, month?: number) => {
  const params: Record<string, string> = {};
  if (account) params.account = account;
  if (year) params.year = String(year);
  if (month) params.month = String(month);
  return authFetch("/api/calendar", Object.keys(params).length ? params : undefined);
};

export const fetchDeposits = (account?: string) => authFetch("/api/deposits", account ? { account } : undefined);
export const fetchTrades = (account?: string) => authFetch("/api/trades", account ? { account } : undefined);

export function createWsUrl(): string {
  const token = getToken();
  const wsBase = process.env.NEXT_PUBLIC_WS_URL || "ws://78.46.241.125:8001";
  return `${wsBase}/ws/dashboard?token=${token}`;
}

// ── Account CRUD ────────────────────────────────────────────────────────────

async function authMutate(
  method: string,
  path: string,
  body?: Record<string, unknown>
) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "1",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearToken();
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `Error ${res.status}` }));
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json();
}

export function addAccount(data: {
  id: string;
  login: number;
  password: string;
  server: string;
  terminal_path: string;
  platform: string;
}) {
  return authMutate("POST", "/api/accounts", data);
}

export function updateAccount(
  accountId: string,
  data: { id: string; login: number; password: string; server: string; terminal_path: string; platform: string }
) {
  return authMutate("PUT", `/api/accounts/${accountId}`, data);
}

export const fetchMT4SetupInfo = () => authFetch("/api/mt4/setup-info");

export function deleteAccount(accountId: string) {
  return authMutate("DELETE", `/api/accounts/${accountId}`);
}
