/**
 * A single curated sticker pack, bundled rather than fetched from a
 * third-party API (per the assignment's fallback allowance in section 21).
 * Assets are Twemoji (https://github.com/twitter/twemoji), licensed
 * CC-BY 4.0, served from jsDelivr's public CDN. Each is a small SVG
 * (typically a few KB), so this doesn't introduce a heavy asset download.
 */
export interface StickerDefinition {
  id: string;
  label: string;
  url: string;
}

const TWEMOJI_BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg";

const codepoints: Array<{ id: string; label: string; codepoint: string }> = [
  { id: "wave", label: "Waving hand", codepoint: "1f44b" },
  { id: "thumbs-up", label: "Thumbs up", codepoint: "1f44d" },
  { id: "heart", label: "Red heart", codepoint: "2764" },
  { id: "fire", label: "Fire", codepoint: "1f525" },
  { id: "laughing", label: "Laughing", codepoint: "1f602" },
  { id: "party", label: "Party popper", codepoint: "1f389" },
  { id: "thinking", label: "Thinking face", codepoint: "1f914" },
  { id: "clap", label: "Clapping hands", codepoint: "1f44f" },
  { id: "star-eyes", label: "Star struck", codepoint: "1f929" },
  { id: "cool", label: "Smiling with sunglasses", codepoint: "1f60e" },
  { id: "cry-laugh", label: "Crying with laughter", codepoint: "1f923" },
  { id: "ok-hand", label: "OK hand", codepoint: "1f44c" },
];

export const stickerPack: StickerDefinition[] = codepoints.map((c) => ({
  id: c.id,
  label: c.label,
  url: `${TWEMOJI_BASE}/${c.codepoint}.svg`,
}));
