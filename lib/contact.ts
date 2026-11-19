const SUPPORT_EMAIL = "support@imashmaut.co.il";
const PRIVACY_EMAIL = "privacy@imashmaut.co.il";
const WHATSAPP_NUMBER = "972527575290";

export const contactPhone = "073-367-9000";
export const contactPhoneInternational = `+972${contactPhone.slice(1).replaceAll("-", "")}`;

function whatsappHref(text?: string) {
  if (!text) return `https://wa.me/${WHATSAPP_NUMBER}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export const contactLinks = {
  emailAddress: SUPPORT_EMAIL,
  email: `mailto:${SUPPORT_EMAIL}`,
  privacyEmailAddress: PRIVACY_EMAIL,
  privacyEmail: `mailto:${PRIVACY_EMAIL}`,
  phone: `tel:${contactPhoneInternational}`,
  whatsapp: whatsappHref(),
} as const;

export const communityLinks = {
  educators: "https://chat.whatsapp.com/LLI5TMYAmqlIrgA3mROqpK",
  parents: "https://chat.whatsapp.com/FQMPkTlHxlY0qIe0eRvpGZ",
  girlsBlog: "https://chat.whatsapp.com/Lhuo6e4NxgjDVvtw49Zhaz",
} as const;

export const socialLinks = {
  facebook: "https://www.facebook.com/people/%D7%A9%D7%99%D7%A8%D7%95%D7%AA-%D7%A2%D7%9D-%D7%9E%D7%A9%D7%9E%D7%A2%D7%95%D7%AA/61592063100590/",
  instagram: "https://www.instagram.com/imashmaut/",
  youtube: "https://www.youtube.com/@imashmaut",
  x: "https://x.com/imashmaut",
  whatsapp: contactLinks.whatsapp,
} as const;

export const donationLink =
  "https://pay.grow.link/MTA0NDUz~a4669f7a4707643f9a4e4e454cbf1bc8-MzgzODMxMQ";
