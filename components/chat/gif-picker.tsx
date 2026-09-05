"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Search, X, Loader2, Smile, AlertCircle } from "lucide-react";

interface GifResult {
  id: string;
  title: string;
  previewUrl: string;
  sendUrl: string;
  width: number;
  height: number;
}

interface Props {
  onSelect: (gif: { sendUrl: string; width: number; height: number }) => void;
  onClose: () => void;
}

export function GifPicker({ onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const url = q.trim()
        ? `/api/gifs/search?q=${encodeURIComponent(q)}&limit=24`
        : `/api/gifs/search?q=&limit=24`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.code === "GIPHY_NOT_CONFIGURED") {
          setNotConfigured(true);
        } else {
          setErrorMessage(data?.error?.message ?? "Failed to search GIFs.");
        }
        setResults([]);
        return;
      }
      setNotConfigured(false);
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    search("");
  }, [search]);

  const handleQueryChange = useCallback(
    (q: string) => {
      setQuery(q);
      if (searchRef.current) clearTimeout(searchRef.current);
      searchRef.current = setTimeout(() => search(q), 350);
    },
    [search]
  );

  return (
    <div className="flex flex-col bg-surface-raised/95 backdrop-blur-md">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-accent">
          <Smile className="h-4 w-4" />
          <span>GIPHY Search</span>
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder="Search all GIFs…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            disabled={notConfigured}
            autoFocus
            className="w-full rounded-lg border border-border bg-canvas pl-8 pr-7 py-1.5 text-xs text-ink placeholder:text-ink-faint outline-none transition focus:border-accent focus:ring-1 focus:ring-accent/20 disabled:opacity-50"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                search("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="rounded-lg p-1 text-ink-muted hover:bg-surface-active hover:text-ink transition"
          aria-label="Close GIF picker"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Grid Content */}
      <div className="max-h-60 overflow-y-auto p-3 scrollbar-thin">
        {loading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-video animate-pulse rounded-lg bg-surface-active" />
            ))}
          </div>
        ) : notConfigured ? (
          <div className="flex flex-col items-center justify-center py-6 px-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 mb-2">
              <AlertCircle className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-ink">GIPHY API Not Configured</p>
            <p className="mt-1 text-[11px] text-ink-muted max-w-sm">
              GIPHY search requires a valid <code className="rounded bg-surface px-1 py-0.5 text-accent">GIPHY_API_KEY</code> set in your environment variables.
            </p>
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-danger">
            <p>{errorMessage}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-xs text-ink-muted">
              {query ? `No GIFs found for "${query}"` : "No trending GIFs available."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelect({ sendUrl: gif.sendUrl, width: gif.width, height: gif.height })}
                className="group relative aspect-video overflow-hidden rounded-lg border border-border/60 bg-black/40 transition-all duration-150 hover:scale-[1.03] hover:ring-2 hover:ring-accent hover:border-accent active:scale-95"
                title={gif.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gif.previewUrl}
                  alt={gif.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
