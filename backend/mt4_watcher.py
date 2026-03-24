"""
MT4 File Watcher — reads JSON files written by MonitorEA.mq4
EA writes to: C:/Users/<user>/AppData/Roaming/MetaQuotes/Terminal/Common/Files/monitor_<login>.json
Backend polls these files and updates the in-memory store.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from memory import store
from ws_manager import manager

logger = logging.getLogger(__name__)

# MT4 Common Files folder
COMMON_FILES = os.path.join(
    os.environ.get("APPDATA", ""),
    "MetaQuotes", "Terminal", "Common", "Files"
)


def find_mt4_files() -> list[Path]:
    """Find all monitor_*.json files in MT4 Common Files folder."""
    folder = Path(COMMON_FILES)
    if not folder.exists():
        return []
    return list(folder.glob("monitor_*.json"))


def parse_mt4_file(filepath: Path) -> dict | None:
    """Read and parse a monitor JSON file."""
    try:
        text = filepath.read_text(encoding="utf-8")
        if not text.strip():
            return None
        data = json.loads(text)
        return data
    except (json.JSONDecodeError, OSError) as e:
        logger.debug("Failed to read %s: %s", filepath, e)
        return None


async def mt4_watcher_loop(accounts: list[dict], interval: int = 10):
    """
    Poll MT4 JSON files and update the store.
    `accounts` is a reference to the mutable _accounts list from main.py.
    """
    logger.info("MT4 file watcher started (polling every %ds, folder: %s)", interval, COMMON_FILES)

    # Build login → account_id mapping
    _last_modified: dict[str, float] = {}

    while True:
        try:
            # Rebuild mapping each tick (accounts can change dynamically)
            login_to_aid: dict[int, str] = {}
            for acc in accounts:
                if acc.get("platform") == "mt4":
                    login_to_aid[int(acc.get("login", 0))] = acc["id"]

            if not login_to_aid:
                await asyncio.sleep(interval)
                continue

            files = find_mt4_files()

            for fpath in files:
                # Extract login from filename: monitor_49390811.json
                stem = fpath.stem  # monitor_49390811
                parts = stem.split("_", 1)
                if len(parts) != 2:
                    continue
                try:
                    login = int(parts[1])
                except ValueError:
                    continue

                aid = login_to_aid.get(login)
                if not aid:
                    continue

                # Check if file was modified
                try:
                    mtime = fpath.stat().st_mtime
                except OSError:
                    continue

                if _last_modified.get(str(fpath)) == mtime:
                    continue  # No change
                _last_modified[str(fpath)] = mtime

                # Parse and update
                data = parse_mt4_file(fpath)
                if not data:
                    continue

                info = data.get("account_info", {})
                positions = data.get("positions", [])
                closed_trades = data.get("closed_trades", [])

                balance = info.get("balance", 0)
                equity = info.get("equity", 0)
                floating_pl = round(equity - balance, 2)
                drawdown_pct = round(max(0, (balance - equity) / balance * 100), 2) if balance > 0 else 0

                snapshot = {
                    **info,
                    "floating_pl": floating_pl,
                    "drawdown_pct": drawdown_pct,
                    "positions_count": len(positions),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "_mode": "live",
                }

                store.update_snapshot(aid, snapshot)
                store.update_positions(aid, positions)
                if closed_trades:
                    store.update_closed_trades(aid, closed_trades)

                # Update live status
                from collector import collector_live_status
                if not collector_live_status.get(aid):
                    collector_live_status[aid] = True
                    logger.info("MT4 account '%s' (login %d) now LIVE via file", aid, login)

                # Broadcast via WebSocket
                last_10 = store.get_history(aid)[-10:]
                await manager.broadcast({
                    "type": "update",
                    "account_id": aid,
                    "status": store.get_snapshot(aid),
                    "positions": store.get_positions(aid),
                    "history": last_10,
                })

        except Exception:
            logger.exception("MT4 watcher error")

        await asyncio.sleep(interval)
