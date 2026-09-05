import { redis } from "@/lib/rate-limit";

/**
 * Presence needs to answer "does this user have ANY active socket
 * connection", not "is this specific socket connected" - a user with two
 * tabs open who closes one tab must stay "online". We track this with a
 * Redis counter per user (incremented on connect, decremented on
 * disconnect); the user is only "offline" when the counter hits zero.
 *
 * Falls back to an in-process Map when Redis isn't configured (local dev
 * without Upstash) - documented as a limitation: presence in that mode is
 * only correct within a single socket-server process, which is fine for
 * local development but not for a multi-instance deployment.
 */
const memoryFallback = new Map<string, number>();
const usingRedis = Boolean(redis);

async function incr(userId: string): Promise<number> {
  if (usingRedis && redis) {
    return redis.incr(`presence:${userId}`);
  }
  const next = (memoryFallback.get(userId) ?? 0) + 1;
  memoryFallback.set(userId, next);
  return next;
}

async function decr(userId: string): Promise<number> {
  if (usingRedis && redis) {
    const val = await redis.decr(`presence:${userId}`);
    if (val <= 0) await redis.del(`presence:${userId}`);
    return Math.max(val, 0);
  }
  const next = Math.max((memoryFallback.get(userId) ?? 1) - 1, 0);
  if (next === 0) memoryFallback.delete(userId);
  else memoryFallback.set(userId, next);
  return next;
}

/** Call on socket connect. Returns true if this is the user's first active session. */
export async function registerConnection(userId: string): Promise<{ wentOnline: boolean }> {
  const count = await incr(userId);
  return { wentOnline: count === 1 };
}

/** Call on socket disconnect. Returns true if the user has no more active sessions. */
export async function registerDisconnection(userId: string): Promise<{ wentOffline: boolean }> {
  const count = await decr(userId);
  return { wentOffline: count === 0 };
}

export async function isOnline(userId: string): Promise<boolean> {
  if (usingRedis && redis) {
    const val = await redis.get<number>(`presence:${userId}`);
    return Boolean(val && val > 0);
  }
  return (memoryFallback.get(userId) ?? 0) > 0;
}
