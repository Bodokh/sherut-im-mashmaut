const baseUrl = process.env.SEO_BASE_URL ?? "http://127.0.0.1:3100";
const origin = "https://www.imashmaut.co.il";
const locales = ["he", "en"];
const slugs = ["", "lectures", "guidance", "team", "get-involved", "faq", "contact"];
const localizedPath = (locale, slug) => {
  const localePrefix = locale === "he" ? "" : `/${locale}`;
  if (!slug) return localePrefix || "/";
  return `${localePrefix}/${slug}`;
};
const metadataUrl = (locale, slug) => {
  const path = localizedPath(locale, slug);
  return path === "/" ? origin : `${origin}${path}`;
};
const pages = locales.flatMap((locale) =>
  slugs.map((slug) => ({ locale, slug, path: localizedPath(locale, slug) })),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

function attr(tag, name) {
  return tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, "i"))?.[1];
}

function metaContent(html, name) {
  const tag = tags(html, "meta").find((item) => attr(item, "name") === name);
  return tag ? attr(tag, "content") : undefined;
}

function metaProperty(html, property) {
  const tag = tags(html, "meta").find((item) => attr(item, "property") === property);
  return tag ? attr(tag, "content") : undefined;
}

function linkHref(html, rel, hreflang) {
  const tag = tags(html, "link").find(
    (item) => attr(item, "rel") === rel && (!hreflang || attr(item, "hreflang") === hreflang),
  );
  return tag ? attr(tag, "href") : undefined;
}

