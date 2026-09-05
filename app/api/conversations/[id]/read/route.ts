import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertConversationMember } from "@/lib/db/authorization";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/utils/api-error";

/**
 * POST /api/conversations/:id/read
 * HTTP fallback for the same operation the socket "message:read" event
 * performs - used so the unread badge clears correctly even if the socket
 * hasn't finished connecting yet when the user opens a conversation.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await assertConversationMember(user.id, params.id);

    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: params.id, userId: user.id } },
      data: { lastReadAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
