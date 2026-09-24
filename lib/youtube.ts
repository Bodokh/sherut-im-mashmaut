// The @imashmaut channel. Its "uploads" playlist shares the id with a UU prefix.
export const YOUTUBE_CHANNEL_ID = "UCRTrow8JzSYW9Ohy-ljOhAA";
const UPLOADS_PLAYLIST_ID = `UU${YOUTUBE_CHANNEL_ID.slice(2)}`;

export const YOUTUBE_CACHE_TAG = "youtube-videos";
// Refresh from YouTube at most every 3 hours; visitors always get the cached copy.
export const YOUTUBE_REVALIDATE_SECONDS = 60 * 60 * 3;

const API_BASE = "https://www.googleapis.com/youtube/v3";
const PAGE_SIZE = 50;
// 10 pages = 500 videos, far beyond the channel's size, and still ~20 quota units.
const MAX_PAGES = 10;

export type YouTubeVideo = {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnail: string;
  durationSeconds: number;
};

type Thumbnail = { url: string; width?: number; height?: number };

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items: { contentDetails: { videoId: string } }[];
};

type VideosResponse = {
  items: {
    id: string;
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      thumbnails: Partial<Record<"default" | "medium" | "high" | "standard" | "maxres", Thumbnail>>;
    };
    contentDetails: { duration: string };
    status: { privacyStatus: string; embeddable: boolean };
  }[];
};

async function youtubeGet<T>(path: string, params: Record<string, string>, apiKey: string): Promise<T> {
  const url = new URL(`${API_BASE}/${path}`);
  for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    next: { revalidate: YOUTUBE_REVALIDATE_SECONDS, tags: [YOUTUBE_CACHE_TAG] },
  });
  if (!response.ok) {
    // Never echo the URL: it carries the API key.
    throw new Error(`YouTube API ${path} failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchUploadIds(apiKey: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await youtubeGet<PlaylistItemsResponse>(
      "playlistItems",
      {
        part: "contentDetails",
        playlistId: UPLOADS_PLAYLIST_ID,
        maxResults: String(PAGE_SIZE),
        ...(pageToken ? { pageToken } : {}),
      },
      apiKey,
    );
    ids.push(...data.items.map((item) => item.contentDetails.videoId));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return ids;
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );
}

/** Parses an ISO 8601 duration such as PT1H2M3S into seconds. */
export function parseIsoDuration(value: string): number {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match.map((part) => Number(part ?? 0));
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

function bestThumbnail(thumbnails: VideosResponse["items"][number]["snippet"]["thumbnails"], id: string) {
  const best = thumbnails.maxres ?? thumbnails.standard ?? thumbnails.high ?? thumbnails.medium;
  return best?.url ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

async function fetchVideoDetails(ids: string[], apiKey: string): Promise<YouTubeVideo[]> {
  const batches = await Promise.all(
    chunk(ids, PAGE_SIZE).map((batch) =>
      youtubeGet<VideosResponse>(
        "videos",
        { part: "snippet,contentDetails,status", id: batch.join(","), maxResults: String(PAGE_SIZE) },
        apiKey,
      ),
    ),
  );

  return batches
    .flatMap((batch) => batch.items)
    .filter((item) => item.status.privacyStatus === "public" && item.status.embeddable)
    .map((item) => ({
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      thumbnail: bestThumbnail(item.snippet.thumbnails, item.id),
      durationSeconds: parseIsoDuration(item.contentDetails.duration),
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * All public videos on the channel, newest first. Responses are held in the
 * Next.js data cache, so this costs YouTube quota only when the cache refreshes.
 *
 * Without a key the page renders its "coming soon" state. A YouTube failure at
 * build time does the same so deploys never block on YouTube; at runtime it
 * throws, which makes Next.js keep serving the last good page and retry later.
 */
export async function getChannelVideos(): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn("YOUTUBE_API_KEY is not set; the videos page will render its empty state.");
    return [];
  }

  try {
    const ids = await fetchUploadIds(apiKey);
    if (ids.length === 0) return [];
    return await fetchVideoDetails(ids, apiKey);
  } catch (error) {
    console.error("Failed to load YouTube videos:", error);
    if (process.env.NEXT_PHASE === "phase-production-build") return [];
    throw new Error("Could not load videos from YouTube");
  }
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
