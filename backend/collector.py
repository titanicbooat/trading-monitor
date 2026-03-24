"""
MT5 Collector Script — Multi-Account Support
Runs as a background asyncio task inside the FastAPI process.
- Every 30s: fetch account_info + positions for each account → broadcast
- Every 5min: fetch closed trades (last 30 days)
- Falls back to demo mode per-account if MT5 is not available
"""

import asyncio
import json
import logging
import os
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from memory import store
from ws_manager import manager

logger = logging.getLogger(__name__)

DEAL_ENTRY_OUT = 1
DEAL_TYPE_BUY = 0
DEAL_TYPE_SELL = 1
DEAL_TYPE_BALANCE = 6


# ── Account config loading ──────────────────────────────────────────────────

ENV_PATH = os.path.join(os.path.dirname(__file__), ".env")


def load_accounts() -> list[dict[str, Any]]:
    """Load account configs from MT5_ACCOUNTS env var (JSON array)."""
    raw = os.getenv("MT5_ACCOUNTS", "")
    if raw:
        try:
            accounts = json.loads(raw)
            if isinstance(accounts, list) and accounts:
                return accounts
        except json.JSONDecodeError:
            logger.warning("MT5_ACCOUNTS is not valid JSON, using defaults")

    # Fallback defaults for demo mode
    return [
        {"id": "main", "login": 12345678, "password": "", "server": "Demo"},
        {"id": "hedge", "login": 87654321, "password": "", "server": "Demo"},
    ]


def save_accounts_to_env(accounts: list[dict[str, Any]]):
    """Write MT5_ACCOUNTS back to .env file, preserving other vars."""
    lines = []
    found = False

    if os.path.exists(ENV_PATH):
        with open(ENV_PATH, "r") as f:
            for line in f:
                if line.startswith("MT5_ACCOUNTS="):
                    found = True
                    lines.append(f"MT5_ACCOUNTS={json.dumps(accounts)}\n")
                else:
                    lines.append(line)

    if not found:
        lines.append(f"MT5_ACCOUNTS={json.dumps(accounts)}\n")

    with open(ENV_PATH, "w") as f:
        f.writelines(lines)

    # Also update the env var in current process
    os.environ["MT5_ACCOUNTS"] = json.dumps(accounts)


# ── MT5 init ─────────────────────────────────────────────────────────────────

def init_mt5_accounts(accounts: list[dict]) -> dict[str, bool]:
    """
    Test MT5 connectivity for each account. Returns dict of account_id → is_live.
    Each account needs a 'terminal_path' field pointing to its terminal64.exe.
    If DEMO_MODE=1, skip MT5 entirely.
    """
    results: dict[str, bool] = {}

    if os.getenv("DEMO_MODE", "0") == "1":
        logger.info("DEMO_MODE=1 — all accounts will use simulated data")
        for acc in accounts:
            results[acc["id"]] = False
        return results

    try:
        import MetaTrader5 as mt5
    except ImportError:
        logger.warning("MetaTrader5 not available — all accounts demo mode")
        for acc in accounts:
            results[acc["id"]] = False
        return results

    # Test each account (skip MT4 — they use EA push)
    for acc in accounts:
        if acc.get("platform", "mt5") == "mt4":
            results[acc["id"]] = False  # Will be set to True when EA pushes data
            continue

        terminal_path = acc.get("terminal_path", "")
        login_num = int(acc.get("login", 0))
        password = acc.get("password", "")
        server = acc.get("server", "")

        if not terminal_path:
            logger.warning("Account '%s': no terminal_path — demo mode", acc["id"])
            results[acc["id"]] = False
            continue

        try:
            # Initialize with specific terminal path
            if not mt5.initialize(terminal_path):
                logger.warning("Account '%s': MT5 init failed (%s) — demo mode", acc["id"], mt5.last_error())
                results[acc["id"]] = False
                continue

            if login_num:
                authorized = mt5.login(login_num, password=password, server=server)
                if not authorized:
                    logger.warning("Account '%s': login failed (%s) — demo mode", acc["id"], mt5.last_error())
                    mt5.shutdown()
                    results[acc["id"]] = False
                    continue

            info = mt5.account_info()
            if info:
                logger.info("Account '%s' (login %d) — MT5 connected, balance=%.2f",
                            acc["id"], info.login, info.balance)
            mt5.shutdown()
            results[acc["id"]] = True

        except Exception as e:
            logger.warning("Account '%s': error %s — demo mode", acc["id"], e)
            results[acc["id"]] = False

    return results


