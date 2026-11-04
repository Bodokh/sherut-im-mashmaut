import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { ogCopy } from "@/lib/og-copy";
import { siteRouteKeys, type SiteRouteKey } from "@/lib/routes";

const size = { width: 1200, height: 630 };

function isSiteRouteKey(value: string | null): value is SiteRouteKey {
  return value !== null && siteRouteKeys.includes(value as SiteRouteKey);
}

// Satori paints Hebrew glyph runs left-to-right. Reverse each deliberately
// unwrapped line, leaving metadata and English text in their logical order.
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
  const copy = ogCopy[locale][route];
  const rtl = locale === "he";
  const [artwork, logo, regular, bold] = await Promise.all([
    readFile(join(process.cwd(), "assets/og/artwork", `${route}.jpg`), "base64"),
    readFile(join(process.cwd(), "public/images/logo-mark.png"), "base64"),
    readFile(join(process.cwd(), "assets/og/Heebo-Regular.ttf")),
    readFile(join(process.cwd(), "assets/og/Heebo-Bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#102d40",
          fontFamily: "Heebo",
          color: "#f6f5ee",
        }}
      >
        {/* Local assets keep social crawlers independent of external requests. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/jpeg;base64,${artwork}`}
          width={1200}
          height={630}
          alt=""
          style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "linear-gradient(90deg, transparent 28%, rgba(16,45,64,0.18) 35%, rgba(16,45,64,0.92) 44%, rgba(16,45,64,0.95) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 52,
            right: 60,
            width: 590,
            display: "flex",
            flexDirection: rtl ? "row-reverse" : "row",
            alignItems: "center",
            justifyContent: rtl ? "flex-start" : "flex-end",
            gap: 18,
          }}
        >
          {/* Preserve the original logo without AI redrawing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${logo}`} width={82} height={82} alt="" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: rtl ? "flex-end" : "flex-start" }}>
            <div style={{ fontSize: 29, fontWeight: 700, lineHeight: 1.35, whiteSpace: "nowrap" }}>
              {imageText(dict.brand.name, locale)}
            </div>
            <div style={{ color: "#b8d2df", fontSize: 19, marginTop: 4, whiteSpace: "nowrap" }}>
              {imageText(dict.brand.tagline, locale)}
            </div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            top: 208,
            right: 60,
            width: 610,
            display: "flex",
            flexDirection: "column",
            alignItems: rtl ? "flex-end" : "flex-start",
          }}
        >
          <div style={{ color: "#b8e5f5", fontSize: 22, lineHeight: 1.4, whiteSpace: "nowrap" }}>
            {imageText(dict.routeLabels[route], locale)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: rtl ? "flex-end" : "flex-start", marginTop: 18 }}>
            {copy.title.map((line) => (
              <div key={line} style={{ fontSize: rtl ? 76 : 64, fontWeight: 700, lineHeight: 1.18, letterSpacing: rtl ? 0 : -1.8, whiteSpace: "nowrap" }}>
                {imageText(line, locale)}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: rtl ? "flex-end" : "flex-start", marginTop: 22 }}>
            {copy.subtitle.map((line) => (
              <div key={line} style={{ color: "#c9dae3", fontSize: rtl ? 25 : 23, lineHeight: 1.5, whiteSpace: "nowrap" }}>
                {imageText(line, locale)}
              </div>
            ))}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 44,
            right: 60,
            display: "flex",
            color: "#b8d2df",
            fontSize: 19,
            letterSpacing: 0.6,
          }}
        >
          imashmaut.co.il
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Heebo", data: regular, weight: 400, style: "normal" },
        { name: "Heebo", data: bold, weight: 700, style: "normal" },
      ],
      headers: {
        "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
