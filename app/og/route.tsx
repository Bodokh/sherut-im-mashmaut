import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { siteRouteKeys, type SiteRouteKey } from "@/lib/routes";

const size = { width: 1200, height: 630 };

function isSiteRouteKey(value: string | null): value is SiteRouteKey {
  return value !== null && siteRouteKeys.includes(value as SiteRouteKey);
}

// Satori's default font renderer paints Hebrew glyph runs left-to-right in
// route-handler images. Reversing the code points here restores the visual
// order while the page metadata itself remains normal RTL text.
function imageText(value: string, locale: "he" | "en") {
  return locale === "he" ? Array.from(value).reverse().join("") : value;
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const localeParam = searchParams.get("locale");
  const routeParam = searchParams.get("route");
  const locale = localeParam && isLocale(localeParam) ? localeParam : "he";
  const route = isSiteRouteKey(routeParam) ? routeParam : "home";
  const dict = getDictionary(locale);
  const pageTitle = dict.seo[route].title.split("|")[0].trim();
  const logoData = await readFile(join(process.cwd(), "public/images/logo-mark.png"), "base64");
  const logoSrc = `data:image/png;base64,${logoData}`;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: "linear-gradient(135deg, #f5fbff 0%, #9ed9f7 48%, #164f9f 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 720,
            height: 720,
            borderRadius: 999,
            background: "rgba(255,255,255,0.35)",
            left: -220,
            top: -280,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 520,
            height: 520,
            borderRadius: 999,
            background: "rgba(45,184,107,0.23)",
            right: -130,
            bottom: -250,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            direction: locale === "he" ? "rtl" : "ltr",
            alignItems: "center",
            justifyContent: "center",
            width: 1040,
            minHeight: 430,
            padding: "48px 64px",
            borderRadius: 64,
            background: "rgba(255,255,255,0.94)",
            boxShadow: "0 30px 80px rgba(9,37,83,0.22)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {/* Satori renders image-response assets from standard img elements. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} width={132} height={132} alt="" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ color: "#123f82", fontSize: 42, fontWeight: 800 }}>
                {imageText(dict.brand.name, locale)}
              </div>
              <div style={{ color: "#42617f", fontSize: 25, marginTop: 5 }}>
                {imageText(dict.brand.tagline, locale)}
              </div>
            </div>
          </div>
          <div
            style={{
              color: "#12233e",
              fontSize: pageTitle.length > 42 ? 53 : 62,
              fontWeight: 800,
              lineHeight: 1.12,
              marginTop: 38,
              maxWidth: 900,
              textAlign: "center",
            }}
          >
            {imageText(pageTitle, locale)}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
