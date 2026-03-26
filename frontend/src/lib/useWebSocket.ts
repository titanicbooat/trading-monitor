"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseWebSocketOptions {
  url: string;
  onMessage: (data: unknown) => void;
  reconnectMs?: number;
  pollIntervalMs?: number;
}

export function useWebSocket({
  url,
  onMessage,
  reconnectMs = 3000,
  pollIntervalMs = 30000,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pollTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Check if WebSocket is blocked (HTTPS page + ws:// URL)
  const wsBlocked =
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    url.startsWith("ws://");

  const connect = useCallback(() => {
    if (wsBlocked || !url) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch {
        // ignore non-JSON
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, reconnectMs);
    };

    ws.onerror = () => ws.close();
  }, [url, reconnectMs, wsBlocked]);

  // Polling fallback when WebSocket is not available
  useEffect(() => {
    if (wsBlocked) {
      setConnected(true); // Show as "connected" since polling is active
      // Trigger immediate refresh
      onMessageRef.current({ type: "poll" });
      // Poll at interval
      pollTimer.current = setInterval(() => {
        onMessageRef.current({ type: "poll" });
      }, pollIntervalMs);
      return () => clearInterval(pollTimer.current);
    }
  }, [wsBlocked, pollIntervalMs]);

  // WebSocket connection
  useEffect(() => {
    if (!wsBlocked) {
      connect();
      return () => {
        clearTimeout(reconnectTimer.current);
        wsRef.current?.close();
      };
    }
  }, [connect, wsBlocked]);

  return { connected };
}
