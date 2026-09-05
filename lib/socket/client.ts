"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | undefined;

/**
 * Singleton socket connection shared across the app (and across tabs of
 * the same origin only in the sense that each tab gets its own socket -
 * true multi-tab coordination happens server-side via presence counters,
 * not by sharing a connection). withCredentials sends the Auth.js session
 * cookie on the handshake, which the socket server independently verifies
 * (see lib/socket/verify-session.ts) - the client never sends its own
 * userId.
 *
 * Reconnection: socket.io-client reconnects automatically with backoff.
 * We additionally re-join whatever conversation room was active on every
 * reconnect (see useChat), since rooms don't survive a transport drop.
 */
export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4001", {
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}
