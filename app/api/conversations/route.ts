import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/utils/api-error";
import { toMessageDTO } from "@/lib/db/messages";
import { isOnline } from "@/lib/socket/presence";
import type { ConversationSummaryDTO } from "@/types";

/**
 * GET /api/conversations
 * Returns the authenticated user's conversations with the peer's identity,
 * last message, unread count, and live presence - everything the sidebar
 * needs in one request instead of N+1 client-side calls.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const memberships = await prisma.conversationMember.findMany({
      where: { userId: user.id },
      include: {
        conversation: {
          include: {
            members: { include: { user: true } },
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { conversation: { updatedAt: "desc" } },
    });

    const summaries: ConversationSummaryDTO[] = await Promise.all(
      memberships.map(async (membership) => {
        const conversation = membership.conversation;
        const peerMember = conversation.members.find((m) => m.userId !== user.id);
        const peer = peerMember?.user;

        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conversation.id,
            senderId: { not: user.id },
            createdAt: membership.lastReadAt ? { gt: membership.lastReadAt } : undefined,
          },
        });

        const lastMessage = conversation.messages[0];

        return {
          id: conversation.id,
          peer: {
            id: peer?.id ?? "",
            name: peer?.name ?? "Unknown",
            avatarUrl: peer?.avatarUrl ?? null,
            isOnline: peer ? await isOnline(peer.id) : false,
            lastSeenAt: (peer?.lastSeenAt ?? new Date()).toISOString(),
          },
          lastMessage: lastMessage ? toMessageDTO(lastMessage) : null,
          unreadCount,
          updatedAt: conversation.updatedAt.toISOString(),
        };
      })
    );

    return NextResponse.json({ conversations: summaries });
  } catch (err) {
    return handleApiError(err);
  }
}

const createConversationSchema = z.object({ peerUserId: z.string().cuid() });

/**
 * POST /api/conversations
 * Creates (or returns the existing) 1:1 conversation with another user.
 * Uses a transaction + the ConversationMember unique constraint to stay
 * race-safe if both users try to start the conversation simultaneously.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { peerUserId } = createConversationSchema.parse(await req.json());

    if (peerUserId === user.id) {
      return NextResponse.json({ error: { code: "INVALID_REQUEST", message: "Cannot start a conversation with yourself." } }, { status: 400 });
    }

    const peer = await prisma.user.findUnique({ where: { id: peerUserId }, select: { id: true } });
    if (!peer) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "User not found." } }, { status: 404 });
    }

    const existing = await prisma.conversation.findFirst({
      where: {
        AND: [{ members: { some: { userId: user.id } } }, { members: { some: { userId: peerUserId } } }],
      },
    });
    if (existing) {
      return NextResponse.json({ conversationId: existing.id });
    }

    const created = await prisma.conversation.create({
      data: { members: { create: [{ userId: user.id }, { userId: peerUserId }] } },
    });

    return NextResponse.json({ conversationId: created.id }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
