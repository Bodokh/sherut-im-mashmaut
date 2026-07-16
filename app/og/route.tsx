import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

const size = { width: 1200, height: 630 };

export const dynamic = "force-static";

export async function GET() {
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
            alignItems: "center",
            justifyContent: "center",
            width: 300,
            height: 300,
            borderRadius: 72,
            background: "rgba(255,255,255,0.95)",
            boxShadow: "0 30px 80px rgba(9,37,83,0.22)",
          }}
        >
          {/* Satori renders image-response assets from standard img elements. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={224} height={224} alt="" />
        </div>
      </div>
    ),
    size,
  );
}
