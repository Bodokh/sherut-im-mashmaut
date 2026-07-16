import Image from "next/image";

import { Eyebrow, Section } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";

type MapPoint = {
  x: number;
  y: number;
  side: "left" | "right";
  labelOffset?: number;
};

const mapPoints: readonly MapPoint[] = [
  { x: 57.72, y: 42.31, side: "right" }, // Jerusalem
  { x: 74.49, y: 33.89, side: "right", labelOffset: 15 }, // Jordan Valley
  { x: 61.6, y: 31.85, side: "right", labelOffset: -15 }, // Judea & Samaria
  { x: 32.98, y: 55.4, side: "right" }, // Be'er Sheva
  { x: 33.54, y: 71.74, side: "right" }, // Mitzpe Ramon
  { x: 32.41, y: 34.26, side: "left" }, // Tel Aviv
  { x: 40.48, y: 25.4, side: "left", labelOffset: 6 }, // Hadera
  { x: 42.37, y: 21.92, side: "left", labelOffset: -6 }, // Zikhron Ya'akov
  { x: 85.04, y: 11.54, side: "right" }, // Golan Heights
] as const;

export function ReachMap({ dict }: { dict: Dictionary }) {
  const t = dict.reach;

  return (
    <Section id="reach" tone="navy" className="overflow-hidden">
      <div aria-hidden className="weave pointer-events-none absolute inset-0 opacity-60" />
      <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative grid items-center gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(26rem,1.15fr)] lg:gap-20">
        <div className="max-w-xl" data-reveal>
          <Eyebrow tone="dark">{t.kicker}</Eyebrow>
          <h2 className="mt-5 text-[clamp(2.35rem,5vw,4.9rem)] font-black leading-[0.98] text-white">
            {t.title}
          </h2>
          <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-brand-100">{t.lead}</p>

          <ul className="mt-8 flex flex-wrap gap-2" aria-label={t.mapLabel}>
            {t.cities.map((city) => (
              <li
                key={city}
                className="rounded-full border border-white/15 bg-white/8 px-3.5 py-1.5 text-sm font-medium text-brand-50 backdrop-blur-sm"
              >
                {city}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto aspect-[4/5] w-full max-w-[35rem]" data-reveal="scale">
          <div className="absolute inset-[4%_7%] rounded-[3rem] border border-white/10 bg-white/[0.035] shadow-glow" />
          <div className="absolute left-1/2 top-1/2 h-[94%] aspect-[294.62534/792.60406] -translate-x-1/2 -translate-y-1/2">
            <Image
              aria-hidden="true"
              alt=""
              src="/media/israel-map.svg"
              width={2357}
              height={6341}
              sizes="(max-width: 640px) 45vw, 18rem"
              unoptimized
              className="absolute inset-0 h-full w-full drop-shadow-[0_28px_50px_rgba(4,20,55,0.42)]"
            />

            <svg
              aria-hidden="true"
              viewBox="0 0 294.62534 792.60406"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <defs>
                <linearGradient id="israel-route-line" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--color-green-300)" />
                  <stop offset="1" stopColor="var(--color-brand-50)" />
                </linearGradient>
              </defs>
              <path
                d="M250 92C222 148 165 170 139 220c-21 41-18 78 30 115 26 20-6 68-70 104-22 44-16 87 0 129 17 44 11 107 25 165"
                fill="none"
                stroke="url(#israel-route-line)"
                strokeDasharray="4 11"
                strokeLinecap="round"
                strokeWidth="2.5"
                opacity="0.72"
              />
            </svg>

            <ul aria-hidden className="absolute inset-0 z-10">
              {mapPoints.map((point, index) => (
                <li
                  key={t.cities[index]}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                >
                  <span className="relative block h-3.5 w-3.5 rounded-full border-[3px] border-brand-950 bg-green-300 shadow-[0_0_0_5px_rgba(255,255,255,0.18),0_0_24px_rgba(123,224,167,0.75)]" />
                  <span
                    className={`absolute top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-full border border-white/10 bg-brand-950/80 px-2.5 py-1 text-xs font-semibold text-white shadow-soft backdrop-blur-sm sm:block ${
                      point.side === "right" ? "left-5" : "right-5"
                    }`}
                    style={{ marginTop: point.labelOffset }}
                  >
                    {t.cities[index]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
