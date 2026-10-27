import type { Locale } from "@/i18n/config";
import type { LegalRouteKey } from "@/lib/routes";
import { heLegal } from "./legal/he";
import { enLegal } from "./legal/en";

export const LEGAL_UPDATED_DATE = "2026-10-27";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs: readonly string[];
  items?: readonly string[];
};

export type LegalPageContent = {
  lead: string;
  sections: readonly LegalSection[];
  contactTitle: string;
  contactIntro: string;
};

export type LegalDictionary = {
  updatedLabel: string;
  contentsLabel: string;
  relatedLabel: string;
  contactLinkLabel: string;
  phoneLabel: string;
  privacyNotice: string;
  privacyLinkLabel: string;
  pages: Record<LegalRouteKey, LegalPageContent>;
};

const dictionaries: Record<Locale, LegalDictionary> = { he: heLegal, en: enLegal };

export function getLegalDictionary(locale: Locale): LegalDictionary {
  return dictionaries[locale];
}
