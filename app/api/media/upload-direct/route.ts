import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { assertConversationMember } from "@/lib/db/authorization";
import path from "path";
import fs from "fs";

/**
 * PUT /api/media/upload-direct?key=pending/...
 * Local storage upload handler when Cloudflare R2 is not configured.
 * Preserves the exact same presigned PUT contract as R2:
 *  - Authenticated & authorized
 *  - Enforces pending prefix
 *  - Prevents path traversal
 *  - Saves to public/uploads/pending/...
 */
export async function PUT(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");

    if (!key || !key.startsWith("pending/") || key.includes("..")) {
      return NextResponse.json({ error: { code: "INVALID_KEY", message: "Invalid storage key" } }, { status: 400 });
    }

    // Key format: pending/<conversationId>/<filename>
    const parts = key.split("/");
    const conversationId = parts[1];
    if (conversationId) {
      await assertConversationMember(user.id, conversationId);
    }

    const localFilePath = path.join(process.cwd(), "public", "uploads", key);
    const dir = path.dirname(localFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const arrayBuffer = await req.arrayBuffer();
    fs.writeFileSync(localFilePath, Buffer.from(arrayBuffer));

    return new NextResponse("OK", { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: { code: "UPLOAD_ERROR", message } }, { status: 500 });
  }
}
