"use client";

import { useCallback, useEffect, useState } from "react";
import { getSocket } from "@/lib/socket/client";
import type { ConversationSummaryDTO, MessageDTO } from "@/types";

export function useConversations(activeConversationId: string | null) {
  const [conversations, setConversations] = useState<ConversationSummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const socket = getSocket();

    function onNewMessage(message: MessageDTO) {
      // Re-fetch summaries (last message + unread count). A finer-grained
      // client-side patch is possible but re-fetching this lightweight
      // endpoint keeps unread counts provably correct against the server
      // rather than trying to replicate its counting logic in the client.
      refresh();
      void message;
    }

    function onPresence(payload: { userId: string; isOnline: boolean; lastSeenAt: string }) {
      setConversations((prev) =>
        prev.map((c) => (c.peer.id === payload.userId ? { ...c, peer: { ...c.peer, isOnline: payload.isOnline, lastSeenAt: payload.lastSeenAt } } : c))
      );
    }

    socket.on("message:new", onNewMessage);
    socket.on("presence:update", onPresence);
    return () => {
      socket.off("message:new", onNewMessage);
      socket.off("presence:update", onPresence);
    };
  }, [refresh]);

  // When the user opens a conversation, its unread count should clear
  // locally right away (server-side mark-read happens via useConversation).
  useEffect(() => {
    if (!activeConversationId) return;
    setConversations((prev) => prev.map((c) => (c.id === activeConversationId ? { ...c, unreadCount: 0 } : c)));
  }, [activeConversationId]);

  return { conversations, loading, refresh };
}
