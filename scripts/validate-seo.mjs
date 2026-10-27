const baseUrl = process.env.SEO_BASE_URL ?? "http://127.0.0.1:3100";
const origin = "https://www.imashmaut.co.il";
const locales = ["he", "en"];
const slugs = ["", "about", "lectures", "guidance", "team", "get-involved", "videos", "faq", "contact", "terms", "privacy", "accessibility"];
const routeBySlug = {
  "": "home",
  about: "about",
  lectures: "lectures",
  guidance: "guidance",
  team: "team",
  "get-involved": "getInvolved",
  videos: "videos",
  faq: "faq",
  contact: "contact",
  terms: "terms",
  privacy: "privacy",
  accessibility: "accessibility",
};
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
  slugs.map((slug) => ({ locale, route: routeBySlug[slug], slug, path: localizedPath(locale, slug) })),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

function decodeEntities(value) {
  return value
    ?.replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function attr(tag, name) {
  return decodeEntities(tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, "i"))?.[1]);
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

function schemaNodes(html) {
  const scripts = [
    ...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
  assert(scripts.length > 0, "missing JSON-LD");
  return scripts.flatMap((match) => {
    const parsed = JSON.parse(match[1]);
    return parsed["@graph"] ?? [parsed];
  });
}

function visibleMainWordCount(html) {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "";
  const text = main
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}

function expectedSchema(path) {
  if (path === "/" || path === "/en") return ["NGO", "WebSite", "WebPage"];
  if (path.endsWith("/about")) return ["AboutPage", "BreadcrumbList"];
  if (path.endsWith("/team")) return ["AboutPage", "Person", "BreadcrumbList"];
  if (path.endsWith("/contact")) return ["ContactPage", "BreadcrumbList"];
  if (path.endsWith("/lectures") || path.endsWith("/guidance")) return ["Service", "BreadcrumbList"];
  if (path.endsWith("/faq")) return ["FAQPage", "BreadcrumbList"];
  if (path.endsWith("/videos")) return ["CollectionPage", "BreadcrumbList"];
  return ["WebPage", "BreadcrumbList"];
}

const titles = new Set();
const descriptions = new Set();

for (const { locale, route, path, slug } of pages) {
  const response = await fetch(`${baseUrl}${path}`);
  assert(response.status === 200, `${path}: expected 200, received ${response.status}`);
  const html = await response.text();
  const expectedDir = locale === "he" ? "rtl" : "ltr";
  const htmlTag = tags(html, "html")[0];
  assert(attr(htmlTag, "lang") === locale, `${path}: incorrect lang`);
  assert(attr(htmlTag, "dir") === expectedDir, `${path}: incorrect dir`);

  const title = decodeEntities(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
  const description = metaContent(html, "description");
  assert(title, `${path}: missing title`);
  assert(description, `${path}: missing description`);
  if (route === "team") assert(title.length >= 35, `${path}: team title is not descriptive enough`);
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
  const socialImage = `${origin}/og?locale=${locale}&route=${route}`;
  assert(metaProperty(html, "og:image") === socialImage, `${path}: incorrect Open Graph image`);
  assert(metaContent(html, "twitter:card") === "summary_large_image", `${path}: missing Twitter card`);
  assert(metaContent(html, "twitter:image") === socialImage, `${path}: incorrect Twitter image`);
  assert(metaContent(html, "robots")?.includes("index, follow"), `${path}: incorrect robots meta`);
  assert(metaContent(html, "googlebot")?.includes("max-image-preview:large"), `${path}: incomplete Googlebot previews`);

  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>/gi)].map((match) => Number(match[1]));
  assert(headings.filter((level) => level === 1).length === 1, `${path}: expected exactly one h1`);
  for (let index = 1; index < headings.length; index += 1) {
    assert(headings[index] <= headings[index - 1] + 1, `${path}: heading level skips from h${headings[index - 1]} to h${headings[index]}`);
  }

  const nodes = schemaNodes(html);
  const types = nodes.flatMap((node) => node["@type"] ?? []);
  for (const type of expectedSchema(path)) {
    assert(types.includes(type), `${path}: missing ${type} schema`);
  }

  const organization = nodes.find((node) => node["@type"] === "NGO");
  assert(Array.isArray(organization?.alternateName), `${path}: organization alternate names are incomplete`);
  assert(organization?.slogan, `${path}: organization schema is missing its slogan`);
  assert(organization?.taxID === "580843829", `${path}: organization schema is missing the charity ID`);
  assert(organization?.legalName, `${path}: organization schema is missing its legal name`);
  assert(organization?.address?.streetAddress, `${path}: organization schema is missing a street address`);
  assert(html.includes("580843829"), `${path}: charity ID is not visible on the page`);
  assert(html.includes("SHERUT EM MASHMAUT"), `${path}: registered English name is not visible on the page`);

  if (["lectures", "guidance", "getInvolved"].includes(route)) {
    assert(visibleMainWordCount(html) >= 280, `${path}: service content is still too brief`);
  }

  if (route === "team") {
    const people = nodes.filter((node) => node["@type"] === "Person");
    assert(people.length >= 7, `${path}: incomplete team schema`);
    for (const person of people) {
      assert(person.jobTitle, `${path}: ${person.name} is missing a job title`);
      assert(person.url, `${path}: ${person.name} is missing a profile URL`);
    }
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

  for (const legalSlug of ["terms", "privacy", "accessibility"]) {
    const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1] ?? "";
    assert(tags(footer, "a").some((tag) => attr(tag, "href") === localizedPath(locale, legalSlug)), `${path}: footer missing ${legalSlug}`);
  }

  if (["terms", "privacy", "accessibility"].includes(route)) {
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "";
    assert(visibleMainWordCount(html) >= 300, `${path}: legal content is incomplete`);
    assert(!/TODO|TBD|PLACEHOLDER|lorem ipsum|להשלמה|יעודכן בהמשך/i.test(main), `${path}: unfinished legal copy`);
    assert(tags(main, "time").some((tag) => attr(tag, "datetime") === "2026-10-27"), `${path}: missing policy update date`);
    if (route === "privacy") {
      assert(main.includes('href="mailto:privacy@imashmaut.co.il"'), `${path}: incorrect privacy contact`);
    }
  }
}

