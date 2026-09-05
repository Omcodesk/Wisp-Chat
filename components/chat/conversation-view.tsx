"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useCurrentUser } from "@/components/providers/current-user-context";
import { useConversation } from "@/hooks/use-conversation";
import { ChatHeader } from "@/components/chat/chat-header";
import { MessageList } from "@/components/chat/message-list";
import { Composer } from "@/components/chat/composer";
import { ConnectionBanner } from "@/components/chat/connection-banner";
import { getSocket } from "@/lib/socket/client";

interface Peer {
  id: string;
  name: string;
  avatarUrl: string | null;
  lastSeenAt: string;
}

interface Props {
  conversationId: string;
  peer: Peer | null;
}

export function ConversationView({ conversationId, peer }: Props) {
  const currentUser = useCurrentUser();
  const {
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
  } = useConversation(conversationId, currentUser.id);


  // Live presence for the peer
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerLastSeen, setPeerLastSeen] = useState(peer?.lastSeenAt ?? new Date().toISOString());

  useEffect(() => {
    // Initial presence check
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((data: { conversations?: Array<{ id: string; peer: { isOnline: boolean; lastSeenAt: string } }> }) => {
        const conv = data.conversations?.find((c) => c.id === conversationId);
        if (conv) {
          setPeerOnline(conv.peer.isOnline);
          setPeerLastSeen(conv.peer.lastSeenAt);
        }
      })
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    const socket = getSocket();
    function onPresence(payload: { userId: string; isOnline: boolean; lastSeenAt: string }) {
      if (peer && payload.userId === peer.id) {
        setPeerOnline(payload.isOnline);
        setPeerLastSeen(payload.lastSeenAt);
      }
    }
    socket.on("presence:update", onPresence);
    return () => { socket.off("presence:update", onPresence); };
  }, [peer]);

  // Mark latest message read when visible
  const lastMessageId = messages.filter((m) => m.senderId !== currentUser.id).at(-1)?.id;
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;
  useEffect(() => {
    if (!lastMessageId) return;
    // Small delay so we don't hammer on every keystroke
    const t = setTimeout(() => markReadRef.current(lastMessageId), 500);
    return () => clearTimeout(t);
  }, [lastMessageId]);

  // HTTP fallback mark-read on mount
  useEffect(() => {
    fetch(`/api/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
  }, [conversationId]);

  const handleSend = useCallback(
    (payload: Parameters<typeof send>[0]) => {
      send(payload);
    },
    [send]
  );

  return (
    <div className="flex h-full flex-col">
      <ChatHeader
        peer={peer}
        isOnline={peerOnline}
        lastSeenAt={peerLastSeen}
        typingUserIds={typingUserIds}
      />
      <ConnectionBanner status={connectionStatus} />
      <MessageList
        messages={messages}
        currentUserId={currentUser.id}
        hasMore={hasMore}
        loadingInitial={loadingInitial}
        loadingOlder={loadingOlder}
        loadOlder={loadOlder}
        onRetry={retry}
        onDelete={deleteMessage}
        peer={peer}
      />

      <Composer
        conversationId={conversationId}
        onSend={handleSend}
        onImageUploaded={addMessage}
        onTyping={notifyTyping}
      />
    </div>
  );
}
