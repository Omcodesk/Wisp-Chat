import { decode } from "next-auth/jwt";
import cookie from "cookie";

export interface SocketUser {
  id: string;
  name: string;
  email: string;
}

const COOKIE_NAMES = ["next-auth.session-token", "__Secure-next-auth.session-token"];

/**
 * The standalone Socket.IO process is a separate Node process from Next.js,
 * so it can't call getServerSession(). Instead it independently decodes the
 * same signed JWT cookie Auth.js issues, using the shared secret
 * (SOCKET_AUTH_SECRET === AUTH_SECRET). This is the socket-layer equivalent
 * of lib/auth/session.ts:requireUser() - the client's handshake payload
 * (e.g. any userId it claims) is never trusted; only this decoded, signed
 * token is.
 */
export async function verifySocketSession(rawCookieHeader: string | undefined): Promise<SocketUser | null> {
  if (!rawCookieHeader) return null;

  const parsed = cookie.parse(rawCookieHeader);
  const tokenCookie = COOKIE_NAMES.map((name) => parsed[name]).find(Boolean);
  if (!tokenCookie) return null;

  const secret = process.env.SOCKET_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("SOCKET_AUTH_SECRET / AUTH_SECRET is not configured");
  }

  try {
    const decoded = await decode({ token: tokenCookie, secret });
    if (!decoded?.userId) return null;
    return {
      id: decoded.userId as string,
      name: (decoded.name as string) ?? "",
      email: (decoded.email as string) ?? "",
    };
  } catch {
    return null;
  }
}
