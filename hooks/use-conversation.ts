"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { getSocket } from "@/lib/socket/client";
import type { MessageDTO, MessageSendPayload, PaginatedMessages } from "@/types";

export type ClientMessage = MessageDTO & { status: "pending" | "sent" | "failed" };

const TYPING_IDLE_MS = 2500;

export function useConversation(conversationId: string | null, currentUserId: string) {
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "reconnecting">("connecting");

  const typingTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const ownTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // -------------------------------------------------------------------
  // Socket lifecycle: connect status, join/leave room, reconnection.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();

    function joinRoom() {
      socket.emit("conversation:join", { conversationId: conversationId! }, (res) => {
        if (!res.ok) console.error("Failed to join conversation room", res);
      });
    }

    function onConnect() {
      setConnectionStatus("connected");
      joinRoom();
    }
    function onDisconnect() {
      setConnectionStatus("reconnecting");
    }
    function onReconnectAttempt() {
      setConnectionStatus("reconnecting");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);

    if (socket.connected) onConnect();

    return () => {
      socket.emit("conversation:leave", { conversationId });
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
    };
  }, [conversationId]);

  // -------------------------------------------------------------------
  // Incoming events: new messages, delivery/read receipts, typing.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();

    function onNewMessage(message: MessageDTO) {
      if (message.conversationId !== conversationId) return;
      setMessages((prev) => {
        // Reconcile: if we already have a pending message with this
        // clientMessageId (our own optimistic send, possibly from another
        // tab of the same account), replace it with the canonical row.
        const existingIndex = prev.findIndex((m) => m.clientMessageId === message.clientMessageId);
        if (existingIndex !== -1) {
          const next = [...prev];
          next[existingIndex] = { ...message, status: "sent" };
          return next;
        }
        // Duplicate-by-id guard (e.g. the internal emit endpoint firing
        // twice) - never render the same canonical message twice.
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, { ...message, status: "sent" }];
      });
    }

    function onDelivered(payload: { conversationId: string; messageId: string; deliveredAt: string }) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) => prev.map((m) => (m.id === payload.messageId ? { ...m, deliveredAt: payload.deliveredAt } : m)));
    }

    function onRead(payload: { conversationId: string; readerId: string; upToMessageId: string; readAt: string }) {
      if (payload.conversationId !== conversationId || payload.readerId === currentUserId) return;
      setMessages((prev) =>
        prev.map((m) => (m.senderId === currentUserId && new Date(m.createdAt) <= new Date(payload.readAt) ? { ...m, readAt: m.readAt ?? payload.readAt } : m))
      );
    }

    function onTypingStart(payload: { conversationId: string; userId: string }) {
      if (payload.conversationId !== conversationId || payload.userId === currentUserId) return;
      setTypingUserIds((prev) => new Set(prev).add(payload.userId));
      const existing = typingTimeouts.current.get(payload.userId);
      if (existing) clearTimeout(existing);
      typingTimeouts.current.set(
        payload.userId,
        setTimeout(() => {
          setTypingUserIds((prev) => {
            const next = new Set(prev);
            next.delete(payload.userId);
            return next;
          });
        }, TYPING_IDLE_MS)
      );
    }

    function onTypingStop(payload: { conversationId: string; userId: string }) {
      if (payload.conversationId !== conversationId) return;
      setTypingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(payload.userId);
        return next;
      });
    }

    function onDeleted(payload: { conversationId: string; messageId: string }) {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
    }

    socket.on("message:new", onNewMessage);
    socket.on("message:delivered", onDelivered);
    socket.on("message:read", onRead);
    socket.on("message:deleted", onDeleted);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);

    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("message:delivered", onDelivered);
      socket.off("message:read", onRead);
      socket.off("message:deleted", onDeleted);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
    };
  }, [conversationId, currentUserId]);


  // -------------------------------------------------------------------
  // Initial load + pagination.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!conversationId) return;
    setMessages([]);
    setLoadingInitial(true);
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((res) => res.json())
      .then((data: PaginatedMessages) => {
        setMessages(data.messages.map((m) => ({ ...m, status: "sent" as const })));
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      })
      .finally(() => setLoadingInitial(false));
  }, [conversationId]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages?cursor=${nextCursor}`);
      const data: PaginatedMessages = await res.json();
      setMessages((prev) => [...data.messages.map((m) => ({ ...m, status: "sent" as const })), ...prev]);
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, nextCursor, loadingOlder]);

  // -------------------------------------------------------------------
  // Sending (optimistic + idempotent) and typing.
  // -------------------------------------------------------------------
  const send = useCallback(
    (payload: Omit<MessageSendPayload, "clientMessageId">) => {
      if (!conversationId) return;
      const clientMessageId = uuid();
      const optimistic: ClientMessage = {
        id: `pending-${clientMessageId}`,
        clientMessageId,
        conversationId,
        senderId: currentUserId,
        type: payload.type as ClientMessage["type"],
        content: ("content" in payload ? (payload as { content: string }).content : null) as string | null,
        mediaUrl: ("mediaUrl" in payload ? (payload as { mediaUrl: string }).mediaUrl : null) as string | null,
        mediaMimeType: null,
        mediaSize: null,
        mediaWidth: ("mediaWidth" in payload ? (payload as { mediaWidth?: number }).mediaWidth ?? null : null) as number | null,
        mediaHeight: ("mediaHeight" in payload ? (payload as { mediaHeight?: number }).mediaHeight ?? null : null) as number | null,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
        status: "pending",
      };
      setMessages((prev) => [...prev, optimistic]);

      const socket = getSocket();
      const fullPayload = { ...payload, clientMessageId } as MessageSendPayload;

      socket.timeout(8000).emit("message:send", fullPayload, (err, ack) => {
        if (err || !ack || !ack.ok) {
          setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: "failed" } : m)));
          return;
        }
        setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId ? { ...ack.message, status: "sent" } : m)));
      });
    },
    [conversationId, currentUserId]
  );

  const retry = useCallback(
    (clientMessageId: string) => {
      const msg = messages.find((m) => m.clientMessageId === clientMessageId);
      if (!msg || !conversationId) return;
      setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: "pending" } : m)));
      const socket = getSocket();
      const payload =
        msg.type === "TEXT"
          ? { conversationId, clientMessageId, type: "TEXT" as const, content: msg.content ?? "" }
          : { conversationId, clientMessageId, type: msg.type as "GIF" | "STICKER", mediaUrl: msg.mediaUrl ?? "" };
      socket.timeout(8000).emit("message:send", payload, (err, ack) => {
        if (err || !ack || !ack.ok) {
          setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId ? { ...m, status: "failed" } : m)));
          return;
        }
        setMessages((prev) => prev.map((m) => (m.clientMessageId === clientMessageId ? { ...ack.message, status: "sent" } : m)));
      });
    },
    [messages, conversationId]
  );

  const markRead = useCallback(
    (upToMessageId: string) => {
      if (!conversationId) return;
      getSocket().emit("message:read", { conversationId, upToMessageId });
    },
    [conversationId]
  );

  const notifyTyping = useCallback(() => {
    if (!conversationId) return;
    const socket = getSocket();
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit("typing:start", { conversationId });
    }
    if (ownTypingTimer.current) clearTimeout(ownTypingTimer.current);
    ownTypingTimer.current = setTimeout(() => {
      isTypingRef.current = false;
      socket.emit("typing:stop", { conversationId });
    }, TYPING_IDLE_MS);
  }, [conversationId]);

  const addMessage = useCallback((message: MessageDTO) => {
    setMessages((prev) => {
      const existingIndex = prev.findIndex((m) => m.clientMessageId === message.clientMessageId || m.id === message.id);
      if (existingIndex !== -1) {
        const next = [...prev];
        next[existingIndex] = { ...message, status: "sent" };
        return next;
      }
      return [...prev, { ...message, status: "sent" }];
    });
  }, []);

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      // Optimistic local update
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      const socket = getSocket();
      socket.emit("message:delete", { conversationId, messageId }, async (res) => {
        if (!res || !res.ok) {
          // Fallback to REST API
          await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
            method: "DELETE",
          }).catch((err) => console.error("Failed to delete message via REST fallback", err));
        }
      });
    },
    [conversationId]
  );

  return {
    messages,
    hasMore,
    loadingInitial,
    loadingOlder,
    loadOlder,
    send,
    addMessage,
    retry,
    deleteMessage,
    markRead,
    notifyTyping,
    typingUserIds,
    connectionStatus,
  };
}

