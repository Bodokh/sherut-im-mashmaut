import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { getLegalDictionary } from "@/i18n/legal";
import { localizedPath } from "@/lib/routes";

export function PrivacyNotice({ locale, id }: { locale: Locale; id: string }) {
  const copy = getLegalDictionary(locale);
  return (
    <p id={id} className="mt-5 text-sm leading-6 text-ink-600">
      {copy.privacyNotice}{" "}
      <Link href={localizedPath(locale, "privacy")} className="rounded-sm font-semibold text-brand-800 underline underline-offset-4 hover:text-brand-950">
        {copy.privacyLinkLabel}
      </Link>
    </p>
  );
}
