import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { gifSearchQuerySchema } from "@/lib/validation/schemas";
import { checkRateLimit, gifSearchRateLimit } from "@/lib/rate-limit";
import { gifProvider } from "@/lib/gif/provider";
import { handleApiError, rateLimitedResponse } from "@/lib/utils/api-error";

/**
 * GET /api/gifs/search?q=...
 * The GIPHY API key stays server-side (lib/gif/provider.ts) - the client
 * only ever talks to this route.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q");

    const rl = await checkRateLimit(gifSearchRateLimit, user.id);
    if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

    if (!gifProvider.isConfigured()) {
      return NextResponse.json(
        {
          error: {
            code: "GIPHY_NOT_CONFIGURED",
            message: "GIPHY API is not configured in this environment (missing GIPHY_API_KEY in .env).",
          },
        },
        { status: 503 }
      );
    }

    if (!q || !q.trim()) {
      const results = await gifProvider.trending(24);
      return NextResponse.json({ results });
    }

    const { q: query, limit } = gifSearchQuerySchema.parse({ q, limit: searchParams.get("limit") ?? undefined });
    const results = await gifProvider.search(query, limit);
    return NextResponse.json({ results });
  } catch (err) {
    return handleApiError(err);
  }
}
