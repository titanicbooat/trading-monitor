"""
WebSocket connection manager.
Maintains active connections and broadcasts JSON payloads.
"""

import asyncio
import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        logger.info("WS client connected (%d total)", len(self.active))

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)
        logger.info("WS client disconnected (%d total)", len(self.active))

    async def broadcast(self, data: dict[str, Any]):
        """Send JSON to all connected clients, removing dead connections."""
        if not self.active:
            return
        payload = json.dumps(data, default=str)
        stale: list[WebSocket] = []
        for ws in self.active:
            try:
                await ws.send_text(payload)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.disconnect(ws)


manager = ConnectionManager()
