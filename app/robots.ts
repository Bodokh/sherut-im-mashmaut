import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/routes";

const AI_AND_SEARCH_CRAWLERS = [
  "Googlebot",
  "Bingbot",
  "OAI-SearchBot",
  "GPTBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
      {
        userAgent: AI_AND_SEARCH_CRAWLERS,
        allow: "/",
        disallow: "/api/",
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
