import type {
  AboutPage,
  BreadcrumbList,
  ContactPage,
  FAQPage,
  Graph,
  NGO,
  Person,
  Service,
  WebPage,
  WebSite,
} from "schema-dts";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { absoluteUrl, SITE_ORIGIN, type SiteRouteKey } from "@/lib/routes";
import { routeLabel } from "@/lib/seo";

const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
const LOGO_URL = `${SITE_ORIGIN}/images/logo-mark.png`;

function language(locale: Locale): string {
  return locale === "he" ? "he-IL" : "en-US";
}

function organizationNode(dict: Dictionary): NGO {
  return {
    "@type": "NGO",
    "@id": ORGANIZATION_ID,
    name: dict.brand.name,
    alternateName: dict.brand.short,
    url: SITE_ORIGIN,
    description: dict.seo.home.description,
    logo: {
      "@type": "ImageObject",
      url: LOGO_URL,
      width: "512",
      height: "512",
    },
    email: "support@imashmaut.co.il",
    telephone: "+972527575290",
    areaServed: {
      "@type": "Country",
      name: "Israel",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "general inquiries",
      email: "support@imashmaut.co.il",
      telephone: "+972527575290",
      areaServed: "IL",
      availableLanguage: ["Hebrew", "English"],
    },
  };
}

function websiteNode(locale: Locale, dict: Dictionary): WebSite {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_ORIGIN,
    name: dict.brand.name,
    description: dict.seo.home.description,
    inLanguage: language(locale),
    publisher: { "@id": ORGANIZATION_ID },
  };
}

function webPageNode(
  locale: Locale,
  route: SiteRouteKey,
  dict: Dictionary,
): WebPage {
  const url = absoluteUrl(locale, route);
  return {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: dict.seo[route].title,
    description: dict.seo[route].description,
    inLanguage: language(locale),
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
  };
}

function breadcrumbNode(
  locale: Locale,
  route: Exclude<SiteRouteKey, "home">,
  dict: Dictionary,
): BreadcrumbList {
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(locale, route)}#breadcrumbs`,
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: routeLabel(dict, "home"),
        item: absoluteUrl(locale, "home"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: routeLabel(dict, route),
        item: absoluteUrl(locale, route),
      },
    ],
  };
}

export function homeGraph(locale: Locale, dict: Dictionary): Graph {
  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(dict), websiteNode(locale, dict), webPageNode(locale, "home", dict)],
  };
}

export function standardPageGraph(
  locale: Locale,
  route: Exclude<SiteRouteKey, "home">,
  dict: Dictionary,
): Graph {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(dict),
      webPageNode(locale, route, dict),
      breadcrumbNode(locale, route, dict),
    ],
  };
}

export function servicePageGraph(
  locale: Locale,
  route: "lectures" | "guidance",
  dict: Dictionary,
): Graph {
  const service: Service = {
    "@type": "Service",
    "@id": `${absoluteUrl(locale, route)}#service`,
    name: dict.seo[route].title,
    description: dict.seo[route].description,
    url: absoluteUrl(locale, route),
    provider: { "@id": ORGANIZATION_ID },
    areaServed: {
      "@type": "Country",
      name: "Israel",
    },
    audience: {
      "@type": "Audience",
      audienceType: route === "lectures" ? "Young women, families and communities" : "Young women and families",
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode(dict),
      webPageNode(locale, route, dict),
      service,
      breadcrumbNode(locale, route, dict),
    ],
  };
}

export function contactPageGraph(locale: Locale, dict: Dictionary): Graph {
  const url = absoluteUrl(locale, "contact");
  const page: ContactPage = {
    "@type": "ContactPage",
    "@id": `${url}#webpage`,
    url,
    name: dict.seo.contact.title,
    description: dict.seo.contact.description,
    inLanguage: language(locale),
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(dict), page, breadcrumbNode(locale, "contact", dict)],
  };
}

export function teamPageGraph(locale: Locale, dict: Dictionary): Graph {
  const url = absoluteUrl(locale, "team");
  const page: AboutPage = {
    "@type": "AboutPage",
    "@id": `${url}#webpage`,
    url,
    name: dict.seo.team.title,
    description: dict.seo.team.description,
    inLanguage: language(locale),
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
  };
  const people = [
    ...dict.about.members.map((member) => ({
      name: member.name,
      description: member.bio,
    })),
    { name: dict.teamPage.daniel.name, description: dict.teamPage.daniel.bio },
    {
      name: dict.teamPage.eran.name,
      description: `${dict.teamPage.eran.bioExperience} ${dict.teamPage.eran.bioBeforeDevShift}${dict.teamPage.eran.devshiftName}${dict.teamPage.eran.bioBetweenCompanies}${dict.teamPage.eran.aiCraftersName}${dict.teamPage.eran.bioAfterCompanies}`,
    },
    { name: dict.teamPage.talia.name, description: dict.teamPage.talia.bio },
  ].map(
    ({ name, description }): Person => ({
      "@type": "Person",
      name,
      description,
      affiliation: { "@id": ORGANIZATION_ID },
    }),
  );

  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(dict), page, ...people, breadcrumbNode(locale, "team", dict)],
  };
}

export function faqPageGraph(locale: Locale, dict: Dictionary): Graph {
  const url = absoluteUrl(locale, "faq");
  const page: FAQPage = {
    "@type": "FAQPage",
    "@id": `${url}#webpage`,
    url,
    name: dict.seo.faq.title,
    description: dict.seo.faq.description,
    inLanguage: language(locale),
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
    mainEntity: dict.faqPage.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(dict), page, breadcrumbNode(locale, "faq", dict)],
  };
}
