import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertConversationMember } from "@/lib/db/authorization";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/utils/api-error";
import { deleteObject } from "@/lib/storage/r2";

const INTERNAL_EMIT_SECRET = process.env.SOCKET_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
const SOCKET_SERVER_URL = process.env.SOCKET_SERVER_URL ?? "http://localhost:4001";

interface RouteParams {
  params: { id: string; messageId: string };
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const conversationId = params.id;
    const messageId = params.messageId;

    await assertConversationMember(user.id, conversationId);

    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.conversationId !== conversationId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Message not found." } },
        { status: 404 }
      );
    }

    if (message.senderId !== user.id) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "You can only delete messages sent by you." } },
        { status: 403 }
      );
    }

    // Clean up uploaded media file if stored locally or in R2
    if (message.mediaUrl) {
      if (message.mediaUrl.startsWith("/uploads/")) {
        const key = message.mediaUrl.replace("/uploads/", "");
        await deleteObject(key).catch(() => undefined);
      }
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    // Notify socket server to broadcast deletion to conversation room
    await fetch(`${SOCKET_SERVER_URL}/internal/emit-deleted`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": INTERNAL_EMIT_SECRET,
      },
      body: JSON.stringify({ conversationId, messageId }),
    }).catch((err) => console.error("[delete] failed to notify socket server", err));

    return NextResponse.json({ success: true, messageId });
  } catch (err) {
    return handleApiError(err);
  }
}