const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
assert(sitemapResponse.status === 200, "sitemap: expected 200");
assert(sitemapResponse.headers.get("content-type")?.includes("xml"), "sitemap: incorrect content type");
const sitemap = await sitemapResponse.text();
const sitemapLocations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
assert(sitemapLocations.length === pages.length, `sitemap: expected ${pages.length} URLs, received ${sitemapLocations.length}`);
for (const { path } of pages) assert(sitemapLocations.includes(`${origin}${path}`), `sitemap: missing ${path}`);
assert(!sitemapLocations.some((location) => new URL(location).pathname.startsWith("/he")), "sitemap: legacy /he URL found");
assert((sitemap.match(/hreflang=/g) ?? []).length === pages.length * 3, "sitemap: expected three language alternates per URL");
assert((sitemap.match(/<lastmod>/g) ?? []).length === pages.length, "sitemap: expected an accurate last-modified date per URL");

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
]) {
  const response = await fetch(`${baseUrl}${resource}`);
  assert(response.status === 200, `${resource}: expected 200`);
  assert(response.headers.get("content-type")?.includes(contentType), `${resource}: incorrect content type`);
}

for (const { locale, route } of pages) {
  const response = await fetch(`${baseUrl}/og?locale=${locale}&route=${route}`);
  assert(response.status === 200, `/og?locale=${locale}&route=${route}: expected 200`);
  assert(response.headers.get("content-type")?.includes("image/png"), `/og?locale=${locale}&route=${route}: incorrect content type`);
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
