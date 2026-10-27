import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/** Store E.164. Micropay removes the leading + at its existing transport boundary. */
export function normalizePhoneNumber(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const input = value.trim();
  // Never extract a number from prose, extensions, or a list of recipients.
  if (input.length > 50 || !/^[+\d\s().-]+$/.test(input)) return null;
  let compact = input.replace(/[\s().-]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  else if (/^972\d+$/.test(compact)) compact = `+${compact}`;
  const phone = parsePhoneNumberFromString(compact, { defaultCountry: "IL", extract: false });
  return phone?.isValid() ? phone.number : null;
}
