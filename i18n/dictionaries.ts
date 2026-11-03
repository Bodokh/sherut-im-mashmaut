import type { Locale } from "./config";
import { he, type Dictionary } from "./dictionaries/he";
import { en } from "./dictionaries/en";

/**
 * A quote on the home page. Caption = `name` (else `caption`, else the default
 * fallback), followed by `, location` when `location` is set.
 */
export type Testimonial = { quote: string; name?: string; location?: string; caption?: string };

/** A collaborating institution or organisation. `logo` is a path under /public, `url` an external link. */
export type Partner = { name: string; logo?: string; url?: string };

const dictionaries: Record<Locale, Dictionary> = { he, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
