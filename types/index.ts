import type { MessageType } from "@prisma/client";

/** Canonical, server-persisted message shape sent to clients. */
export interface MessageDTO {
  id: string;
  clientMessageId: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  content: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaSize: number | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface ConversationSummaryDTO {
  id: string;
  peer: {
    id: string;
    name: string;
    avatarUrl: string | null;
    isOnline: boolean;
    lastSeenAt: string;
  };
  lastMessage: MessageDTO | null;
  unreadCount: number;
  updatedAt: string;
}

export interface PaginatedMessages {
  messages: MessageDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Socket.IO event contracts. Every event that mutates state is authenticated
// and authorized server-side (see server/socket.ts) - these types just keep
// both ends honest about the payload shape, they are not a trust boundary.
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  "conversation:join": (payload: { conversationId: string }, ack: (res: AckResult) => void) => void;
  "conversation:leave": (payload: { conversationId: string }) => void;

  "message:send": (payload: MessageSendPayload, ack: (res: MessageSendAck) => void) => void;

  "message:read": (payload: { conversationId: string; upToMessageId: string }) => void;
  "message:delete": (payload: { conversationId: string; messageId: string }, ack?: (res: AckResult) => void) => void;

  "typing:start": (payload: { conversationId: string }) => void;
  "typing:stop": (payload: { conversationId: string }) => void;
}

export interface ServerToClientEvents {
  "message:new": (message: MessageDTO) => void;
  "message:delivered": (payload: { conversationId: string; messageId: string; deliveredAt: string }) => void;
  "message:read": (payload: { conversationId: string; readerId: string; upToMessageId: string; readAt: string }) => void;
  "message:deleted": (payload: { conversationId: string; messageId: string }) => void;

  "typing:start": (payload: { conversationId: string; userId: string }) => void;
  "typing:stop": (payload: { conversationId: string; userId: string }) => void;

  "presence:update": (payload: { userId: string; isOnline: boolean; lastSeenAt: string }) => void;

  "conversation:unread": (payload: { conversationId: string; unreadCount: number }) => void;

  error: (payload: { code: string; message: string; clientMessageId?: string }) => void;
}

// NOTE on IMAGE messages: they are intentionally NOT sendable via
// message:send. Image sends require the multi-step
// upload -> moderate -> persist pipeline (POST /api/media/upload-url then
// POST /api/media/complete - see README "Media / moderation architecture").
// Allowing IMAGE through the socket would let a client send an
// arbitrary mediaUrl and skip moderation entirely, so the socket server
// rejects that message type outright. The HTTP route persists the message
// itself (after moderation approves it) and pushes it to connected clients
// via the socket server's internal emit endpoint, so recipients still see
// it in realtime.
export type MessageSendPayload =
  | {
      conversationId: string;
      clientMessageId: string;
      type: "TEXT";
      content: string;
    }
  | {
      conversationId: string;
      clientMessageId: string;
      type: "GIF" | "STICKER";
      mediaUrl: string;
      mediaWidth?: number;
      mediaHeight?: number;
    };

export type AckResult = { ok: true } | { ok: false; code: string; message: string };

export type MessageSendAck =
  | { ok: true; message: MessageDTO }
  | { ok: false; code: string; message: string; clientMessageId: string };
