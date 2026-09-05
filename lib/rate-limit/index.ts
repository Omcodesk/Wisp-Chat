import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const hasRedisConfig = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = hasRedisConfig
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : undefined;

// Documented starting-point limits (README "Rate limiting"). All are keyed
// by authenticated user id where the caller is authenticated, and by IP
// only for pre-auth endpoints (login).
export const messageRateLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 m"), prefix: "rl:message" })
  : undefined;

export const uploadRateLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 m"), prefix: "rl:upload" })
  : undefined;

export const authRateLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 m"), prefix: "rl:auth" })
  : undefined;

export const gifSearchRateLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m"), prefix: "rl:gif" })
  : undefined;

/**
 * Applies a rate limiter and returns whether the request is allowed. If
 * Redis isn't configured (e.g. a contributor running the app before setting
 * up Upstash), we log a loud warning and allow the request rather than
 * hard-failing local dev - but this must never happen in production, which
 * is why it's logged at warn level every time.
 */
export async function checkRateLimit(
  limiter: Ratelimit | undefined,
  key: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!limiter) {
    console.warn("[rate-limit] Upstash Redis not configured - rate limiting is DISABLED. Set UPSTASH_REDIS_REST_URL/TOKEN.");
    return { allowed: true, remaining: 999, resetAt: 0 };
  }
  const result = await limiter.limit(key);
  return { allowed: result.success, remaining: result.remaining, resetAt: result.reset };
}

export { redis };
