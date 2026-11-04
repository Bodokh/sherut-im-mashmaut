import Image from "next/image";
import type { CSSProperties } from "react";
import { Section } from "@/components/ui/Section";
import { PinnedSceneFit } from "@/components/ui/PinnedSceneFit";
import { MeaningMountains } from "./MeaningMountains";
import type { Dictionary } from "@/i18n/dictionaries";
import { media } from "@/lib/media";
import styles from "./Manifesto.module.css";

// Cover scales landscape photos by the scene height on tall displays. Include
// that hidden source width, plus the small desktop zoom, in responsive selection.
const widePhotoSizes = "(max-width: 767px) max(100vw, 136svh), max(104vw, calc(184svh - 10rem))";
const supportPhotoSizes = "(max-width: 767px) max(100vw, 114svh), max(104vw, calc(156svh - 8.5rem))";

// The strands share three trajectories, but each has its own curvature and
// scroll range. They are server-rendered geometry, not an animation runtime.
const meaningPaths = Array.from({ length: 24 }, (_, index) => {
  const lane = Math.floor(index / 8);
  const thread = index % 8;
  const spread = thread * 19;
  const d = lane === 0
    ? `M ${-240 + spread} 1080 C ${350 + spread} 1030 ${70 + spread} 730 ${445 + spread * 0.68} 360 C ${700 + spread * 0.46} 100 ${1000 + spread * 0.28} 240 ${1210 + spread * 0.16} -100`
    : lane === 1
      ? `M ${1680 - spread} 1100 C ${1040 - spread} 1010 ${1420 - spread} 680 ${1010 - spread * 0.7} 310 C ${790 - spread * 0.35} 110 ${760 - spread * 0.15} 20 ${720 - spread * 0.12} -110`
      : `M -180 ${845 + spread} C 150 ${900 + spread * 0.65} 245 ${820 - spread * 0.3} 410 ${775 - spread * 0.46} C 830 ${660 - spread * 0.34} 920 ${1050 - spread * 0.4} 1600 ${850 - spread * 0.55}`;

  return {
    d,
    lane,
    style: {
      "--draw-from": `${34 + thread * 2 + lane * 2}%`,
      "--draw-to": `${16 + thread * 0.2 + lane * 0.3}%`,
    } as CSSProperties,
  };
});

/** Separate paths find a shared direction as the opening is scrolled. */
function MeaningPaths() {
  return (
    <svg
      className={styles.pathField}
      viewBox="0 0 1440 1000"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="manifesto-silver-path" x1="180" y1="980" x2="1090" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#567681" />
          <stop offset="0.36" stopColor="#b4c8c5" />
          <stop offset="0.7" stopColor="#f0efe1" />
          <stop offset="1" stopColor="#739aab" />
        </linearGradient>
        <linearGradient id="manifesto-sage-path" x1="1290" y1="1000" x2="760" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#63858e" />
          <stop offset="0.5" stopColor="#b3c6b5" />
          <stop offset="1" stopColor="#dce6da" />
        </linearGradient>
        <radialGradient id="manifesto-reading-space">
          <stop offset="0.24" stopColor="#000" />
          <stop offset="0.54" stopColor="#000" />
          <stop offset="0.84" stopColor="#fff" />
        </radialGradient>
        <mask id="manifesto-path-mask">
          <rect width="1440" height="1000" fill="url(#manifesto-reading-space)" />
        </mask>
      </defs>
      <g mask="url(#manifesto-path-mask)">
        {meaningPaths.map((path, index) => (
          <path
            key={index}
            d={path.d}
            pathLength="1"
            vectorEffect="non-scaling-stroke"
            className={`${styles.strand} ${path.lane === 1 ? styles.sageStrand : ""} ${index % 8 === 0 ? styles.leadingStrand : ""}`}
            style={path.style}
          />
        ))}
        {[3, 11, 19].map((index, lane) => (
          <path
            key={index}
            d={meaningPaths[index].d}
            pathLength="1"
            className={`${styles.pathGlint} ${lane === 0 ? "" : styles[`glint${lane}`]}`}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}

export function Manifesto({ dict }: { dict: Dictionary }) {
  const t = dict.manifesto;
  const chapters = [
    { image: media.choiceFullscreen, sizes: widePhotoSizes, className: styles.choice },
    { image: media.meaningFullscreen, sizes: widePhotoSizes, className: styles.meaning },
    { image: media.supportFullscreen, sizes: supportPhotoSizes, className: styles.womanhood },
  ];

  return (
    <Section id="manifesto" tone="navy" className={styles.manifesto} shell={false}>
      <PinnedSceneFit />
      <div className={styles.stage}>
        <article className={`${styles.scene} ${styles.intro}`}>
          <MeaningPaths />
          <div className={styles.scrim} aria-hidden="true" />
          <div className={`${styles.content} ${styles.introContent}`} data-pinned-content="">
            <p className={styles.kicker}>{t.kicker}</p>
            <h2>{t.lines.map((line) => <span key={line}>{line}</span>)}</h2>
            <p className={styles.body}>{t.body}</p>
          </div>
        </article>

        {t.pillars.map((pillar, index) => {
          const chapter = chapters[index];
          return (
            <article key={pillar.title} className={`${styles.scene} ${chapter.className}`}>
              {index === 1 ? <MeaningMountains /> : (
                <Image
                  src={chapter.image}
                  alt=""
                  fill
                  sizes={chapter.sizes}
                  quality={85}
                  loading="lazy"
                  className={styles.photo}
                />
              )}
              <div className={styles.scrim} aria-hidden="true" />
              <div className={`${styles.content} ${styles.chapterContent}`} data-pinned-content="">
                <h3>{pillar.title}</h3>
                <p>{pillar.text}</p>
              </div>
            </article>
          );
        })}

        <div className={styles.progress} aria-hidden="true">
          {t.pillars.map((pillar) => (
            <div key={pillar.title}>
              <span>{pillar.title}</span>
              <i />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
