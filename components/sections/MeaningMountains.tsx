import type { CSSProperties } from "react";
import styles from "./MeaningMountains.module.css";

const WIDTH = 1800;
const HEIGHT = 1100;

type RidgeDefinition = {
  heights: readonly number[];
  seed: number;
  roughness: number;
  light: string;
  shade: string;
};

// Unequal, overlapping horizons preserve the long, open valley in the original
// photograph. Detail is deterministic server-rendered geometry, not a canvas.
const ridges: readonly RidgeDefinition[] = [
  { heights: [370, 318, 355, 300, 350, 316, 365, 328, 374], seed: 19, roughness: 24, light: "#bb9c99", shade: "#9f8793" },
  { heights: [420, 378, 436, 390, 446, 366, 420, 385, 412], seed: 47, roughness: 30, light: "#ad8b94", shade: "#8b7c8e" },
  { heights: [478, 431, 492, 455, 497, 430, 480, 446, 469], seed: 83, roughness: 34, light: "#947e91", shade: "#77768b" },
  { heights: [525, 480, 551, 494, 563, 482, 541, 487, 537], seed: 113, roughness: 39, light: "#7c718b", shade: "#62687f" },
  { heights: [609, 544, 589, 637, 579, 548, 622, 553, 596], seed: 167, roughness: 42, light: "#62677f", shade: "#48576d" },
  { heights: [662, 612, 692, 666, 730, 636, 608, 662, 638], seed: 223, roughness: 48, light: "#4c596e", shade: "#35495d" },
  { heights: [666, 710, 757, 730, 807, 716, 760, 698, 733], seed: 281, roughness: 46, light: "#344a5d", shade: "#233a4c" },
  { heights: [652, 720, 810, 842, 908, 826, 769, 745, 806], seed: 347, roughness: 38, light: "#243e4b", shade: "#132b38" },
  { heights: [744, 824, 880, 972, 1010, 952, 890, 818, 768], seed: 419, roughness: 34, light: "#18333d", shade: "#0b222b" },
];

function hash(position: number, seed: number) {
  let value = Math.imul(position ^ seed, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function noise(position: number, seed: number) {
  const floor = Math.floor(position);
  const fraction = position - floor;
  const blend = fraction * fraction * (3 - 2 * fraction);
  return hash(floor, seed) * (1 - blend) + hash(floor + 1, seed) * blend;
}

function ridgeHeight(x: number, ridge: RidgeDefinition) {
  const position = (x / WIDTH) * (ridge.heights.length - 1);
  const index = Math.min(Math.floor(position), ridge.heights.length - 2);
  const fraction = position - index;
  const blend = fraction * fraction * (3 - 2 * fraction);
  const profile = ridge.heights[index] * (1 - blend) + ridge.heights[index + 1] * blend;
  const detail =
    (noise(x / 173, ridge.seed) - 0.5) * 1.1 +
    (noise(x / 61, ridge.seed + 7) - 0.5) * 0.65 +
    (noise(x / 23, ridge.seed + 17) - 0.5) * 0.34 +
    (noise(x / 8, ridge.seed + 31) - 0.5) * 0.15;
  return profile + detail * ridge.roughness;
}

function ridgeGeometry(ridge: RidgeDefinition, index: number) {
  const points = Array.from({ length: WIDTH / 8 + 1 }, (_, step) => {
    const x = step * 8;
    return `${x},${ridgeHeight(x, ridge).toFixed(1)}`;
  });
  const outline = `M${points.join("L")}`;

  // A few shallow facets catch the dusk light on the closest slopes. Their
  // broad, irregular contours avoid an artificial low-poly triangulation.
  const facets = index < 5 ? [] : Array.from({ length: 4 }, (_, facet) => {
    const x = 170 + facet * 430 + hash(facet, ridge.seed) * 90;
    const y = ridgeHeight(x, ridge);
    const reach = 190 + hash(facet + 13, ridge.seed) * 150;
    return `M${x.toFixed(1)},${(y + 1).toFixed(1)} C${(x - 20).toFixed(1)},${(y + 65).toFixed(1)} ${(x + 65).toFixed(1)},${(y + 120).toFixed(1)} ${(x + reach).toFixed(1)},${HEIGHT + 12} L${(x + reach + 95).toFixed(1)},${HEIGHT + 12} C${(x + 90).toFixed(1)},${(y + 136).toFixed(1)} ${(x + 51).toFixed(1)},${(y + 40).toFixed(1)} ${x.toFixed(1)},${(y + 1).toFixed(1)}Z`;
  });

  return { outline, fill: `${outline}L${WIDTH},${HEIGHT + 16}L0,${HEIGHT + 16}Z`, facets };
}

const mountainLayers = ridges.map((ridge, index) => ({
  ...ridge,
  ...ridgeGeometry(ridge, index),
  style: {
    "--mountain-from-x": `${(index % 2 ? -1 : 1) * index * 3}px`,
    "--mountain-to-x": `${(index % 2 ? 1 : -1) * index * 3}px`,
    "--mountain-from-y": `${index * 6}px`,
    "--mountain-to-y": `${-index * 8}px`,
  } as CSSProperties,
}));

/** An atmospheric mountain scene, drawn entirely with layered SVG geometry. */
export function MeaningMountains() {
  return (
    <div className={styles.landscape} aria-hidden="true">
      <div className={styles.sky} />
      <div className={styles.sunlight} />

      {mountainLayers.map((ridge, index) => (
        <div className={styles.layer} style={ridge.style} key={ridge.seed}>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="xMidYMid slice"
            fill="none"
            focusable="false"
          >
            <defs>
              <linearGradient id={`meaning-ridge-${index}`} x1="0" y1="300" x2="0" y2={HEIGHT} gradientUnits="userSpaceOnUse">
                <stop stopColor={ridge.light} />
                <stop offset="1" stopColor={ridge.shade} />
              </linearGradient>
              <linearGradient id={`meaning-mist-${index}`} x1="0" y1="320" x2="0" y2="1050" gradientUnits="userSpaceOnUse">
                <stop stopColor="#eed6b9" stopOpacity={index < 5 ? 0.09 : 0.035} />
                <stop offset="0.7" stopColor="#a9a1b6" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={ridge.fill} fill={`url(#meaning-ridge-${index})`} />
            <path d={ridge.fill} fill={`url(#meaning-mist-${index})`} />
            {index < 6 && <path d={ridge.outline} stroke="#f2d5bc" strokeOpacity={0.13 - index * 0.015} strokeWidth="1.1" />}
            {ridge.facets.map((d, facet) => (
              <path key={facet} d={d} fill={facet % 2 ? "#a0b8bc" : "#071b25"} opacity={facet % 2 ? 0.045 : 0.08} />
            ))}
          </svg>
        </div>
      ))}

      <div className={styles.valleyHaze} />
      <div className={styles.vignette} />
    </div>
  );
}
