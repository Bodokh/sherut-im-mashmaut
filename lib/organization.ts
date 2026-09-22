// Registered facts about the nonprofit, exactly as filed with the Israeli
// Registrar of Associations (רשם העמותות). Locale-specific presentation
// strings (labels, the localized postal address) live in the dictionaries.
const REGISTRATION_NUMBER = "580843829";

export const organization = {
  registrationNumber: REGISTRATION_NUMBER,
  legalNameHebrew: "שירות עם משמעות (ע״ר)",
  legalNameLatin: "SHERUT EM MASHMAUT (R.A.)",
  registrationDate: "2026-07-10",
  countryCode: "IL",
  websiteLabel: "www.imashmaut.co.il",
  certificatePath: "/documents/sherut-im-mashmaut-registration-certificate.pdf",
  registryUrl: `https://www.guidestar.org.il/organization/${REGISTRATION_NUMBER}`,
} as const;

export type PostalAddressCopy = {
  street: string;
  city: string;
  postalCode: string;
  country: string;
};

export function formatPostalAddress(address: PostalAddressCopy): string {
  return `${address.street}, ${address.city} ${address.postalCode}, ${address.country}`;
}
