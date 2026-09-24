import type {
  AboutPage,
  BreadcrumbList,
  CollectionPage,
  ContactPage,
  FAQPage,
  Graph,
  NGO,
  Person,
  Service,
  VideoObject,
  WebPage,
  WebSite,
} from "schema-dts";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { socialLinks } from "@/lib/contact";
import { organization } from "@/lib/organization";
import { absoluteUrl, SITE_ORIGIN, type SiteRouteKey } from "@/lib/routes";
import { routeLabel } from "@/lib/seo";
import { youtubeEmbedUrl, youtubeWatchUrl, type YouTubeVideo } from "@/lib/youtube";

const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
const LOGO_URL = `${SITE_ORIGIN}/images/logo-mark.png`;
const TEAM_IMAGE_PATHS: Record<number, string> = {
  0: "/images/team/daniel-bodokh.webp",
  1: "/images/team/odelia-kadmi.jpg",
  4: "/images/team/eran-bodokh.jpg",
  6: "/images/team/tzofnat-nordman.jpg",
};

function language(locale: Locale): string {
  return locale === "he" ? "he-IL" : "en-US";
}

function organizationNode(locale: Locale, dict: Dictionary): NGO {
  return {
    "@type": "NGO",
    "@id": ORGANIZATION_ID,
    name: dict.brand.name,
    legalName: locale === "he" ? organization.legalNameHebrew : organization.legalNameLatin,
    alternateName: [
      "Service with Meaning",
      "שע״מ",
      "SwM",
      organization.legalNameLatin,
      "SHERUT EM MASHMAUT",
    ],
    identifier: {
      "@type": "PropertyValue",
      propertyID: "Israeli Registrar of Associations number",
      value: organization.registrationNumber,
    },
    taxID: organization.registrationNumber,
    address: {
      "@type": "PostalAddress",
      streetAddress: dict.organization.address.street,
      addressLocality: dict.organization.address.city,
      postalCode: dict.organization.address.postalCode,
      addressCountry: organization.countryCode,
    },
    slogan: "ערכים · זהות · שליחות | Values · Identity · Calling",
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
    sameAs: [socialLinks.facebook, socialLinks.instagram, socialLinks.youtube, socialLinks.x],
    areaServed: {
      "@type": "Country",
      name: "Israel",
    },
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "general inquiries",
        email: "support@imashmaut.co.il",
        telephone: "+972527575290",
        areaServed: "IL",
        availableLanguage: ["Hebrew", "English"],
      },
      {
        "@type": "ContactPoint",
        contactType: "hotline",
        telephone: "+972559739365",
        areaServed: "IL",
        availableLanguage: ["Hebrew", "English"],
      },
    ],
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
    "@graph": [organizationNode(locale, dict), websiteNode(locale, dict), webPageNode(locale, "home", dict)],
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
      organizationNode(locale, dict),
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
      organizationNode(locale, dict),
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
    "@graph": [organizationNode(locale, dict), page, breadcrumbNode(locale, "contact", dict)],
  };
}

export function aboutPageGraph(locale: Locale, dict: Dictionary): Graph {
  const url = absoluteUrl(locale, "about");
  const page: AboutPage = {
    "@type": "AboutPage",
    "@id": `${url}#webpage`,
    url,
    name: dict.seo.about.title,
    description: dict.seo.about.description,
    inLanguage: language(locale),
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
    mainEntity: { "@id": ORGANIZATION_ID },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(locale, dict), page, breadcrumbNode(locale, "about", dict)],
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
  const [odelia, tzofnat, hillel, roi] = dict.teamPage.members;
  const people = [
    { name: dict.teamPage.daniel.name, role: dict.teamPage.daniel.role, description: dict.teamPage.daniel.bio },
    { name: odelia.name, role: odelia.role, description: odelia.bio },
    { name: hillel.name, role: hillel.role, description: hillel.bio },
    { name: roi.name, role: roi.role, description: roi.bio },
    {
      name: dict.teamPage.eran.name,
      role: dict.teamPage.eran.role,
      description: `${dict.teamPage.eran.bioExperience} ${dict.teamPage.eran.bioBeforeDevShift}${dict.teamPage.eran.devshiftName}${dict.teamPage.eran.bioBetweenCompanies}${dict.teamPage.eran.aiCraftersName}${dict.teamPage.eran.bioAfterCompanies}`,
    },
    { name: dict.teamPage.talia.name, role: dict.teamPage.talia.role, description: dict.teamPage.talia.bio },
    { name: tzofnat.name, role: tzofnat.role, description: tzofnat.bio },
  ].map(
    ({ name, role, description }, index): Person => {
      const imagePath = TEAM_IMAGE_PATHS[index];
      return {
        "@type": "Person",
        "@id": `${url}#team-member-${index + 1}`,
        name,
        jobTitle: role,
        description,
        url: `${url}#team-member-${index + 1}`,
        image: imagePath ? `${SITE_ORIGIN}${imagePath}` : undefined,
        worksFor: { "@id": ORGANIZATION_ID },
      };
    },
  );

  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(locale, dict), page, ...people, breadcrumbNode(locale, "team", dict)],
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
    "@graph": [organizationNode(locale, dict), page, breadcrumbNode(locale, "faq", dict)],
  };
}

function isoDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds}S`;
}

function videoNode(video: YouTubeVideo): VideoObject {
  return {
    "@type": "VideoObject",
    "@id": `${youtubeWatchUrl(video.id)}#video`,
    name: video.title,
    // Google requires a description; fall back to the title for bare uploads.
    description: video.description || video.title,
    thumbnailUrl: video.thumbnail,
    uploadDate: video.publishedAt,
    duration: isoDuration(video.durationSeconds),
    contentUrl: youtubeWatchUrl(video.id),
    embedUrl: youtubeEmbedUrl(video.id),
    publisher: { "@id": ORGANIZATION_ID },
  };
}

export function videosPageGraph(locale: Locale, dict: Dictionary, videos: YouTubeVideo[]): Graph {
  const url = absoluteUrl(locale, "videos");
  const page: CollectionPage = {
    "@type": "CollectionPage",
    "@id": `${url}#webpage`,
    url,
    name: dict.seo.videos.title,
    description: dict.seo.videos.description,
    inLanguage: language(locale),
    isPartOf: { "@id": WEBSITE_ID },
    about: { "@id": ORGANIZATION_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: videos.length,
      itemListElement: videos.map((video, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: videoNode(video),
      })),
    },
  };

  return {
    "@context": "https://schema.org",
    "@graph": [organizationNode(locale, dict), page, breadcrumbNode(locale, "videos", dict)],
  };
}