# ── Real MT5 fetch functions ─────────────────────────────────────────────────

def _mt5_connect(acc: dict) -> bool:
    """Initialize MT5 terminal and login for a specific account."""
    import MetaTrader5 as mt5
    terminal_path = acc.get("terminal_path", "")
    if not terminal_path:
        return False
    if not mt5.initialize(terminal_path):
        return False
    login_num = int(acc.get("login", 0))
    if login_num:
        if not mt5.login(login_num, password=acc.get("password", ""), server=acc.get("server", "")):
            mt5.shutdown()
            return False
    return True


def _mt5_disconnect():
    import MetaTrader5 as mt5
    mt5.shutdown()


def fetch_account_snapshot_mt5() -> dict | None:
    import MetaTrader5 as mt5
    info = mt5.account_info()
    if info is None:
        return None
    info_dict = info._asdict()
    balance = info_dict.get("balance", 0)
    equity = info_dict.get("equity", 0)
    floating_pl = equity - balance
    drawdown_pct = ((balance - equity) / balance * 100) if balance > 0 else 0.0
    positions = mt5.positions_get()
    return {
        **info_dict,
        "floating_pl": round(floating_pl, 2),
        "drawdown_pct": round(drawdown_pct, 2),
        "positions_count": len(positions) if positions else 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def fetch_positions_mt5() -> list[dict]:
    import MetaTrader5 as mt5
    positions = mt5.positions_get()
    if positions is None:
        return []
    result = []
    for p in positions:
        d = p._asdict()
        if "time" in d:
            d["time"] = datetime.fromtimestamp(d["time"], tz=timezone.utc).isoformat()
        if "time_update" in d:
            d["time_update"] = datetime.fromtimestamp(d["time_update"], tz=timezone.utc).isoformat()
        result.append(d)
    return result


def fetch_closed_trades_mt5() -> list[dict]:
    import MetaTrader5 as mt5
    now = datetime.now(timezone.utc)
    deals = mt5.history_deals_get(now - timedelta(days=30), now)
    if deals is None:
        return []
    result = []
    for deal in deals:
        d = deal._asdict()
        if d.get("entry") != DEAL_ENTRY_OUT:
            continue
        if d.get("type") not in (DEAL_TYPE_BUY, DEAL_TYPE_SELL):
            continue
        if "time" in d:
            d["time"] = datetime.fromtimestamp(d["time"], tz=timezone.utc).isoformat()
        result.append(d)
    return result


def fetch_balance_deals_mt5() -> list[dict]:
    """Fetch deposit/withdrawal deals from MT5 (DEAL_TYPE_BALANCE)."""
    import MetaTrader5 as mt5
    now = datetime.now(timezone.utc)
    deals = mt5.history_deals_get(now - timedelta(days=90), now)
    if deals is None:
        return []
    result = []
    for deal in deals:
        d = deal._asdict()
        if d.get("type") != DEAL_TYPE_BALANCE:
            continue
        profit = d.get("profit", 0)
        if profit == 0:
            continue
        time_val = d.get("time")
        time_str = datetime.fromtimestamp(time_val, tz=timezone.utc).isoformat() if time_val else ""
        result.append({
            "ticket": d.get("ticket", 0),
            "deal_type": "deposit" if profit > 0 else "withdrawal",
            "amount": round(abs(profit), 2),
            "time": time_str,
            "comment": d.get("comment", ""),
        })
    return result


# ── Demo mode — per-account simulated data ───────────────────────────────────

_demo_state: dict[str, dict] = {}

DEMO_PRESETS = {
    0: {
        "balance": 10000.0, "login": 12345678, "server": "Demo-Server",
        "leverage": 100, "currency": "USD",
        "positions": [
            {"ticket": 100001, "symbol": "EURUSD", "type": 0, "volume": 0.10,
             "price_open": 1.08520, "price_current": 1.08650, "sl": 1.08200, "tp": 1.09000, "profit": 13.00},
            {"ticket": 100002, "symbol": "XAUUSD", "type": 1, "volume": 0.05,
             "price_open": 2650.50, "price_current": 2645.30, "sl": 2665.00, "tp": 2630.00, "profit": 26.00},
            {"ticket": 100003, "symbol": "GBPUSD", "type": 0, "volume": 0.20,
             "price_open": 1.26300, "price_current": 1.26180, "sl": 1.26000, "tp": 1.26800, "profit": -24.00},
        ],
    },
    1: {
        "balance": 25000.0, "login": 87654321, "server": "Demo-Server-2",
        "leverage": 200, "currency": "USD",
        "positions": [
            {"ticket": 200001, "symbol": "USDJPY", "type": 1, "volume": 0.30,
             "price_open": 155.820, "price_current": 155.640, "sl": 156.200, "tp": 155.000, "profit": 34.60},
            {"ticket": 200002, "symbol": "BTCUSD", "type": 0, "volume": 0.01,
             "price_open": 67500.00, "price_current": 68200.00, "sl": 66000.00, "tp": 72000.00, "profit": 70.00},
        ],
    },
    2: {
        "balance": 50000.0, "login": 11223344, "server": "Demo-Server-3",
        "leverage": 500, "currency": "USD",
        "positions": [
            {"ticket": 300001, "symbol": "EURUSD", "type": 1, "volume": 1.00,
             "price_open": 1.09100, "price_current": 1.08950, "sl": 1.09500, "tp": 1.08500, "profit": 150.00},
        ],
    },
}


def _get_demo_state(account_id: str, idx: int, acc_config: dict) -> dict:
    """Get or create demo state for an account."""
    if account_id not in _demo_state:
        preset = DEMO_PRESETS.get(idx % len(DEMO_PRESETS), DEMO_PRESETS[0])
        _demo_state[account_id] = {
            "balance": preset["balance"],
            "equity": preset["balance"],
            "login": acc_config.get("login", preset["login"]),
            "server": acc_config.get("server", preset["server"]),
            "leverage": preset["leverage"],
            "currency": preset["currency"],
            "positions": [
                {**p, "time": datetime.now(timezone.utc).isoformat()}
                for p in preset["positions"]
            ],
            "closed_trades": [
                {
                    "ticket": 90000 + idx * 1000 + i,
                    "symbol": random.choice(["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD"]),
                    "type": random.choice([0, 1]),
                    "volume": round(random.uniform(0.01, 0.5), 2),
                    "profit": round(random.uniform(-50, 80), 2),
                    "entry": 1,
                    "time": (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 29))).isoformat(),
                }
                for i in range(20 + idx * 5)
            ],
        }
    return _demo_state[account_id]


