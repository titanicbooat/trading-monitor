"""
Persistent storage for MT5 account data.
Ephemeral data (latest snapshot, positions) in RAM.
Historical data (closed trades, balance deals, snapshots) in SQLite.
Thread-safe via threading.Lock.
"""

import json
import os
import sqlite3
import threading
from collections import defaultdict
from typing import Any

DB_PATH = os.path.join(os.path.dirname(__file__), "data.db")

# Snapshot history: keep max per account, cleanup every N inserts
SNAPSHOTS_MAX = 10_000
SNAPSHOTS_CLEANUP_INTERVAL = 100


class MemoryStore:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._data_lock = threading.Lock()
        self._account_ids: list[str] = []

        # Ephemeral (RAM only)
        self.latest_snapshot: dict[str, dict[str, Any]] = {}
        self.current_positions: dict[str, list[dict[str, Any]]] = defaultdict(list)

        # SQLite for historical data
        self._conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._create_tables()

        # Counter for periodic snapshot cleanup
        self._snapshot_insert_count: dict[str, int] = defaultdict(int)

        self._initialized = True

    def _create_tables(self):
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS closed_trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id TEXT NOT NULL,
                ticket INTEGER NOT NULL,
                data TEXT NOT NULL,
                time_value TEXT NOT NULL,
                profit REAL NOT NULL DEFAULT 0,
                UNIQUE(account_id, ticket)
            );
            CREATE INDEX IF NOT EXISTS idx_ct_account_time
                ON closed_trades(account_id, time_value DESC);

            CREATE TABLE IF NOT EXISTS balance_deals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id TEXT NOT NULL,
                ticket INTEGER NOT NULL,
                data TEXT NOT NULL,
                time_value TEXT NOT NULL,
                deal_type TEXT NOT NULL,
                amount REAL NOT NULL DEFAULT 0,
                UNIQUE(account_id, ticket)
            );
            CREATE INDEX IF NOT EXISTS idx_bd_account_time
                ON balance_deals(account_id, time_value DESC);

            CREATE TABLE IF NOT EXISTS snapshots_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id TEXT NOT NULL,
                data TEXT NOT NULL,
                timestamp TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sh_account_ts
                ON snapshots_history(account_id, timestamp);
        """)
        self._conn.commit()

    # ── Account IDs ───────────────────────────────────────────────────────

    def set_account_ids(self, ids: list[str]):
        with self._data_lock:
            self._account_ids = list(ids)

    def get_account_ids(self) -> list[str]:
        with self._data_lock:
            return list(self._account_ids)

    # ── Snapshot (ephemeral in RAM + history in SQLite) ────────────────────

    def update_snapshot(self, account_id: str, snapshot: dict[str, Any]):
        with self._data_lock:
            self.latest_snapshot[account_id] = snapshot
            self._conn.execute(
                "INSERT INTO snapshots_history (account_id, data, timestamp) VALUES (?, ?, ?)",
                (account_id, json.dumps(snapshot, default=str), snapshot.get("timestamp", "")),
            )
            self._conn.commit()

            # Periodic cleanup
            self._snapshot_insert_count[account_id] += 1
            if self._snapshot_insert_count[account_id] >= SNAPSHOTS_CLEANUP_INTERVAL:
                self._snapshot_insert_count[account_id] = 0
                self._conn.execute("""
                    DELETE FROM snapshots_history WHERE account_id = ? AND id NOT IN (
                        SELECT id FROM snapshots_history WHERE account_id = ?
                        ORDER BY timestamp DESC LIMIT ?
                    )
                """, (account_id, account_id, SNAPSHOTS_MAX))
                self._conn.commit()

    def get_snapshot(self, account_id: str) -> dict[str, Any]:
        with self._data_lock:
            return self.latest_snapshot.get(account_id, {}).copy()

    # ── Positions (ephemeral in RAM) ──────────────────────────────────────

    def update_positions(self, account_id: str, positions: list[dict[str, Any]]):
        with self._data_lock:
            self.current_positions[account_id] = positions

    def get_positions(self, account_id: str) -> list[dict[str, Any]]:
        with self._data_lock:
            return list(self.current_positions.get(account_id, []))

    # ── Closed Trades (SQLite) ────────────────────────────────────────────

    def update_closed_trades(self, account_id: str, trades: list[dict[str, Any]]):
        with self._data_lock:
            for trade in trades:
                self._conn.execute(
                    "INSERT OR IGNORE INTO closed_trades (account_id, ticket, data, time_value, profit) VALUES (?, ?, ?, ?, ?)",
                    (account_id, trade["ticket"], json.dumps(trade, default=str),
                     trade.get("time", ""), trade.get("profit", 0)),
                )
            self._conn.commit()

    def get_closed_trades(self, account_id: str) -> list[dict[str, Any]]:
        with self._data_lock:
            rows = self._conn.execute(
                "SELECT data FROM closed_trades WHERE account_id = ? ORDER BY time_value DESC",
                (account_id,),
            ).fetchall()
            return [json.loads(row[0]) for row in rows]

    # ── Balance Deals (SQLite) ────────────────────────────────────────────

    def update_balance_deals(self, account_id: str, deals: list[dict[str, Any]]):
        with self._data_lock:
            for deal in deals:
                self._conn.execute(
                    "INSERT OR IGNORE INTO balance_deals (account_id, ticket, data, time_value, deal_type, amount) VALUES (?, ?, ?, ?, ?, ?)",
                    (account_id, deal["ticket"], json.dumps(deal, default=str),
                     deal.get("time", ""), deal.get("deal_type", ""), deal.get("amount", 0)),
                )
            self._conn.commit()

    def get_balance_deals(self, account_id: str) -> list[dict[str, Any]]:
        with self._data_lock:
            rows = self._conn.execute(
                "SELECT data FROM balance_deals WHERE account_id = ? ORDER BY time_value DESC",
                (account_id,),
            ).fetchall()
            return [json.loads(row[0]) for row in rows]

    # ── Snapshots History (SQLite) ────────────────────────────────────────

    def get_history(self, account_id: str) -> list[dict[str, Any]]:
        with self._data_lock:
            rows = self._conn.execute(
                "SELECT data FROM snapshots_history WHERE account_id = ? ORDER BY timestamp ASC LIMIT ?",
                (account_id, SNAPSHOTS_MAX),
            ).fetchall()
            return [json.loads(row[0]) for row in rows]

    # ── Account removal ───────────────────────────────────────────────────

    def remove_account(self, account_id: str):
        """Remove all data for a specific account."""
        with self._data_lock:
            self.latest_snapshot.pop(account_id, None)
            self.current_positions.pop(account_id, None)
            self._snapshot_insert_count.pop(account_id, None)
            if account_id in self._account_ids:
                self._account_ids.remove(account_id)
            self._conn.execute("DELETE FROM closed_trades WHERE account_id = ?", (account_id,))
            self._conn.execute("DELETE FROM balance_deals WHERE account_id = ?", (account_id,))
            self._conn.execute("DELETE FROM snapshots_history WHERE account_id = ?", (account_id,))
            self._conn.commit()


store = MemoryStore()
