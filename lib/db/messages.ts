import { Prisma, MessageType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { MessageDTO, PaginatedMessages } from "@/types";

export function toMessageDTO(m: {
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
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
}): MessageDTO {
  return {
    id: m.id,
    clientMessageId: m.clientMessageId,
    conversationId: m.conversationId,
    senderId: m.senderId,
    type: m.type,
    content: m.content,
    mediaUrl: m.mediaUrl,
    mediaMimeType: m.mediaMimeType,
    mediaSize: m.mediaSize,
    mediaWidth: m.mediaWidth,
    mediaHeight: m.mediaHeight,
    createdAt: m.createdAt.toISOString(),
    deliveredAt: m.deliveredAt?.toISOString() ?? null,
    readAt: m.readAt?.toISOString() ?? null,
  };
}

export interface CreateMessageInput {
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  type: MessageType;
  content?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
}

export interface CreateMessageResult {
  message: MessageDTO;
  wasCreated: boolean; // false = idempotent retry, an existing row was returned
}

/**
 * The one place a Message row gets created. Idempotency is enforced with a
 * database-level unique constraint (conversationId, senderId,
 * clientMessageId) rather than an in-memory dedupe map, so it's correct
 * even across multiple server processes / socket server restarts / two
 * requests racing each other. On a constraint violation we re-fetch and
 * return the existing row instead of erroring - a retried send resolves to
 * the same canonical message rather than creating a duplicate or failing.
 */
export async function createMessageIdempotent(input: CreateMessageInput): Promise<CreateMessageResult> {
  // Check if this message was already persisted (e.g. retry, network reconnect)
  const existing = await findByIdempotencyKey(input.conversationId, input.senderId, input.clientMessageId);
  if (existing) {
    return { message: toMessageDTO(existing), wasCreated: false };
  }

  try {
    const created = await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        senderId: input.senderId,
        clientMessageId: input.clientMessageId,
        type: input.type,
        content: input.content ?? null,
        mediaUrl: input.mediaUrl ?? null,
        mediaMimeType: input.mediaMimeType ?? null,
        mediaSize: input.mediaSize ?? null,
        mediaWidth: input.mediaWidth ?? null,
        mediaHeight: input.mediaHeight ?? null,
      },
    });
    return { message: toMessageDTO(created), wasCreated: true };
  } catch (err) {
    // Unique constraint hit or race condition - check if existing row was created concurrently
    const retryExisting = await findByIdempotencyKey(input.conversationId, input.senderId, input.clientMessageId);
    if (retryExisting) {
      return { message: toMessageDTO(retryExisting), wasCreated: false };
    }
    throw err;
  }
}

async function findByIdempotencyKey(conversationId: string, senderId: string, clientMessageId: string) {
  return prisma.message.findUnique({
    where: {
      idempotency_key: { conversationId, senderId, clientMessageId },
    },
  });
}

/**
 * Cursor-based pagination over a conversation's messages, newest page
 * first. Cursor is the message id of the oldest message already loaded;
 * we page strictly older than it. Uses the (conversationId, createdAt, id)
 * index - no OFFSET, so performance doesn't degrade as history grows past
 * 10k+ messages.
 */
export async function getMessagesPage(
  conversationId: string,
  cursor: string | undefined,
  limit: number
): Promise<PaginatedMessages> {
  let cursorRow: { createdAt: Date; id: string } | null = null;
  if (cursor) {
    cursorRow = await prisma.message.findUnique({
      where: { id: cursor },
      select: { createdAt: true, id: true },
    });
  }

  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      ...(cursorRow
        ? {
            OR: [
              { createdAt: { lt: cursorRow.createdAt } },
              { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  return {
    messages: page.map(toMessageDTO).reverse(), // chronological order for rendering
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    hasMore,
  };
}
