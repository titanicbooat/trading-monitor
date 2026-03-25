# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

### Backend (FastAPI + Python)
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8001
```

### Frontend (Next.js 15 + React 19 + TypeScript)
```bash
cd frontend
npm install
npm run dev        # Dev server on :3000
npm run build      # Production build (also runs type-check)
npm run start      # Serve production build
```

### Both services (Windows)
`start.bat` launches backend + ngrok tunnel. Reads `NGROK_DOMAIN` from `backend/.env`.

## Architecture

Real-time multi-account MT4/MT5 trading monitor. Backend polls trading terminals, stores data in SQLite + RAM hybrid, and pushes updates via WebSocket. Frontend renders dashboards with live data.

### Data Flow
```
MT5 Terminal ──[collector.py: 30s poll]──┐
                                         ├──▶ memory.py (SQLite + RAM)
MT4 EA ──[JSON file]──[mt4_watcher.py: 10s poll]─┘         │
                                                    ▼
                                              main.py (FastAPI)
                                              ├── REST /api/*
                                              └── WS /ws/dashboard
                                                    │
                                              browser (Next.js)
```

### Backend (`backend/`)
- **main.py** — FastAPI app. `load_dotenv()` MUST be called before `from auth import ...` (line 12). REST endpoints: `/api/token`, `/api/accounts` (CRUD), `/api/status`, `/api/positions`, `/api/performance`, `/api/trades`, `/api/history`, `/api/calendar`, `/api/deposits`, `/api/overview`. WebSocket: `/ws/dashboard`. MT4 webhook: `/api/mt4/push`. Starts collector and MT4 watcher as background tasks on startup.
- **collector.py** — Async background loop. Polls MT5 accounts every 30s (snapshots) and 5min (closed trades + balance deals). No demo fallback — when MT5 connection fails, the account is skipped. Uses `collector_live_status` dict (mutated in-place) to track per-account connectivity.
- **mt4_watcher.py** — Polls `%APPDATA%/MetaQuotes/Terminal/Common/Files/monitor_<login>.json` every 10s. These files are written by MonitorEA.mq4 running in MT4.
- **memory.py** — Thread-safe singleton `MemoryStore`. Hybrid storage: ephemeral data (latest snapshot, current positions) in RAM dicts, historical data (closed trades, balance deals, snapshots history) in SQLite (`data.db` with WAL mode). Snapshots capped at 10,000 per account with periodic cleanup.
- **auth.py** — JWT auth. Credentials from `ADMIN_USER`/`ADMIN_PASS` env vars. 7-day token expiry. `SECRET_KEY` required.
- **ws_manager.py** — WebSocket connection manager for broadcasting updates.

### Frontend (`frontend/src/`)
- **lib/api.ts** — API client. Base URL from `NEXT_PUBLIC_API_URL`. Token in `localStorage.mt5_token`. All fetches include `ngrok-skip-browser-warning: 1` header. WebSocket URL converts http→ws scheme.
- **lib/useWebSocket.ts** — Auto-reconnecting WebSocket hook with 3s retry.
- **lib/useMediaQuery.ts** — `useIsMobile()` hook for responsive column hiding.
- **components/PageHeader.tsx** — Shared nav header. Desktop: inline buttons. Mobile: hamburger dropdown with click-outside close.
- **Pages**: `/login` (JWT form), `/dashboard` (single-account detail with charts, positions, calendar, deposit history), `/overview` (multi-account combined view), `/settings` (account CRUD), `/calendar` (standalone calendar view).

### Key Patterns
- **SQLite + RAM hybrid** — Historical data persists in `backend/data.db` (survives restarts). Ephemeral data (latest snapshot, current positions) stays in RAM for speed. SQLite uses `INSERT OR IGNORE` with `UNIQUE(account_id, ticket)` for deduplication.
- **Multi-currency** — Accounts can be USD or USC (US cents). Overview converts USC÷100 to USD for combined totals. Components accept `currency` prop and show `$` or `¢`.
- **Dynamic accounts** — Accounts can be added/removed at runtime via Settings page; collector updates without restart.
- **Python import aliasing caveat** — `collector_live_status` must be mutated in-place (`.clear()/.update()`) not reassigned, because other modules import a reference to the original dict.
- **MT4 balance operations** — `OrderType() == 6` in MQL4 and `DEAL_TYPE_BALANCE = 6` in MT5 identify deposits/withdrawals. `profit > 0` = deposit, `profit < 0` = withdrawal.

## API Endpoints

| Endpoint | Description |
|---|---|
| `POST /api/token` | JWT login |
| `GET /api/accounts` | List accounts with live status |
| `POST/PUT/DELETE /api/accounts` | Account CRUD |
| `GET /api/status?account=` | Latest snapshot |
| `GET /api/positions?account=` | Open positions |
| `GET /api/performance?account=` | Aggregated trade stats |
| `GET /api/trades?account=` | Closed trades list (time ASC) |
| `GET /api/history?account=` | Snapshot history for charts |
| `GET /api/calendar?account=&year=&month=` | Daily P/L |
| `GET /api/deposits?account=` | Deposit/withdrawal history |
| `GET /api/overview` | All accounts combined |
| `WS /ws/dashboard?token=` | Real-time updates |
| `POST /api/mt4/push` | MT4 EA data push (API key auth) |

## Environment Variables

Backend requires `backend/.env` (not tracked in git):
```
MT5_ACCOUNTS=[{"id":"main","login":12345,"password":"","server":"Server","terminal_path":"C:\\...\\terminal64.exe","platform":"mt5"}]
SECRET_KEY=<random-string-32-chars-min>
ADMIN_USER=admin
ADMIN_PASS=<strong-password>
MT4_API_KEY=<key-for-ea-webhook>
NGROK_DOMAIN=<your-domain>.ngrok-free.dev
DEMO_MODE=0
```

Frontend uses `NEXT_PUBLIC_API_URL` (set in Vercel or `.env.local`):
```
NEXT_PUBLIC_API_URL=https://<ngrok-domain>
```

## Security
- `.env` files, `start.bat`, and `data.db*` are gitignored — never commit credentials or database files.
- All sensitive values must come from environment variables.
- The ngrok free tier requires the `ngrok-skip-browser-warning` header on all API requests.
