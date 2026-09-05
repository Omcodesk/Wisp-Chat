import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthenticatedError } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/db/authorization";

/**
 * Central error -> HTTP response mapping. Never leaks stack traces or raw
 * error messages from unexpected exceptions to the client; those are
 * logged server-side only and returned as a generic message.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Please log in." } }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: err.message } }, { status: 403 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request.", details: err.flatten() } },
      { status: 400 }
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } }, { status: 500 });
}

export function rateLimitedResponse(resetAt: number): NextResponse {
  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down." } },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } }
  );
}
