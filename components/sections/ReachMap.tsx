import type { CSSProperties } from "react";
import Image from "next/image";

import { Section } from "@/components/ui/Section";
import { PinnedSceneFit } from "@/components/ui/PinnedSceneFit";
import type { Dictionary } from "@/i18n/dictionaries";

import styles from "./ReachMap.module.css";

type MapPoint = {
  x: number;
  y: number;
  side: "left" | "right";
  revealOrder: number;
  labelOffset?: number;
};

const mapPoints: readonly MapPoint[] = [
  { x: 57.72, y: 42.31, side: "right", revealOrder: 6 }, // Jerusalem
  { x: 74.49, y: 33.89, side: "right", revealOrder: 4, labelOffset: 15 }, // Jordan Valley
  { x: 61.6, y: 31.85, side: "right", revealOrder: 3, labelOffset: -15 }, // Judea & Samaria
  { x: 32.98, y: 55.4, side: "right", revealOrder: 7 }, // Be'er Sheva
  { x: 33.54, y: 71.74, side: "right", revealOrder: 8 }, // Mitzpe Ramon
  { x: 32.41, y: 34.26, side: "left", revealOrder: 5 }, // Tel Aviv
  { x: 40.48, y: 25.4, side: "left", revealOrder: 2, labelOffset: 6 }, // Hadera
  { x: 42.37, y: 21.92, side: "left", revealOrder: 1, labelOffset: -6 }, // Zikhron Ya'akov
  { x: 85.04, y: 11.54, side: "right", revealOrder: 0 }, // Golan Heights
] as const;

const routePath =
  "M250 92C222 148 165 170 139 220c-21 41-18 78 30 115 26 20-6 68-70 104-22 44-16 87 0 129 17 44 11 107 25 165";

function pointRange(order: number): CSSProperties {
  return {
    "--point-start": `contain ${order * 10}%`,
    "--point-end": `contain ${order * 10 + 9}%`,
  } as CSSProperties;
}

export function ReachMap({ dict }: { dict: Dictionary }) {
  const t = dict.reach;

  return (
    <Section id="reach" tone="navy" className={styles.reach} shell={false}>
      <PinnedSceneFit />
      <div className={`shell ${styles.composition}`} data-pinned-content="">
        <div className={styles.content}>
          <div className={styles.copy}>
            <p className={styles.sectionName}>{t.kicker}</p>
            <h2 className={styles.title}>
              {t.title}
            </h2>
            <p className={styles.lead}>{t.lead}</p>
          </div>

          <ul className={styles.cityIndex} aria-label={t.mapLabel}>
            {t.cities.map((city, index) => (
              <li key={city} style={pointRange(mapPoints[index]?.revealOrder ?? index)}>
                {city}
              </li>
            ))}
          </ul>
        </div>

        <div
          id="reach-map-visual"
          className={styles.mapStage}
        >
          <div
            className={`absolute left-1/2 top-1/2 h-[94%] aspect-[294.62534/792.60406] -translate-x-1/2 -translate-y-1/2 ${styles.mapBody}`}
          >
            <Image
              aria-hidden="true"
              alt=""
              src="/media/israel-map.svg"
              width={2357}
              height={6341}
              sizes="(max-width: 640px) 45vw, 18rem"
              unoptimized
              className="absolute inset-0 h-full w-full"
            />

            <svg
              aria-hidden="true"
              viewBox="0 0 294.62534 792.60406"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <defs>
                <linearGradient id="israel-route-line" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#b8d0bc" />
                  <stop offset="1" stopColor="#d7e6e9" />
                </linearGradient>
              </defs>
              <path
                d={routePath}
                fill="none"
                stroke="url(#israel-route-line)"
                strokeDasharray="4 11"
                strokeLinecap="round"
                strokeWidth="2"
                opacity="0.48"
              />
              <path
                className={styles.routeDraw}
                d={routePath}
                fill="none"
                pathLength="1"
                stroke="#d7e6df"
                strokeDasharray="1"
                strokeDashoffset="0"
                strokeLinecap="round"
                strokeWidth="2.5"
              />
            </svg>

            <ul aria-hidden className="absolute inset-0 z-10">
              {mapPoints.map((point, index) => (
                <li
                  key={t.cities[index]}
                  className={`absolute ${styles.mapPoint}`}
                  style={
                    {
                      left: `${point.x}%`,
                      top: `${point.y}%`,
                      ...pointRange(point.revealOrder),
                    } as CSSProperties
                  }
                >
                  <span className={styles.pointMarker} />
                  <svg viewBox="0 -24 28 48" className={styles.pointLeader} data-side={point.side} fill="none">
                    <path d={`M0 0H12L28 ${point.labelOffset ?? 0}`} />
                  </svg>
                  <span
                    className={styles.mapLabel}
                    data-side={point.side}
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