function schemaTypes(html) {
  const scripts = [
    ...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  assert(scripts.length > 0, "missing JSON-LD");
  return scripts.flatMap((match) => {
    const parsed = JSON.parse(match[1]);
    const nodes = parsed["@graph"] ?? [parsed];
    return nodes.flatMap((node) => node["@type"] ?? []);
  });
}

function expectedSchema(path) {
  if (path === "/" || path === "/en") return ["NGO", "WebSite", "WebPage"];
  if (path.endsWith("/team")) return ["AboutPage", "Person", "BreadcrumbList"];
  if (path.endsWith("/contact")) return ["ContactPage", "BreadcrumbList"];
  if (path.endsWith("/lectures") || path.endsWith("/guidance")) return ["Service", "BreadcrumbList"];
  if (path.endsWith("/faq")) return ["FAQPage", "BreadcrumbList"];
  return ["WebPage", "BreadcrumbList"];
}

const titles = new Set();
const descriptions = new Set();

for (const { locale, path, slug } of pages) {
  const response = await fetch(`${baseUrl}${path}`);
  assert(response.status === 200, `${path}: expected 200, received ${response.status}`);
  const html = await response.text();
  const expectedDir = locale === "he" ? "rtl" : "ltr";
  const htmlTag = tags(html, "html")[0];
  assert(attr(htmlTag, "lang") === locale, `${path}: incorrect lang`);
  assert(attr(htmlTag, "dir") === expectedDir, `${path}: incorrect dir`);

  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  const description = metaContent(html, "description");
  assert(title, `${path}: missing title`);
  assert(description, `${path}: missing description`);
  assert(!titles.has(title), `${path}: duplicate title`);
  assert(!descriptions.has(description), `${path}: duplicate description`);
  titles.add(title);
  descriptions.add(description);

  const canonical = linkHref(html, "canonical");
  assert(canonical === metadataUrl(locale, slug), `${path}: incorrect canonical ${canonical}`);
  const heUrl = metadataUrl("he", slug);
  const enUrl = metadataUrl("en", slug);
  assert(linkHref(html, "alternate", "he") === heUrl, `${path}: incorrect he alternate`);
  assert(linkHref(html, "alternate", "en") === enUrl, `${path}: incorrect en alternate`);
  assert(linkHref(html, "alternate", "x-default") === heUrl, `${path}: incorrect x-default`);
  assert(metaProperty(html, "og:title") === title, `${path}: incorrect Open Graph title`);
  assert(metaProperty(html, "og:description") === description, `${path}: incorrect Open Graph description`);
  assert(metaProperty(html, "og:url") === canonical, `${path}: incorrect Open Graph URL`);
  assert(metaProperty(html, "og:image") === `${origin}/og`, `${path}: incorrect Open Graph image`);
  assert(metaContent(html, "twitter:card") === "summary_large_image", `${path}: missing Twitter card`);
  assert(metaContent(html, "twitter:image") === `${origin}/og`, `${path}: incorrect Twitter image`);
  assert(metaContent(html, "robots")?.includes("index, follow"), `${path}: incorrect robots meta`);
  assert(metaContent(html, "googlebot")?.includes("max-image-preview:large"), `${path}: incomplete Googlebot previews`);

  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map((match) => Number(match[1]));
  assert(headings.filter((level) => level === 1).length === 1, `${path}: expected exactly one h1`);
  for (let index = 1; index < headings.length; index += 1) {
    assert(headings[index] <= headings[index - 1] + 1, `${path}: heading level skips from h${headings[index - 1]} to h${headings[index]}`);
  }

  const types = schemaTypes(html);
  for (const type of expectedSchema(path)) {
    assert(types.includes(type), `${path}: missing ${type} schema`);
  }

  const internalLinks = tags(html, "a")
    .map((tag) => attr(tag, "href"))
    .filter((href) =>
      locale === "he"
        ? href === "/" || slugs.slice(1).some((knownSlug) => href?.startsWith(`/${knownSlug}`))
        : href?.startsWith("/en"),
    );
  assert(new Set(internalLinks).size >= 5, `${path}: fewer than five distinct localized internal links`);
  assert(!html.includes('href="#"'), `${path}: contains a placeholder href`);
}

const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
assert(sitemapResponse.status === 200, "sitemap: expected 200");
assert(sitemapResponse.headers.get("content-type")?.includes("xml"), "sitemap: incorrect content type");
const sitemap = await sitemapResponse.text();
const sitemapLocations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
assert(sitemapLocations.length === 14, `sitemap: expected 14 URLs, received ${sitemapLocations.length}`);
for (const { path } of pages) assert(sitemapLocations.includes(`${origin}${path}`), `sitemap: missing ${path}`);
assert(!sitemapLocations.some((location) => new URL(location).pathname.startsWith("/he")), "sitemap: legacy /he URL found");
assert((sitemap.match(/hreflang=/g) ?? []).length === 42, "sitemap: expected three language alternates per URL");

const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
assert(robotsResponse.status === 200, "robots: expected 200");
assert(robotsResponse.headers.get("content-type")?.includes("text/plain"), "robots: incorrect content type");
const robots = await robotsResponse.text();
for (const bot of ["Googlebot", "Bingbot", "OAI-SearchBot", "GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
  assert(robots.includes(`User-Agent: ${bot}`), `robots: missing ${bot}`);
}
assert(robots.includes(`Sitemap: ${origin}/sitemap.xml`), "robots: missing sitemap declaration");
assert(robots.includes("Disallow: /api/"), "robots: API route is not disallowed");

for (const [resource, contentType] of [
  ["/manifest.webmanifest", "application/manifest+json"],
  ["/llms.txt", "text/plain"],
  ["/og", "image/png"],
]) {
  const response = await fetch(`${baseUrl}${resource}`);
  assert(response.status === 200, `${resource}: expected 200`);
  assert(response.headers.get("content-type")?.includes(contentType), `${resource}: incorrect content type`);
}

for (const slug of slugs) {
  const legacyPath = `/he${slug ? `/${slug}` : ""}`;
  const response = await fetch(`${baseUrl}${legacyPath}`, { redirect: "manual" });
  assert(response.status === 308, `${legacyPath}: expected permanent 308, received ${response.status}`);
  const target = new URL(response.headers.get("location"), baseUrl);
  assert(target.pathname === localizedPath("he", slug), `${legacyPath}: incorrect redirect target`);
}

const unknown = await fetch(`${baseUrl}/not-a-real-page`, { redirect: "manual" });
assert(unknown.status === 404, `unknown route: expected 404, received ${unknown.status}`);

const flyer = await fetch(`${baseUrl}/flyers/index.html`);
if (flyer.status === 200) {
  assert(flyer.headers.get("x-robots-tag") === "noindex, nofollow", "flyer: missing X-Robots-Tag");
}

console.log(`SEO validation passed for ${pages.length} localized pages.`);
