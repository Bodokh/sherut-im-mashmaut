import { Button } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { contactLinks } from "@/lib/contact";
import { formatPostalAddress, organization } from "@/lib/organization";
import { localizedPath } from "@/lib/routes";

export const ORGANIZATION_DETAILS_TITLE_ID = "organization-details-title";

type Row = {
  label: string;
  value: string;
  dir?: "ltr" | "rtl";
  href?: string;
  isAddress?: boolean;
};

function rows(locale: Locale, dict: Dictionary): Row[] {
  const org = dict.organization;
  return [
    { label: org.labels.legalNameHebrew, value: organization.legalNameHebrew, dir: "rtl" },
    { label: org.labels.legalNameLatin, value: organization.legalNameLatin, dir: "ltr" },
    { label: org.labels.registrationNumber, value: organization.registrationNumber, dir: "ltr" },
    { label: org.labels.registrationDate, value: org.registrationDate },
    { label: org.labels.registrar, value: org.registrar },
    { label: org.labels.activityField, value: org.activityField },
    { label: org.labels.address, value: formatPostalAddress(org.address), isAddress: true },
    { label: org.labels.email, value: dict.contact.details.email, href: contactLinks.email, dir: "ltr" },
    { label: org.labels.phone, value: dict.contact.details.phone, href: contactLinks.phone, dir: "ltr" },
    { label: org.labels.website, value: organization.websiteLabel, href: localizedPath(locale, "home"), dir: "ltr" },
  ];
}

function RowValue({ row }: { row: Row }) {
  if (row.isAddress) return <address className="not-italic">{row.value}</address>;
  const text = row.dir ? <bdi dir={row.dir}>{row.value}</bdi> : row.value;
  if (!row.href) return <>{text}</>;
  return (
    <a href={row.href} className="transition-colors hover:text-brand-700">
      {text}
    </a>
  );
}

/** The nonprofit's registered identity — the details a donor, partner or reviewer needs to verify us. */
export function OrganizationDetails({
  locale,
  dict,
  title,
  certificateCta,
  registryCta,
}: {
  locale: Locale;
  dict: Dictionary;
  title: string;
  certificateCta: string;
  registryCta: string;
}) {
  return (
    <div className="rounded-3xl border border-brand-200 bg-paper p-6 shadow-soft sm:p-8">
      <h2 id={ORGANIZATION_DETAILS_TITLE_ID} className="text-xl font-bold text-ink-950">
        {title}
      </h2>
      <dl className="mt-4 divide-y divide-line">
        {rows(locale, dict).map((row) => (
          <div key={row.label} className="grid gap-0.5 py-3">
            <dt className="text-sm font-semibold text-ink-500">{row.label}</dt>
            <dd className="font-semibold leading-snug text-ink-950">
              <RowValue row={row} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-col gap-3">
        <Button href={organization.certificatePath} external arrow>
          {certificateCta}
        </Button>
        <Button href={organization.registryUrl} external variant="outline" arrow>
          {registryCta}
        </Button>
      </div>
    </div>
  );
}
