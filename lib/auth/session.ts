import { getServerSession } from "next-auth";
import { authOptions } from "./options";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedError";
  }
}

/**
 * The ONLY sanctioned way to learn "who is making this request" in an API
 * route. Every protected route calls this first and derives senderId /
 * userId from its return value - never from req.body or req.query.
 */
export async function requireUser(): Promise<{ id: string; name: string; email: string }> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !id) {
    throw new UnauthenticatedError();
  }
  return { id, name: session.user.name ?? "", email: session.user.email ?? "" };
}
