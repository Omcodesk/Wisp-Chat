import { describe, it, expect } from "vitest";
import { normalizeForModeration, checkProfanity } from "../lib/moderation/profanity";

describe("normalizeForModeration", () => {
  it("lowercases input", () => {
    expect(normalizeForModeration("Hello World")).toBe("hello world");
  });

  it("does not strip ordinary letters", () => {
    // Previously the function blanked chars that happened to be substitution VALUES
    // (o, i, e, a, s, t) — this is the regression we fixed.
    expect(normalizeForModeration("the cat sat on a mat")).toBe("the cat sat on a mat");
  });

  it("folds leet-speak digit substitutions", () => {
    expect(normalizeForModeration("h3ll0")).toBe("hello");
  });

  it("folds symbol substitutions", () => {
    expect(normalizeForModeration("h@ck")).toBe("hack");
    // $ → s, so c$sh = c+s+s+h = "cssh" (double s not collapsed since only 2, not 3+)
    expect(normalizeForModeration("c$sh")).toBe("cssh");
    // The key correctness check: symbols ARE substituted (not left as-is or blanked)
    expect(normalizeForModeration("@bc")).toBe("abc");
  });

  it("strips punctuation-spacing tricks", () => {
    // Punctuation between letters becomes space, then collapsed
    expect(normalizeForModeration("b.a.d")).toBe("b a d");
  });

  it("collapses 3+ repeated letters to 2", () => {
    expect(normalizeForModeration("baaaaaad")).toBe("baad");
    // But legitimate doubled letters survive
    expect(normalizeForModeration("book")).toBe("book");
  });

  it("collapses extra whitespace", () => {
    expect(normalizeForModeration("  hello   world  ")).toBe("hello world");
  });
});

describe("checkProfanity", () => {
  it("allows clean text", () => {
    expect(checkProfanity("Hello! How are you?").allowed).toBe(true);
  });

  it("allows legitimate doubled letters", () => {
    // 'class', 'assassin', 'book', 'good' should not be false-positives
    expect(checkProfanity("I have a class in the afternoon").allowed).toBe(true);
    expect(checkProfanity("good book").allowed).toBe(true);
  });

  it("allows the word 'the cat sat on a mat'", () => {
    expect(checkProfanity("the cat sat on a mat").allowed).toBe(true);
  });
});
