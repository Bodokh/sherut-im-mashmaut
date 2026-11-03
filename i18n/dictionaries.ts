import type { Locale } from "./config";
import { he, type Dictionary } from "./dictionaries/he";
import { en } from "./dictionaries/en";

/** A quote on the home page. Add `name` and `location` later to show "name, location" as the caption. */
export type Testimonial = { quote: string; name?: string; location?: string };

/** A collaborating institution or organisation. `logo` is a path under /public, `url` an external link. */
export type Partner = { name: string; logo?: string; url?: string };

const dictionaries: Record<Locale, Dictionary> = { he, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
