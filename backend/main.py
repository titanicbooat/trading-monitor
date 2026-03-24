"""
FastAPI backend for MT5 Account Monitor — Multi-Account Support.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

from auth import authenticate_user, create_access_token, get_current_user, verify_token
from memory import store
from ws_manager import manager
from collector import (
    load_accounts, init_mt5_accounts, collector_loop,
    save_accounts_to_env, update_collector_accounts, collector_live_status,
    _demo_state,
)
from mt4_watcher import mt4_watcher_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="MT5 Account Monitor", version="2.0.0")

_cors_origins = [
    "http://localhost:3000",
]
# Add extra origins from env (comma-separated): Vercel domain, ngrok, etc.
_extra_origins = os.getenv("ALLOWED_ORIGINS", "")
if _extra_origins:
    _cors_origins.extend([o.strip() for o in _extra_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Module-level accounts config (populated on startup)
_accounts: list[dict] = []


def _default_account_id() -> str:
    return _accounts[0]["id"] if _accounts else "main"


# ── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    global _accounts
    _accounts = load_accounts()
    logger.info("Loaded %d account(s): %s", len(_accounts), [a["id"] for a in _accounts])

    live_status = init_mt5_accounts(_accounts)
    asyncio.create_task(collector_loop(_accounts, live_status))
    logger.info("Collector background task started")

    # Start MT4 file watcher (polls JSON files written by MT4 EA)
    asyncio.create_task(mt4_watcher_loop(_accounts, interval=10))
    logger.info("MT4 file watcher started")


# ── Auth ─────────────────────────────────────────────────────────────────────

class TokenRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@app.post("/api/token", response_model=TokenResponse)
async def login(body: TokenRequest):
    if not authenticate_user(body.username, body.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(body.username))


# ── Account Management ───────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    id: str
    login: int
    password: str = ""
    server: str = ""
    terminal_path: str = ""
    platform: str = "mt5"  # "mt5" or "mt4"


@app.get("/api/terminals")
async def get_terminals(user: str = Depends(get_current_user)):
    """Auto-detect running MT5 terminals on this machine."""
    import subprocess
    terminals = []
    try:
        result = subprocess.run(
            ["powershell.exe", "-Command",
             "(Get-Process terminal64 -ErrorAction SilentlyContinue).Path"],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().splitlines():
            path = line.strip()
            if path and path not in terminals:
                terminals.append(path)
    except Exception as e:
        logger.warning("Terminal detection error: %s", e)
    return terminals


@app.get("/api/accounts")
async def get_accounts(user: str = Depends(get_current_user)):
    """Return list of available accounts with full details + live/demo status."""
    return [
        {
            "id": acc["id"],
            "login": acc.get("login", 0),
            "server": acc.get("server", ""),
            "terminal_path": acc.get("terminal_path", ""),
            "platform": acc.get("platform", "mt5"),
            "label": f"{acc['id'].upper()} ({acc.get('login', '?')})",
            "is_live": collector_live_status.get(acc["id"], False),
        }
        for acc in _accounts
    ]


@app.post("/api/accounts", status_code=201)
async def add_account(body: AccountCreate, user: str = Depends(get_current_user)):
    """Add a new MT4/MT5 account."""
    if body.platform not in ("mt4", "mt5"):
        raise HTTPException(status_code=400, detail="Platform must be 'mt4' or 'mt5'")

    for acc in _accounts:
        if acc["id"] == body.id:
            raise HTTPException(status_code=400, detail=f"Account '{body.id}' already exists")

    new_acc = {
        "id": body.id,
        "login": body.login,
        "password": body.password,
        "server": body.server,
        "terminal_path": body.terminal_path,
        "platform": body.platform,
    }
    _accounts.append(new_acc)
    save_accounts_to_env(_accounts)

    live_status = dict(collector_live_status)
    live_status[body.id] = False

    # Only test MT5 connectivity (MT4 uses EA push, no Python lib)
    if body.platform == "mt5" and os.getenv("DEMO_MODE", "0") != "1" and body.terminal_path:
        try:
            import MetaTrader5 as mt5
            if mt5.initialize(body.terminal_path):
                if mt5.login(body.login, password=body.password, server=body.server):
                    live_status[body.id] = True
                    logger.info("New account '%s' connected to MT5", body.id)
                mt5.shutdown()
        except Exception:
            pass

    update_collector_accounts(_accounts, live_status)

    logger.info("Account added: %s (login %d, platform %s)", body.id, body.login, body.platform)
    return {"detail": f"Account '{body.id}' added", "account": new_acc}


@app.put("/api/accounts/{account_id}")
async def update_account(account_id: str, body: AccountCreate, user: str = Depends(get_current_user)):
    """Update an existing MT5 account."""
    for i, acc in enumerate(_accounts):
        if acc["id"] == account_id:
            # If id changed, check for conflicts
            if body.id != account_id:
                for other in _accounts:
                    if other["id"] == body.id:
                        raise HTTPException(status_code=400, detail=f"Account '{body.id}' already exists")
                # Clean up old data
                store.remove_account(account_id)
                if account_id in _demo_state:
                    del _demo_state[account_id]

            _accounts[i] = {
                "id": body.id,
                "login": body.login,
                "password": body.password,
                "server": body.server,
                "terminal_path": body.terminal_path,
                "platform": body.platform,
            }

            save_accounts_to_env(_accounts)

            live_status = dict(collector_live_status)
            live_status.pop(account_id, None)
            live_status[body.id] = False

            if body.platform == "mt5" and os.getenv("DEMO_MODE", "0") != "1" and body.terminal_path:
                try:
                    import MetaTrader5 as mt5
                    if mt5.initialize(body.terminal_path):
                        if mt5.login(body.login, password=body.password, server=body.server):
                            live_status[body.id] = True
                        mt5.shutdown()
                except Exception:
                    pass

            update_collector_accounts(_accounts, live_status)

            logger.info("Account updated: %s → %s", account_id, body.id)
            return {"detail": f"Account '{body.id}' updated"}

    raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")


@app.delete("/api/accounts/{account_id}")
async def delete_account(account_id: str, user: str = Depends(get_current_user)):
    """Delete an MT5 account."""
    if len(_accounts) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last account")

    for i, acc in enumerate(_accounts):
        if acc["id"] == account_id:
            _accounts.pop(i)
            save_accounts_to_env(_accounts)

            # Clean up memory + demo state
            store.remove_account(account_id)
            if account_id in _demo_state:
                del _demo_state[account_id]

            # Update collector
            live_status = dict(collector_live_status)
            live_status.pop(account_id, None)
            update_collector_accounts(_accounts, live_status)

            logger.info("Account deleted: %s", account_id)
            return {"detail": f"Account '{account_id}' deleted"}

    raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found")


# ── Protected REST endpoints ─────────────────────────────────────────────────

@app.get("/api/status")
async def get_status(
    user: str = Depends(get_current_user),
    account: str = Query(None),
):
    aid = account or _default_account_id()
    snapshot = store.get_snapshot(aid)
    if not snapshot:
        return {"detail": "No data yet — collector may still be initializing"}
    return snapshot


@app.get("/api/positions")
async def get_positions(
    user: str = Depends(get_current_user),
    account: str = Query(None),
):
    return store.get_positions(account or _default_account_id())


@app.get("/api/performance")
async def get_performance(
    user: str = Depends(get_current_user),
    account: str = Query(None),
):
    trades = store.get_closed_trades(account or _default_account_id())
    if not trades:
        return {
            "total_trades": 0, "winning_trades": 0, "losing_trades": 0,
            "win_rate": 0.0, "profit_factor": 0.0, "total_profit": 0.0,
            "total_loss": 0.0, "net_profit": 0.0, "average_profit": 0.0,
            "average_loss": 0.0, "largest_win": 0.0, "largest_loss": 0.0,
        }

    profits = [t.get("profit", 0) for t in trades]
    wins = [p for p in profits if p > 0]
    losses = [p for p in profits if p < 0]
    total_profit = sum(wins)
    total_loss = abs(sum(losses))

    return {
        "total_trades": len(trades),
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate": round(len(wins) / len(trades) * 100, 2) if trades else 0,
        "profit_factor": round(total_profit / total_loss, 2) if total_loss > 0 else float("inf"),
        "total_profit": round(total_profit, 2),
        "total_loss": round(total_loss, 2),
        "net_profit": round(total_profit - total_loss, 2),
        "average_profit": round(total_profit / len(wins), 2) if wins else 0,
        "average_loss": round(total_loss / len(losses), 2) if losses else 0,
        "largest_win": round(max(wins), 2) if wins else 0,
        "largest_loss": round(min(profits), 2) if losses else 0,
    }


@app.get("/api/history")
async def get_history(
    user: str = Depends(get_current_user),
    account: str = Query(None),
):
    return store.get_history(account or _default_account_id())


# ── Calendar (daily P/L) ─────────────────────────────────────────────────────

@app.get("/api/calendar")
async def get_calendar(
    user: str = Depends(get_current_user),
    account: str = Query(None),
    year: int = Query(None),
    month: int = Query(None),
):
    """Return daily P/L aggregated from closed trades for a given month."""
    now = datetime.now(timezone.utc)
    if not year:
        year = now.year
    if not month:
        month = now.month

    aid = account or _default_account_id()
    trades = store.get_closed_trades(aid)

    # Aggregate by date
    daily: dict[str, dict] = {}
    for t in trades:
        time_str = t.get("time", "")
        if not time_str:
            continue
        try:
            # Handle both ISO format and "YYYY.MM.DD HH:MM:SS" (MT4)
            trade_time = datetime.fromisoformat(time_str.replace(".", "-", 2))
        except (ValueError, TypeError):
            continue

        if trade_time.year != year or trade_time.month != month:
            continue

        date_key = trade_time.strftime("%Y-%m-%d")
        if date_key not in daily:
            daily[date_key] = {"date": date_key, "profit": 0.0, "trades": 0}
        daily[date_key]["profit"] += t.get("profit", 0)
        daily[date_key]["trades"] += 1

    days = sorted(daily.values(), key=lambda d: d["date"])
    for d in days:
        d["profit"] = round(d["profit"], 2)

    monthly_pl = round(sum(d["profit"] for d in days), 2)
    monthly_trades = sum(d["trades"] for d in days)

    # Get currency from snapshot
    snapshot = store.get_snapshot(aid)
    currency = snapshot.get("currency", "USD") if snapshot else "USD"

    return {
        "year": year,
        "month": month,
        "currency": currency,
        "monthly_pl": monthly_pl,
        "monthly_trades": monthly_trades,
        "days": days,
    }


# ── Deposits / Withdrawals ────────────────────────────────────────────────────

@app.get("/api/deposits")
async def get_deposits(
    user: str = Depends(get_current_user),
    account: str = Query(None),
):
    """Return deposit/withdrawal history for an account."""
    aid = account or _default_account_id()
    deals = store.get_balance_deals(aid)

    total_deposit = sum(d["amount"] for d in deals if d.get("deal_type") == "deposit")
    total_withdrawal = sum(d["amount"] for d in deals if d.get("deal_type") == "withdrawal")

    # Get currency from snapshot
    snapshot = store.get_snapshot(aid)
    currency = snapshot.get("currency", "USD") if snapshot else "USD"

    return {
        "deals": deals,
        "currency": currency,
        "summary": {
            "total_deposit": round(total_deposit, 2),
            "total_withdrawal": round(total_withdrawal, 2),
            "net": round(total_deposit - total_withdrawal, 2),
        },
    }


# ── Overview (all accounts combined) ──────────────────────────────────────────

@app.get("/api/overview")
async def get_overview(user: str = Depends(get_current_user)):
    """Return combined status, positions, performance, and per-account summaries."""
    account_ids = store.get_account_ids()

    # Per-account summaries
    account_summaries = []
    total_balance = 0.0
    total_equity = 0.0
    total_floating = 0.0
    total_margin = 0.0
    total_margin_free = 0.0
    total_positions = 0
    total_deposit = 0.0
    total_withdrawal = 0.0
    all_positions = []
    all_trades = []

    for aid in account_ids:
        snap = store.get_snapshot(aid)
        positions = store.get_positions(aid)
        trades = store.get_closed_trades(aid)

        currency = snap.get("currency", "USD")
        # Convert USC (US cents) to USD for combined totals
        usc_div = 100.0 if currency == "USC" else 1.0

        bal = snap.get("balance", 0) / usc_div
        eq = snap.get("equity", 0) / usc_div
        fl = snap.get("floating_pl", 0) / usc_div
        mg = snap.get("margin", 0) / usc_div
        mf = snap.get("margin_free", 0) / usc_div
        pc = snap.get("positions_count", 0)

        total_balance += bal
        total_equity += eq
        total_floating += fl
        total_margin += mg
        total_margin_free += mf
        total_positions += pc

        # Aggregate deposit/withdrawal totals (converted to USD)
        bal_deals = store.get_balance_deals(aid)
        acc_dep = sum(d["amount"] for d in bal_deals if d.get("deal_type") == "deposit") / usc_div
        acc_wd = sum(d["amount"] for d in bal_deals if d.get("deal_type") == "withdrawal") / usc_div
        total_deposit += acc_dep
        total_withdrawal += acc_wd

        # Tag positions with account_id
        for p in positions:
            all_positions.append({**p, "account_id": aid})

        # Convert trade profits from USC to USD for combined performance
        for t in trades:
            converted = dict(t)
            if usc_div != 1.0:
                converted["profit"] = t.get("profit", 0) / usc_div
            all_trades.append(converted)

        dd = snap.get("drawdown_pct", 0)
        acc_cfg = next((a for a in _accounts if a["id"] == aid), {})
        account_summaries.append({
            "id": aid,
            "currency": currency,
            "balance": round(snap.get("balance", 0), 2),
            "equity": round(snap.get("equity", 0), 2),
            "floating_pl": round(snap.get("floating_pl", 0), 2),
            "drawdown_pct": round(dd, 2),
            "positions_count": pc,
            "total_trades": len(trades),
            "is_live": collector_live_status.get(aid, False),
            "mode": snap.get("_mode", "demo"),
            "platform": acc_cfg.get("platform", "mt5"),
        })

    # Combined drawdown
    combined_dd = ((total_balance - total_equity) / total_balance * 100) if total_balance > 0 else 0
    combined_dd = max(0, combined_dd)

    # Combined performance
    profits = [t.get("profit", 0) for t in all_trades]
    wins = [p for p in profits if p > 0]
    losses = [p for p in profits if p < 0]
    tp = sum(wins)
    tl = abs(sum(losses))

    combined_perf = {
        "total_trades": len(all_trades),
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate": round(len(wins) / len(all_trades) * 100, 2) if all_trades else 0,
        "profit_factor": round(tp / tl, 2) if tl > 0 else float("inf"),
        "total_profit": round(tp, 2),
        "total_loss": round(tl, 2),
        "net_profit": round(tp - tl, 2),
        "average_profit": round(tp / len(wins), 2) if wins else 0,
        "average_loss": round(tl / len(losses), 2) if losses else 0,
        "largest_win": round(max(wins), 2) if wins else 0,
        "largest_loss": round(min(profits), 2) if losses else 0,
    }

    return {
        "combined_status": {
            "balance": round(total_balance, 2),
            "equity": round(total_equity, 2),
            "floating_pl": round(total_floating, 2),
            "drawdown_pct": round(combined_dd, 2),
            "margin": round(total_margin, 2),
            "margin_free": round(total_margin_free, 2),
            "positions_count": total_positions,
            "accounts_count": len(account_ids),
            "connected_count": sum(1 for a in account_summaries if a.get("is_live")),
            "total_deposit": round(total_deposit, 2),
            "total_withdrawal": round(total_withdrawal, 2),
        },
        "accounts": account_summaries,
        "positions": all_positions,
        "performance": combined_perf,
    }


# ── MT4 Push Endpoint ─────────────────────────────────────────────────────────

class MT4PushData(BaseModel):
    api_key: str
    account_id: str
    account_info: dict
    positions: list[dict] = []
    closed_trades: list[dict] = []


@app.post("/api/mt4/push")
async def mt4_push(body: MT4PushData):
    """Receive data pushed from MT4 Expert Advisor."""
    expected_key = os.getenv("MT4_API_KEY", "")
    if not expected_key or body.api_key != expected_key:
        raise HTTPException(status_code=403, detail="Invalid API key")

    # Verify account exists and is MT4
    acc = next((a for a in _accounts if a["id"] == body.account_id), None)
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    if acc.get("platform", "mt5") != "mt4":
        raise HTTPException(status_code=400, detail="Account is not MT4 type")

    info = body.account_info
    balance = info.get("balance", 0)
    equity = info.get("equity", 0)
    floating_pl = round(equity - balance, 2)
    drawdown_pct = round(max(0, (balance - equity) / balance * 100), 2) if balance > 0 else 0

    snapshot = {
        **info,
        "floating_pl": floating_pl,
        "drawdown_pct": drawdown_pct,
        "positions_count": len(body.positions),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "_mode": "live",
    }

    store.update_snapshot(body.account_id, snapshot)
    store.update_positions(body.account_id, body.positions)
    if body.closed_trades:
        store.update_closed_trades(body.account_id, body.closed_trades)

    # Mark as live
    collector_live_status[body.account_id] = True

    # Broadcast via WebSocket
    last_10 = store.get_history(body.account_id)[-10:]
    await manager.broadcast({
        "type": "update",
        "account_id": body.account_id,
        "status": store.get_snapshot(body.account_id),
        "positions": store.get_positions(body.account_id),
        "history": last_10,
    })

    return {"detail": "OK"}


@app.get("/api/mt4/ea-code")
async def get_mt4_ea_code(user: str = Depends(get_current_user)):
    """Return the MQL4 EA source code for download."""
    ea_path = os.path.join(os.path.dirname(__file__), "MonitorEA.mq4")
    if not os.path.exists(ea_path):
        raise HTTPException(status_code=404, detail="EA file not found")
    with open(ea_path, "r", encoding="utf-8") as f:
        code = f.read()
    return PlainTextResponse(code, media_type="text/plain", headers={
        "Content-Disposition": "attachment; filename=MonitorEA.mq4"
    })


@app.get("/api/mt4/setup-info")
async def get_mt4_setup_info(user: str = Depends(get_current_user)):
    """Return MT4 setup info for frontend display."""
    api_key = os.getenv("MT4_API_KEY", "")
    return {
        "api_key": api_key,
        "push_url": "http://localhost:8001/api/mt4/push",
        "has_api_key": bool(api_key),
    }


# ── WebSocket ────────────────────────────────────────────────────────────────

@app.websocket("/ws/dashboard")
async def ws_dashboard(ws: WebSocket, token: str = Query(...)):
    try:
        verify_token(token)
    except HTTPException:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)
