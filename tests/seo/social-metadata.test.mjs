import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import "../mentoring/server/typescript-loader.mjs";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`../../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { buildPageMetadata } = await import("../../lib/seo.ts");
const { getDictionary } = await import("../../i18n/dictionaries.ts");

function withDeploymentEnv(values, run) {
  const names = ["VERCEL_ENV", "VERCEL_BRANCH_URL", "VERCEL_URL"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, values);
  try {
    run();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test("preview sharing uses the branch's artwork and page identity instead of undeployed production assets", () => {
  withDeploymentEnv({
    VERCEL_ENV: "preview",
    VERCEL_BRANCH_URL: "site-git-design.example.vercel.app",
    VERCEL_URL: "site-unique-build.example.vercel.app",
  }, () => {
    for (const [locale, route, slug] of [["he", "home", "/"], ["en", "about", "/en/about"]]) {
      const metadata = buildPageMetadata(locale, route, getDictionary(locale));
      const image = `https://site-git-design.example.vercel.app/og?locale=${locale}&route=${route}&v=2`;
      assert.equal(metadata.openGraph.images[0].url, image);
      assert.equal(metadata.twitter.images[0].url, image);
      assert.equal(metadata.openGraph.url, `https://site-git-design.example.vercel.app${slug}`);
      assert.equal(metadata.alternates.canonical, `https://www.imashmaut.co.il${slug}`);
    }
  });
});

test("a preview without a branch alias uses its own deployment URL", () => {
  withDeploymentEnv({ VERCEL_ENV: "preview", VERCEL_URL: "site-build.example.vercel.app" }, () => {
    const metadata = buildPageMetadata("en", "privacy", getDictionary("en"));
    assert.equal(metadata.openGraph.images[0].url, "https://site-build.example.vercel.app/og?locale=en&route=privacy&v=2");
    assert.equal(metadata.openGraph.url, "https://site-build.example.vercel.app/en/privacy");
  });
});

test("production and local metadata retain the official domain even when preview URLs are present", () => {
  for (const environment of ["production", "development"]) {
    withDeploymentEnv({ VERCEL_ENV: environment, VERCEL_BRANCH_URL: "site-git-design.example.vercel.app" }, () => {
      const metadata = buildPageMetadata("he", "team", getDictionary("he"));
      assert.equal(metadata.openGraph.images[0].url, "https://www.imashmaut.co.il/og?locale=he&route=team&v=2");
      assert.equal(metadata.openGraph.url, "https://www.imashmaut.co.il/team");
      assert.equal(metadata.alternates.canonical, "https://www.imashmaut.co.il/team");
    });
  }
});
