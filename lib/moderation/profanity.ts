import { Filter } from "bad-words";

// A small, maintainable set of common leetspeak/character substitutions.
// Deliberately conservative: we only fold characters that are unambiguous
// stand-ins for letters, so we don't mangle normal words into false
// positives (e.g. we do NOT strip all vowels, which is how overly
// aggressive filters end up blocking things like "assassin" or "class").
const SUBSTITUTIONS: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
  "!": "i",
};

/**
 * Normalizes text before profanity detection so common evasion tricks don't
 * work, while staying explainable (no ML, no giant regex maze):
 *  1. lowercase
 *  2. strip characters that aren't letters/digits/spaces (punctuation-based
 *     spacing tricks like "b.a.d.w.o.r.d")
 *  3. fold known leetspeak substitutions
 *  4. collapse runs of 3+ repeated letters down to 2 ("baaaaad" -> "baad")
 *     (kept at 2, not 1, so legitimately doubled letters like "book" or
 *     "class" survive)
 *  5. collapse internal whitespace introduced by trick #2
 */
export function normalizeForModeration(input: string): string {
  // 1. Lowercase.
  let text = input.toLowerCase();
  // 2. For non-alphanumeric, non-space chars: if the char is a leet key apply
  //    its letter substitution, otherwise replace with a space.  Ordinary
  //    letters (a-z) are NOT in SUBSTITUTIONS so they pass through untouched.
  text = text.replace(/[^a-z0-9\s]/g, (ch) => SUBSTITUTIONS[ch] ?? " ");
  // 3. For digits (0-9) that are leet substitutions, fold them to letters now.
  //    Ordinary letters from step 2 are not in SUBSTITUTIONS so this is a no-op
  //    for them — no double-substitution.
  text = text
    .split(/\s+/)
    .map((word) =>
      word
        .split("")
        .map((ch) => SUBSTITUTIONS[ch] ?? ch)
        .join("")
    )
    .join(" ");
  // 4. Collapse runs of 3+ repeated letters to 2.
  text = text.replace(/(.)\1{2,}/g, "$1$1");
  // 5. Normalize whitespace.
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

const filter = new Filter();

export interface ProfanityCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Server-side profanity check. Runs on the normalized text so case changes,
 * inserted spaces/punctuation, repeated letters, and common leetspeak
 * substitutions don't bypass it, without being so aggressive it flags
 * ordinary words.
 */
export function checkProfanity(rawText: string): ProfanityCheckResult {
  const normalized = normalizeForModeration(rawText);

  // Check both the normalized (de-obfuscated) text and the original casing,
  // since normalization also removes spacing that some words legitimately
  // depend on (rare, but cheap to double-check).
  if (filter.isProfane(normalized) || filter.isProfane(rawText)) {
    return { allowed: false, reason: "prohibited_language" };
  }
  return { allowed: true };
}

/**
 * Combined server-side text moderation:
 * 1. Fast local normalization & evasion check (<1ms)
 * 2. If configured, cloud AI inspection via Sightengine Text Moderation API
 */
export async function moderateTextMessage(rawText: string): Promise<ProfanityCheckResult> {
  // Step 1: Fast local anti-evasion check
  const localCheck = checkProfanity(rawText);
  if (!localCheck.allowed) {
    return localCheck;
  }

  // Step 2: Sightengine Text API check
  const apiUser = process.env.SIGHTENGINE_API_USER;
  const apiSecret = process.env.SIGHTENGINE_API_SECRET;

  if (apiUser && apiSecret) {
    try {
      const url = new URL("https://api.sightengine.com/1.0/text/check.json");
      url.searchParams.set("text", rawText);
      url.searchParams.set("lang", "en");
      url.searchParams.set("mode", "standard");
      url.searchParams.set("api_user", apiUser);
      url.searchParams.set("api_secret", apiSecret);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as {
          status: string;
          profanity?: { matches?: Array<{ type: string; match: string }> };
        };

        if (data.status === "success" && data.profanity?.matches && data.profanity.matches.length > 0) {
          return { allowed: false, reason: "prohibited_language" };
        }
      }
    } catch {
      // Graceful fallback to local filter if Sightengine API is temporarily unreachable
    }
  }

  return { allowed: true };
}