def fetch_account_snapshot_demo(account_id: str, idx: int, acc_config: dict) -> dict:
    state = _get_demo_state(account_id, idx, acc_config)
    state["equity"] = state["balance"] + random.uniform(-200, 250)
    floating_pl = round(state["equity"] - state["balance"], 2)
    drawdown_pct = round(max(0, (state["balance"] - state["equity"]) / state["balance"] * 100), 2)

    return {
        "login": state["login"],
        "server": state["server"],
        "balance": round(state["balance"], 2),
        "equity": round(state["equity"], 2),
        "margin": round(random.uniform(200, 1500), 2),
        "margin_free": round(state["equity"] - random.uniform(200, 1500), 2),
        "margin_level": round(random.uniform(500, 5000), 2),
        "profit": floating_pl,
        "floating_pl": floating_pl,
        "drawdown_pct": drawdown_pct,
        "positions_count": len(state["positions"]),
        "currency": state["currency"],
        "leverage": state["leverage"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def fetch_positions_demo(account_id: str, idx: int, acc_config: dict) -> list[dict]:
    state = _get_demo_state(account_id, idx, acc_config)
    for p in state["positions"]:
        is_forex = "XAU" not in p["symbol"] and "BTC" not in p["symbol"]
        delta = random.uniform(-0.00050, 0.00050) if is_forex else random.uniform(-5, 5)
        decimals = 5 if is_forex else 2
        p["price_current"] = round(p["price_current"] + delta, decimals)
        diff = p["price_current"] - p["price_open"]
        multiplier = 100000 if is_forex else 100
        p["profit"] = round(diff * p["volume"] * multiplier * (1 if p["type"] == 0 else -1), 2)
    return list(state["positions"])


def fetch_closed_trades_demo(account_id: str, idx: int, acc_config: dict) -> list[dict]:
    state = _get_demo_state(account_id, idx, acc_config)
    return list(state["closed_trades"])


def fetch_balance_deals_demo(account_id: str, idx: int, acc_config: dict) -> list[dict]:
    """Generate demo deposit/withdrawal history."""
    state = _get_demo_state(account_id, idx, acc_config)
    if "balance_deals" not in state:
        deals = []
        # Initial deposit
        deals.append({
            "ticket": 80000 + idx * 100,
            "deal_type": "deposit",
            "amount": state["balance"],
            "time": (datetime.now(timezone.utc) - timedelta(days=60)).isoformat(),
            "comment": "Initial deposit",
        })
        # A few more deposits/withdrawals
        for i in range(3 + idx):
            is_deposit = random.random() > 0.3
            deals.append({
                "ticket": 80001 + idx * 100 + i,
                "deal_type": "deposit" if is_deposit else "withdrawal",
                "amount": round(random.uniform(100, 2000), 2),
                "time": (datetime.now(timezone.utc) - timedelta(days=random.randint(1, 50))).isoformat(),
                "comment": "Deposit" if is_deposit else "Withdrawal",
            })
        state["balance_deals"] = deals
    return list(state["balance_deals"])


# ── Main collector loop ──────────────────────────────────────────────────────

# Shared mutable state for dynamic account management
collector_accounts: list[dict] = []
collector_live_status: dict[str, bool] = {}


def update_collector_accounts(accounts: list[dict], live_status: dict[str, bool]):
    """Update the accounts the collector iterates over (called from API)."""
    global collector_accounts
    collector_accounts = list(accounts)
    # Mutate in-place so all importers see the same dict
    collector_live_status.clear()
    collector_live_status.update(live_status)
    store.set_account_ids([a["id"] for a in accounts])
    logger.info("Collector accounts updated: %s", [a["id"] for a in accounts])


async def collector_loop(accounts: list[dict], live_status: dict[str, bool]):
    """Main collector loop — iterates all accounts each tick.
    Always tries real MT5 first (if terminal_path exists), falls back to demo only on failure.
    """
    global collector_accounts
    collector_accounts = list(accounts)
    # Mutate in-place so all importers see the same dict
    collector_live_status.clear()
    collector_live_status.update(live_status)

    tick_count = 0
    SNAPSHOT_INTERVAL = 30
    HISTORY_INTERVAL = 300

    store.set_account_ids([a["id"] for a in accounts])

    is_demo_mode = os.getenv("DEMO_MODE", "0") == "1"
    has_mt5 = False
    if not is_demo_mode:
        try:
            import MetaTrader5 as mt5  # noqa: F401
            has_mt5 = True
        except ImportError:
            logger.warning("MetaTrader5 module not available — all accounts demo mode")

    while True:
        try:
            current_accounts = list(collector_accounts)

            for idx, acc in enumerate(current_accounts):
                # MT4 accounts receive data via EA push, skip polling
                if acc.get("platform", "mt5") == "mt4":
                    continue

                aid = acc["id"]
                terminal_path = acc.get("terminal_path", "")
                used_live = False

                # Always try real MT5 first if possible
                if has_mt5 and not is_demo_mode and terminal_path:
                    if _mt5_connect(acc):
                        snapshot = fetch_account_snapshot_mt5()
                        positions = fetch_positions_mt5()

                        if tick_count % (HISTORY_INTERVAL // SNAPSHOT_INTERVAL) == 0:
                            trades = fetch_closed_trades_mt5()
                            if trades:
                                store.update_closed_trades(aid, trades)
                            bal_deals = fetch_balance_deals_mt5()
                            if bal_deals:
                                store.update_balance_deals(aid, bal_deals)

                        _mt5_disconnect()
                        used_live = True

                        # Update live status if it was previously false
                        if not collector_live_status.get(aid, False):
                            collector_live_status[aid] = True
                            logger.info("Account '%s': MT5 connected successfully (now LIVE)", aid)
                    else:
                        logger.warning("Account '%s': MT5 connect failed this tick — no data", aid)
                        collector_live_status[aid] = False

                if not used_live:
                    # No demo fallback — skip this account, wait for real connection
                    snapshot = None
                    positions = []

                if snapshot:
                    # Tag snapshot with connection mode
                    snapshot["_mode"] = "live" if used_live else "demo"
                    store.update_snapshot(aid, snapshot)
                store.update_positions(aid, positions)

                # Broadcast per-account update
                last_10 = store.get_history(aid)[-10:]
                payload = {
                    "type": "update",
                    "account_id": aid,
                    "status": store.get_snapshot(aid),
                    "positions": store.get_positions(aid),
                    "history": last_10,
                }
                await manager.broadcast(payload)

            if tick_count % (HISTORY_INTERVAL // SNAPSHOT_INTERVAL) == 0:
                for acc in current_accounts:
                    mode = "LIVE" if collector_live_status.get(acc["id"]) else "DEMO"
                    logger.info("Account '%s' [%s]: %d closed trades in memory",
                                acc["id"], mode, len(store.get_closed_trades(acc["id"])))

            tick_count += 1

        except Exception:
            logger.exception("Collector tick error")

        await asyncio.sleep(SNAPSHOT_INTERVAL)
