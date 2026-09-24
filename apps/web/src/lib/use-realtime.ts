"use client";

import { SOCKET_EVENTS } from "@enermesh/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "./auth-store";
import { envelopeEventId, queryKeysForSocketEvent, shouldApplyEvent } from "./realtime";
import { useRealtimeStore, type RealtimeStatus } from "./realtime-store";

export type { RealtimeStatus };

const SOCKET_EVENT_LIST = Object.values(SOCKET_EVENTS);

/**
 * Authenticated Socket.IO subscriber. Privileged marketplace state is
 * server-emitted only; this hook invalidates REST queries and never treats
 * a socket payload as confirmation.
 */
export function useRealtimeSync(): RealtimeStatus {
  const token = useAuthStore((state) => state.accessToken);
  const authStatus = useAuthStore((state) => state.status);
  const queryClient = useQueryClient();
  const realtimeStatus = useRealtimeStore((state) => state.status);
  const setRealtimeStatus = useRealtimeStore((state) => state.setStatus);
  const seenRef = useRef(new Set<string>());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (authStatus !== "authenticated" || !token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setRealtimeStatus("idle");
      return;
    }

    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      auth: { token },
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      timeout: 10_000,
    });
    socketRef.current = socket;
    setRealtimeStatus("connecting");

    const onConnect = () => setRealtimeStatus("connected");
    const onDisconnect = () => setRealtimeStatus("disconnected");
    const onError = () => setRealtimeStatus("error");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onError);

    for (const event of SOCKET_EVENT_LIST) {
      socket.on(event, (payload: unknown) => {
        const eventId = envelopeEventId(payload);
        if (!shouldApplyEvent(eventId, seenRef.current)) return;
        for (const queryKey of queryKeysForSocketEvent(event)) {
          void queryClient.invalidateQueries({ queryKey });
        }
      });
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onError);
      for (const event of SOCKET_EVENT_LIST) socket.off(event);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [authStatus, token, queryClient, setRealtimeStatus]);

  return realtimeStatus;
}
