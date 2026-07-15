import { Eyebrow, Section } from "@/components/ui/Section";
import type { Dictionary } from "@/i18n/dictionaries";

const mapPoints = [
  { x: 65, y: 49, side: "right" }, // Jerusalem
  { x: 72, y: 45, side: "right" }, // Jordan Valley
  { x: 66, y: 38, side: "right" }, // Judea & Samaria
  { x: 52, y: 64, side: "right" }, // Be'er Sheva
  { x: 49, y: 78, side: "right" }, // Mitzpe Ramon
  { x: 38, y: 43, side: "left" }, // Tel Aviv
  { x: 39, y: 34, side: "left" }, // Hadera
  { x: 40, y: 29, side: "left" }, // Zikhron Ya'akov
  { x: 66, y: 13, side: "right" }, // Golan Heights
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
          <svg
            aria-hidden="true"
            viewBox="0 0 360 640"
            className="absolute inset-0 h-full w-full drop-shadow-[0_28px_50px_rgba(4,20,55,0.35)]"
          >
            <defs>
              <linearGradient id="israel-map-fill" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="var(--color-brand-300)" stopOpacity="0.95" />
                <stop offset="0.55" stopColor="var(--color-brand-500)" stopOpacity="0.88" />
                <stop offset="1" stopColor="var(--color-brand-700)" stopOpacity="0.96" />
              </linearGradient>
              <linearGradient id="israel-route-line" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--color-green-300)" />
                <stop offset="1" stopColor="var(--color-brand-50)" />
              </linearGradient>
            </defs>
            <path
              d="M180 23c18 7 28 22 42 29l17 18-9 22 12 22-10 27 12 25-8 23 14 25-11 34 8 32-12 31 9 29-14 35-10 42-14 48-16 53-15 69-15 31-14-28 5-41-12-43 10-42-12-38 8-40-10-40 6-41-9-42 9-41-9-35 9-33-7-27 11-30-5-26 17-27Z"
              fill="url(#israel-map-fill)"
              stroke="var(--color-brand-100)"
              strokeOpacity="0.72"
              strokeWidth="2"
            />
            <path
              d="M223 84c-25 61-26 110 1 158 23 42 8 72-20 108-34 44-19 90-28 154"
              fill="none"
              stroke="url(#israel-route-line)"
              strokeDasharray="4 11"
              strokeLinecap="round"
              strokeWidth="2.5"
              opacity="0.75"
            />
          </svg>

          <ul aria-hidden className="absolute inset-0">
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
                >
                  {t.cities[index]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
