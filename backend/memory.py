"""
In-memory storage singleton for MT5 account data.
Supports multiple accounts — all data keyed by account_id.
Thread-safe via threading.Lock.
"""

import threading
from collections import defaultdict
from typing import Any


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
        self.latest_snapshot: dict[str, dict[str, Any]] = {}
        self.current_positions: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.closed_trades: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.balance_deals: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.snapshots_history: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._initialized = True

    def set_account_ids(self, ids: list[str]):
        with self._data_lock:
            self._account_ids = list(ids)

    def get_account_ids(self) -> list[str]:
        with self._data_lock:
            return list(self._account_ids)

    def update_snapshot(self, account_id: str, snapshot: dict[str, Any]):
        with self._data_lock:
            self.latest_snapshot[account_id] = snapshot
            self.snapshots_history[account_id].append(snapshot)
            if len(self.snapshots_history[account_id]) > 500:
                self.snapshots_history[account_id] = self.snapshots_history[account_id][-500:]

    def update_positions(self, account_id: str, positions: list[dict[str, Any]]):
        with self._data_lock:
            self.current_positions[account_id] = positions

    def update_closed_trades(self, account_id: str, trades: list[dict[str, Any]]):
        with self._data_lock:
            existing_tickets = {t["ticket"] for t in self.closed_trades[account_id]}
            for trade in trades:
                if trade["ticket"] not in existing_tickets:
                    self.closed_trades[account_id].append(trade)
                    existing_tickets.add(trade["ticket"])
            self.closed_trades[account_id].sort(key=lambda t: t.get("time", 0), reverse=True)
            self.closed_trades[account_id] = self.closed_trades[account_id][:1000]

    def get_snapshot(self, account_id: str) -> dict[str, Any]:
        with self._data_lock:
            return self.latest_snapshot.get(account_id, {}).copy()

    def get_positions(self, account_id: str) -> list[dict[str, Any]]:
        with self._data_lock:
            return list(self.current_positions.get(account_id, []))

    def get_closed_trades(self, account_id: str) -> list[dict[str, Any]]:
        with self._data_lock:
            return list(self.closed_trades.get(account_id, []))

    def update_balance_deals(self, account_id: str, deals: list[dict[str, Any]]):
        with self._data_lock:
            existing_tickets = {d["ticket"] for d in self.balance_deals[account_id]}
            for deal in deals:
                if deal["ticket"] not in existing_tickets:
                    self.balance_deals[account_id].append(deal)
                    existing_tickets.add(deal["ticket"])
            self.balance_deals[account_id].sort(key=lambda d: d.get("time", ""), reverse=True)
            self.balance_deals[account_id] = self.balance_deals[account_id][:500]

    def get_balance_deals(self, account_id: str) -> list[dict[str, Any]]:
        with self._data_lock:
            return list(self.balance_deals.get(account_id, []))

    def get_history(self, account_id: str) -> list[dict[str, Any]]:
        with self._data_lock:
            return list(self.snapshots_history.get(account_id, []))

    def remove_account(self, account_id: str):
        """Remove all data for a specific account."""
        with self._data_lock:
            self.latest_snapshot.pop(account_id, None)
            self.current_positions.pop(account_id, None)
            self.closed_trades.pop(account_id, None)
            self.balance_deals.pop(account_id, None)
            self.snapshots_history.pop(account_id, None)
            if account_id in self._account_ids:
                self._account_ids.remove(account_id)


store = MemoryStore()
