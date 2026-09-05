import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertConversationMember } from "@/lib/db/authorization";
import { paginationQuerySchema } from "@/lib/validation/schemas";
import { getMessagesPage } from "@/lib/db/messages";
import { handleApiError } from "@/lib/utils/api-error";

/**
 * GET /api/conversations/:id/messages?cursor=...&limit=40
 *
 * Cursor pagination, never OFFSET (see README "Pagination"). First request
 * (no cursor) returns the most recent `limit` messages. Each subsequent
 * request passes the oldest message id from the previous page as `cursor`
 * to walk further back. Backed by the (conversationId, createdAt, id)
 * index so this stays fast at 10k+ messages.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await assertConversationMember(user.id, params.id);

    const { searchParams } = new URL(req.url);
    const { cursor, limit } = paginationQuerySchema.parse({
      cursor: searchParams.get("cursor") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const page = await getMessagesPage(params.id, cursor, limit);
    return NextResponse.json(page);
  } catch (err) {
    return handleApiError(err);
  }
}
