export interface GifResult {
  id: string;
  title: string;
  previewUrl: string; // small, fast-loading rendition for the picker grid
  sendUrl: string; // rendition actually sent/stored in the message
  width: number;
  height: number;
}

export interface GifProvider {
  isConfigured(): boolean;
  search(query: string, limit: number): Promise<GifResult[]>;
  trending(limit: number): Promise<GifResult[]>;
}

class GiphyProvider implements GifProvider {
  isConfigured(): boolean {
    const key = process.env.GIPHY_API_KEY;
    return Boolean(key && !key.includes("your-"));
  }

  private get apiKey(): string {
    const key = process.env.GIPHY_API_KEY;
    if (!key || key.includes("your-")) throw new Error("GIPHY_API_KEY is not configured");
    return key;
  }

  async search(query: string, limit: number): Promise<GifResult[]> {
    const url = new URL("https://api.giphy.com/v1/gifs/search");
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("rating", "pg-13");
    return this.fetchAndMap(url);
  }

  async trending(limit: number): Promise<GifResult[]> {
    const url = new URL("https://api.giphy.com/v1/gifs/trending");
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("rating", "pg-13");
    return this.fetchAndMap(url);
  }

  private async fetchAndMap(url: URL): Promise<GifResult[]> {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      throw new Error(`GIPHY request failed with status ${res.status}`);
    }
    const body = await res.json();
    return (body.data as Record<string, any>[]).map((gif) => ({
      id: gif.id,
      title: gif.title || "GIF",
      previewUrl: gif.images.fixed_width_small.url,
      sendUrl: gif.images.fixed_width.url,
      width: Number(gif.images.fixed_width.width),
      height: Number(gif.images.fixed_width.height),
    }));
  }
}

export const gifProvider: GifProvider = new GiphyProvider();
