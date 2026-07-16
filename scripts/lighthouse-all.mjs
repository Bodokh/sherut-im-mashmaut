import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const baseUrl = process.env.SEO_BASE_URL ?? "http://127.0.0.1:3100";
const outputDirectory = resolve("artifacts/seo-lighthouse-2026-07-16");
const paths = [
  "/he",
  "/en",
  "/he/lectures",
  "/en/lectures",
  "/he/guidance",
  "/en/guidance",
  "/he/team",
  "/en/team",
  "/he/get-involved",
  "/en/get-involved",
  "/he/faq",
  "/en/faq",
  "/he/contact",
  "/en/contact",
];
const categories = ["performance", "accessibility", "best-practices", "seo"];
const results = [];

mkdirSync(outputDirectory, { recursive: true });

for (const path of paths) {
  for (let pass = 1; pass <= 3; pass += 1) {
    const slug = path.slice(1).replaceAll("/", "-");
    const outputPath = resolve(outputDirectory, `${slug}-pass-${pass}.json`);
    if (!existsSync(outputPath)) {
      try {
        execFileSync(
          "rtk",
          [
            "npx",
            "--yes",
            "lighthouse",
            `${baseUrl}${path}`,
            "--quiet",
            "--output=json",
            `--output-path=${outputPath}`,
            "--only-categories=performance,accessibility,best-practices,seo",
            "--form-factor=mobile",
            "--throttling-method=simulate",
            "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage",
          ],
          { stdio: "pipe" },
        );
      } catch (error) {
        const details = error?.stderr?.toString().trim() || error?.message || String(error);
        throw new Error(`${path} pass ${pass} failed: ${details}`);
      }
    }
    const report = JSON.parse(readFileSync(outputPath, "utf8"));
    const scores = Object.fromEntries(
      categories.map((category) => [category, Math.round(report.categories[category].score * 100)]),
    );
    const row = {
      path,
      pass,
      scores,
      lcpMs: Math.round(report.audits["largest-contentful-paint"].numericValue),
      cls: Number(report.audits["cumulative-layout-shift"].numericValue.toFixed(3)),
    };
    results.push(row);
    console.log(`${path} pass ${pass}: P${scores.performance} A${scores.accessibility} B${scores["best-practices"]} S${scores.seo} LCP ${row.lcpMs}ms CLS ${row.cls}`);
  }
}

const pages = Object.fromEntries(
  paths.map((path) => {
    const pageResults = results.filter((result) => result.path === path);
    return [
      path,
      Object.fromEntries(
        categories.map((category) => {
          const values = pageResults.map((result) => result.scores[category]).sort((a, b) => a - b);
          return [category, { min: values[0], median: values[1], max: values[2] }];
        }),
      ),
    ];
  }),
);

const minimumScore = Math.min(
  ...results.flatMap((result) => categories.map((category) => result.scores[category])),
);
const summary = { baseUrl, generatedAt: new Date().toISOString(), minimumScore, pages, results };
writeFileSync(resolve(outputDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

if (minimumScore < 90) {
  console.error(`Lighthouse matrix failed: minimum category score was ${minimumScore}.`);
  process.exit(1);
}

console.log(`Lighthouse matrix passed: all ${results.length} runs scored at least 90 in every category.`);
