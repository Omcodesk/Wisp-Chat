import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { handleApiError } from "@/lib/utils/api-error";

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});

/**
 * GET /api/users/search?q=...
 * Returns up to 20 users whose name or email contains the query string.
 * Excludes the calling user from results. Used to start new conversations.
 * Auth required.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";

    const { q: query } = searchQuerySchema.parse({ q });

    const users = await prisma.user.findMany({
      where: {
        id: { not: user.id },
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, email: true, avatarUrl: true },
      take: 20,
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ users });
  } catch (err) {
    return handleApiError(err);
  }
}
