import { createServer } from "http";
import { Server, type Socket } from "socket.io";
import { MessageType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { verifySocketSession, type SocketUser } from "@/lib/socket/verify-session";
import { assertConversationMember, ForbiddenError } from "@/lib/db/authorization";
import { registerConnection, registerDisconnection } from "@/lib/socket/presence";
import { checkRateLimit, messageRateLimit } from "@/lib/rate-limit";
import { messageSendSchema } from "@/lib/validation/schemas";
import { moderateTextMessage } from "@/lib/moderation/profanity";
import { createMessageIdempotent } from "@/lib/db/messages";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  MessageDTO,
} from "@/types";

const PORT = Number(process.env.SOCKET_SERVER_PORT ?? 4001);
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const INTERNAL_EMIT_SECRET = process.env.SOCKET_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "";

interface SocketData {
  user: SocketUser;
}

const httpServer = createServer((req, res) => {
  // Internal-only endpoint: the Next.js API process calls this after it
  // persists an IMAGE message (post-moderation) so the socket server can
  // push it to connected clients in realtime. Protected by a shared
  // secret header - never exposed to browsers, and CORS is not enabled
  // for this path since it's server-to-server only.
  if (req.method === "POST" && req.url === "/internal/emit-message") {
    if (req.headers["x-internal-secret"] !== INTERNAL_EMIT_SECRET) {
      res.writeHead(403);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body) as { conversationId: string; message: MessageDTO };
        io.to(conversationRoom(payload.conversationId)).emit("message:new", payload.message);
        res.writeHead(200);
        res.end("ok");
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/internal/emit-deleted") {
    if (req.headers["x-internal-secret"] !== INTERNAL_EMIT_SECRET) {
      res.writeHead(403);
      res.end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body) as { conversationId: string; messageId: string };
        io.to(conversationRoom(payload.conversationId)).emit("message:deleted", payload);
        res.writeHead(200);
        res.end("ok");
      } catch {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});


const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
  cors: { origin: APP_ORIGIN, credentials: true },
});

