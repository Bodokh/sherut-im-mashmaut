import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { YOUTUBE_CACHE_TAG } from "@/lib/youtube";

function isAuthorized(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const provided = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

// Pulls fresh videos from YouTube right away instead of waiting for the
// scheduled refresh: curl -X POST -H "Authorization: Bearer $SECRET" …/api/revalidate-videos
export async function POST(request: Request) {
  const secret = process.env.VIDEOS_REVALIDATE_SECRET;
  if (!secret) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  revalidateTag(YOUTUBE_CACHE_TAG, { expire: 0 });
  return Response.json({ revalidated: true });
}
