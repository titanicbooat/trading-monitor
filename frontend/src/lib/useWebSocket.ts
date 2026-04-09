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
  pollIntervalMs = 3000,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pollTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Check if WebSocket can actually connect
  const canUseWs =
    !!url &&
    !(
      typeof window !== "undefined" &&
      window.location.protocol === "https:" &&
      url.startsWith("ws://")
    );

  const connect = useCallback(() => {
    if (!canUseWs) return;
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
  }, [url, reconnectMs, canUseWs]);

  // Polling fallback when WebSocket is not available
  useEffect(() => {
    if (!canUseWs) {
      setConnected(true);
      onMessageRef.current({ type: "poll" });
      pollTimer.current = setInterval(() => {
        onMessageRef.current({ type: "poll" });
      }, pollIntervalMs);
      return () => clearInterval(pollTimer.current);
    }
  }, [canUseWs, pollIntervalMs]);

  // WebSocket connection
  useEffect(() => {
    if (canUseWs) {
      connect();
      return () => {
        clearTimeout(reconnectTimer.current);
        wsRef.current?.close();
      };
    }
  }, [connect, canUseWs]);

  return { connected };
}