function conversationRoom(conversationId: string): string {
  return `conversation:${conversationId}`;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

// ---------------------------------------------------------------------------
// Authentication middleware: every connecting socket must present a valid
// Auth.js session cookie. The client never supplies its own userId - it is
// decoded from the signed cookie only. Unauthenticated sockets are rejected
// at the handshake, before any event handler runs.
// ---------------------------------------------------------------------------
io.use(async (socket, next) => {
  try {
    const user = await verifySocketSession(socket.handshake.headers.cookie);
    if (!user) {
      next(new Error("UNAUTHENTICATED"));
      return;
    }
    socket.data.user = user;
    next();
  } catch (err) {
    next(err instanceof Error ? err : new Error("AUTH_ERROR"));
  }
});

io.on("connection", async (socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>) => {
  const user = socket.data.user;
  socket.join(userRoom(user.id));

  const { wentOnline } = await registerConnection(user.id);
  if (wentOnline) {
    io.emit("presence:update", { userId: user.id, isOnline: true, lastSeenAt: new Date().toISOString() });
  }

  // ---- conversation:join -----------------------------------------------
  socket.on("conversation:join", async ({ conversationId }, ack) => {
    try {
      await assertConversationMember(user.id, conversationId);
      socket.join(conversationRoom(conversationId));
      ack({ ok: true });
    } catch (err) {
      ack({ ok: false, code: "FORBIDDEN", message: forbiddenMessage(err) });
    }
  });

  socket.on("conversation:leave", ({ conversationId }) => {
    socket.leave(conversationRoom(conversationId));
  });

  // ---- message:send -------------------------------------------------------
  socket.on("message:send", async (rawPayload, ack) => {
    const clientMessageId = (rawPayload as { clientMessageId?: string })?.clientMessageId;

    const rateLimit = await checkRateLimit(messageRateLimit, user.id);
    if (!rateLimit.allowed) {
      ack({ ok: false, code: "RATE_LIMITED", message: "You're sending messages too quickly.", clientMessageId: clientMessageId ?? "" });
      return;
    }

    const parsed = messageSendSchema.safeParse(rawPayload);
    if (!parsed.success) {
      ack({ ok: false, code: "INVALID_PAYLOAD", message: "Invalid message.", clientMessageId: clientMessageId ?? "" });
      return;
    }
    const payload = parsed.data;

    try {
      await assertConversationMember(user.id, payload.conversationId);
    } catch {
      ack({ ok: false, code: "FORBIDDEN", message: "You can't send messages in this conversation.", clientMessageId: payload.clientMessageId });
      return;
    }

    if (payload.type === "TEXT") {
      const moderation = await moderateTextMessage(payload.content);
      if (!moderation.allowed) {
        ack({
          ok: false,
          code: "MODERATION_BLOCKED",
          message: "Message blocked because it contains prohibited language.",
          clientMessageId: payload.clientMessageId,
        });
        return;
      }
    }

    try {
      const { message } = await createMessageIdempotent({
        conversationId: payload.conversationId,
        senderId: user.id,
        clientMessageId: payload.clientMessageId,
        type: payload.type === "TEXT" ? MessageType.TEXT : (payload.type as MessageType),
        content: payload.type === "TEXT" ? payload.content : null,
        mediaUrl: payload.type !== "TEXT" ? payload.mediaUrl : null,
        mediaWidth: payload.type !== "TEXT" ? payload.mediaWidth ?? null : null,
        mediaHeight: payload.type !== "TEXT" ? payload.mediaHeight ?? null : null,
      });

      // Broadcast to everyone in the room (including sender's other tabs -
      // they reconcile against clientMessageId, see useSocket hook).
      io.to(conversationRoom(payload.conversationId)).emit("message:new", message);

      // "Delivered" means the recipient has at least one live socket connected
      // anywhere (not necessarily viewing this conversation). We check their
      // personal user:<id> room rather than the conversation room, because the
      // conversation room check would always be true (the sender is in it).
      const { getOtherMemberId } = await import("@/lib/db/authorization");
      const recipientId = await getOtherMemberId(payload.conversationId, user.id);
      const recipientOnline = recipientId
        ? io.sockets.adapter.rooms.has(userRoom(recipientId))
        : false;

      if (recipientOnline) {
        const deliveredAt = new Date();
        await prisma.message.update({ where: { id: message.id }, data: { deliveredAt } }).catch(() => undefined);
        message.deliveredAt = deliveredAt.toISOString();
        io.to(conversationRoom(payload.conversationId)).emit("message:delivered", {
          conversationId: payload.conversationId,
          messageId: message.id,
          deliveredAt: deliveredAt.toISOString(),
        });
      }

      ack({ ok: true, message });
    } catch (err) {
      console.error("[socket] message:send failed", err);
      ack({ ok: false, code: "SERVER_ERROR", message: "Couldn't send your message. Please try again.", clientMessageId: payload.clientMessageId });
    }
  });

  // ---- message:read ------------------------------------------------------
  socket.on("message:read", async ({ conversationId, upToMessageId }) => {
    try {
      await assertConversationMember(user.id, conversationId);
    } catch {
      return;
    }

    const upToMessage = await prisma.message.findUnique({ where: { id: upToMessageId }, select: { createdAt: true } });
    if (!upToMessage) return;

    // Single UPDATE on the membership row - O(1) regardless of how many
    // messages are being marked read, instead of rewriting every message
    // row (see README "Read state").
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadAt: upToMessage.createdAt },
    });

    const readAt = new Date().toISOString();
    io.to(conversationRoom(conversationId)).emit("message:read", {
      conversationId,
      readerId: user.id,
      upToMessageId,
      readAt,
    });
  });

  // ---- message:delete ----------------------------------------------------
  socket.on("message:delete", async ({ conversationId, messageId }, ack) => {
    try {
      await assertConversationMember(user.id, conversationId);
      const msg = await prisma.message.findUnique({ where: { id: messageId } });
      if (!msg) {
        if (ack) ack({ ok: false, code: "NOT_FOUND", message: "Message not found" });
        return;
      }
      if (msg.senderId !== user.id) {
        if (ack) ack({ ok: false, code: "FORBIDDEN", message: "Only the sender can delete this message" });
        return;
      }
      await prisma.message.delete({ where: { id: messageId } });
      io.to(conversationRoom(conversationId)).emit("message:deleted", { conversationId, messageId });
      if (ack) ack({ ok: true });
    } catch (err) {
      console.error("[socket] message:delete failed", err);
      if (ack) ack({ ok: false, code: "SERVER_ERROR", message: "Could not delete message" });
    }
  });


  // ---- typing -------------------------------------------------------------
  socket.on("typing:start", async ({ conversationId }) => {
    if (await safeIsMember(user.id, conversationId)) {
      socket.to(conversationRoom(conversationId)).emit("typing:start", { conversationId, userId: user.id });
    }
  });

  socket.on("typing:stop", async ({ conversationId }) => {
    if (await safeIsMember(user.id, conversationId)) {
      socket.to(conversationRoom(conversationId)).emit("typing:stop", { conversationId, userId: user.id });
    }
  });

  // ---- disconnect -----------------------------------------------------
  socket.on("disconnect", async () => {
    const { wentOffline } = await registerDisconnection(user.id);
    if (wentOffline) {
      const lastSeenAt = new Date();
      await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt } }).catch(() => undefined);
      io.emit("presence:update", { userId: user.id, isOnline: false, lastSeenAt: lastSeenAt.toISOString() });
      // Typing indicators implicitly disappear: no more typing:start events
      // will arrive from this user, and the client TTLs any indicator it
      // hasn't refreshed within a few seconds (see useTypingIndicator).
    }
  });
});

async function safeIsMember(userId: string, conversationId: string): Promise<boolean> {
  try {
    await assertConversationMember(userId, conversationId);
    return true;
  } catch {
    return false;
  }
}

function forbiddenMessage(err: unknown): string {
  return err instanceof ForbiddenError ? err.message : "Forbidden";
}

httpServer.listen(PORT, () => {
  console.log(`[socket] listening on :${PORT}`);
});
