import type { Locale } from "./config";
import { he, type Dictionary } from "./dictionaries/he";
import { en } from "./dictionaries/en";

const dictionaries: Record<Locale, Dictionary> = { he, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export type { Dictionary };
