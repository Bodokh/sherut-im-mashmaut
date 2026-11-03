import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Paths are root-relative on purpose: they resolve against whichever host serves
// the manifest, so the same file works on a future staff subdomain.
const manifest: MetadataRoute.Manifest = {
  id: "/staff",
  name: "ליווי – שירות עם משמעות",
  short_name: "ליווי",
  description: "סביבת העבודה של צוות הליווי בשירות עם משמעות.",
  lang: "he",
  dir: "rtl",
  start_url: "/staff",
  scope: "/staff",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#ffffff",
  icons: [
    { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
  ],
};

export function GET() {
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
