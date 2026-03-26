// ── VPS Configuration ────────────────────────────────────────────────────────

export interface VpsConfig {
  id: string;
  label: string;
}

let _vpsList: VpsConfig[] | null = null;

export function getVpsList(): VpsConfig[] {
  if (_vpsList) return _vpsList;
  try {
    _vpsList = JSON.parse(process.env.NEXT_PUBLIC_VPS_LIST || "[]");
  } catch {
    _vpsList = [];
  }
  // Fallback: single default VPS
  if (!_vpsList || _vpsList.length === 0) {
    _vpsList = [{ id: "default", label: "Default" }];
  }
  return _vpsList;
}

function isSingleVps(): boolean {
  const list = getVpsList();
  return list.length === 1 && list[0].id === "default";
}

// ── Token Management (per-VPS) ──────────────────────────────────────────────

export function getToken(vpsId?: string): string | null {
  if (typeof window === "undefined") return null;
  if (vpsId) return localStorage.getItem(`mt5_token_${vpsId}`);
  // Legacy fallback for single-VPS
  return localStorage.getItem("mt5_token");
}

export function setToken(vpsId: string, token: string) {
  localStorage.setItem(`mt5_token_${vpsId}`, token);
}

export function clearToken(vpsId?: string) {
  if (vpsId) {
    localStorage.removeItem(`mt5_token_${vpsId}`);
  } else {
    // Clear all VPS tokens
    const keys = Object.keys(localStorage).filter(
      (k) => k.startsWith("mt5_token")
    );
    keys.forEach((k) => localStorage.removeItem(k));
  }
}

export function isAnyAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return getVpsList().some((vps) => !!getToken(vps.id));
}

export function getAuthenticatedVpsList(): VpsConfig[] {
  return getVpsList().filter((vps) => !!getToken(vps.id));
}

// ── Login ───────────────────────────────────────────────────────────────────

function baseUrl(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function vpsApiPath(vpsId: string, path: string): string {
  return `/api/vps/${vpsId}${path}`;
}

export async function login(
  vpsId: string,
  username: string,
  password: string
): Promise<string> {
  const url = `${baseUrl()}${vpsApiPath(vpsId, "/token")}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Login failed");
  }
  const data = await res.json();
  setToken(vpsId, data.access_token);
  return data.access_token;
}

export interface LoginResult {
  vpsId: string;
  label: string;
  ok: boolean;
  error?: string;
}

export async function loginAll(
  username: string,
  password: string
): Promise<LoginResult[]> {
  const vpsList = getVpsList();
  return Promise.all(
    vpsList.map(async (vps) => {
      try {
        await login(vps.id, username, password);
        return { vpsId: vps.id, label: vps.label, ok: true };
      } catch (err) {
        return {
          vpsId: vps.id,
          label: vps.label,
          ok: false,
          error: err instanceof Error ? err.message : "Failed",
        };
      }
    })
  );
}

// ── Auth Fetch (VPS-scoped) ─────────────────────────────────────────────────

async function authFetch(
  vpsId: string,
  path: string,
  params?: Record<string, string>
) {
  const token = getToken(vpsId);
  if (!token) throw new Error("Not authenticated");
  const url = new URL(`${baseUrl()}${vpsApiPath(vpsId, path)}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    clearToken(vpsId);
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function authMutate(
  vpsId: string,
  method: string,
  path: string,
  body?: Record<string, unknown>
) {
  const token = getToken(vpsId);
  if (!token) throw new Error("Not authenticated");
  const url = `${baseUrl()}${vpsApiPath(vpsId, path)}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    clearToken(vpsId);
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ detail: `Error ${res.status}` }));
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json();
}

// ── Parallel Multi-VPS Fetch ────────────────────────────────────────────────

export interface VpsFetchResult<T> {
  vpsId: string;
  label: string;
  data?: T;
  error?: string;
}

export async function fetchAllVps<T>(
  path: string,
  params?: Record<string, string>
): Promise<VpsFetchResult<T>[]> {
  const vpsList = getAuthenticatedVpsList();
  return Promise.all(
    vpsList.map(async (vps) => {
      try {
        const data = await authFetch(vps.id, path, params);
        return { vpsId: vps.id, label: vps.label, data: data as T };
      } catch (err) {
        return {
          vpsId: vps.id,
          label: vps.label,
          error: err instanceof Error ? err.message : "Failed",
        };
      }
    })
  );
}

// ── VPS-scoped API Functions ────────────────────────────────────────────────

export const fetchAccounts = (vpsId: string) =>
  authFetch(vpsId, "/accounts");
export const fetchOverview = (vpsId: string) =>
  authFetch(vpsId, "/overview");
export const fetchTerminals = (vpsId: string) =>
  authFetch(vpsId, "/terminals");
export const fetchStatus = (vpsId: string, account?: string) =>
  authFetch(vpsId, "/status", account ? { account } : undefined);
export const fetchPositions = (vpsId: string, account?: string) =>
  authFetch(vpsId, "/positions", account ? { account } : undefined);
export const fetchPerformance = (vpsId: string, account?: string) =>
  authFetch(vpsId, "/performance", account ? { account } : undefined);
export const fetchHistory = (vpsId: string, account?: string) =>
  authFetch(vpsId, "/history", account ? { account } : undefined);

export const fetchCalendar = (
  vpsId: string,
  account?: string,
  year?: number,
  month?: number
) => {
  const params: Record<string, string> = {};
  if (account) params.account = account;
  if (year) params.year = String(year);
  if (month) params.month = String(month);
  return authFetch(
    vpsId,
    "/calendar",
    Object.keys(params).length ? params : undefined
  );
};

export const fetchDeposits = (vpsId: string, account?: string) =>
  authFetch(vpsId, "/deposits", account ? { account } : undefined);
export const fetchTrades = (vpsId: string, account?: string) =>
  authFetch(vpsId, "/trades", account ? { account } : undefined);
export const fetchMT4SetupInfo = (vpsId: string) =>
  authFetch(vpsId, "/mt4/setup-info");

// ── Account CRUD ────────────────────────────────────────────────────────────

export function addAccount(
  vpsId: string,
  data: {
    id: string;
    login: number;
    password: string;
    server: string;
    terminal_path: string;
    platform: string;
  }
) {
  return authMutate(vpsId, "POST", "/accounts", data);
}

export function updateAccount(
  vpsId: string,
  accountId: string,
  data: {
    id: string;
    login: number;
    password: string;
    server: string;
    terminal_path: string;
    platform: string;
  }
) {
  return authMutate(vpsId, "PUT", `/accounts/${accountId}`, data);
}

export function deleteAccount(vpsId: string, accountId: string) {
  return authMutate(vpsId, "DELETE", `/accounts/${accountId}`);
}

// ── WebSocket ───────────────────────────────────────────────────────────────

export function createWsUrl(vpsId?: string): string {
  const id = vpsId || getVpsList()[0]?.id || "default";
  const token = getToken(id);
  const wsBase = process.env.NEXT_PUBLIC_WS_URL || "ws://78.46.241.125:8001";
  return `${wsBase}/ws/dashboard?token=${token}`;
}
