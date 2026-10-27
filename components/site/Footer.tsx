import Image from "next/image";
import Link from "next/link";
import devshiftLogo from "@/assets/devshift-logo.svg";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { SocialLinks } from "@/components/site/SocialLinks";
import { contactLinks, donationLink } from "@/lib/contact";
import { formatPostalAddress, organization } from "@/lib/organization";
import { legalRouteKeys, localizedPath, type SiteRouteKey } from "@/lib/routes";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

const FOOTER_LINKS = [
  "home",
  "about",
  "lectures",
  "guidance",
  "team",
  "getInvolved",
  "videos",
  "faq",
  "contact",
] as const satisfies readonly SiteRouteKey[];

export function Footer({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <footer id="site-footer" className="relative overflow-hidden bg-brand-950 text-brand-100" data-theme="dark">
      <div aria-hidden className="weave absolute inset-0 opacity-50" />
      <div className="absolute inset-0 -z-0 bg-gradient-to-b from-brand-950 to-brand-900/60" aria-hidden />

      <div className="shell relative py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link href={localizedPath(locale, "home")} className="inline-flex text-white" aria-label={dict.brand.name}>
              <Logo name={dict.brand.name} />
            </Link>
            <p className="mt-5 max-w-sm text-[0.98rem] leading-relaxed text-brand-200">
              {dict.footer.blurb}
            </p>
            <Button href={donationLink} external variant="white" className="mt-7" arrow>
              {dict.footer.donate}
            </Button>
          </div>

          <nav className="lg:col-span-3" aria-label={dict.footer.navTitle}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-300">
              {dict.footer.navTitle}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {FOOTER_LINKS.map((route) => (
                <li key={route}>
                  <Link
                    href={localizedPath(locale, route)}
                    className="text-brand-100 transition-colors hover:text-white"
                  >
                    {dict.routeLabels[route]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="lg:col-span-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-300">
              {dict.footer.contactTitle}
            </h2>
            <ul className="mt-4 space-y-2.5 text-brand-100">
              <li dir="ltr" className="text-start">
                {dict.contact.details.email}
              </li>
              <li>
                <a className="transition-colors hover:text-white" href={contactLinks.phone} dir="ltr">
                  {dict.contact.details.phone}
                </a>
              </li>
              <li className="text-brand-200">{dict.contact.details.hours}</li>
            </ul>

            <h2 className="mt-7 text-sm font-semibold uppercase tracking-wider text-brand-300">
              {dict.footer.followTitle}
            </h2>
            <div className="mt-4">
              <SocialLinks labels={dict.footer.social} tone="dark" />
            </div>
          </div>
        </div>

        <div className="hr-brand mt-14 opacity-30" />

        <nav aria-label={dict.footer.legalTitle} className="mt-6">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100">
            {legalRouteKeys.map((route) => (
              <li key={route}>
                <Link href={localizedPath(locale, route)} className="inline-flex min-h-11 items-center rounded-sm underline decoration-brand-500 underline-offset-4 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
                  {dict.routeLabels[route]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 grid gap-1.5 text-sm text-brand-300">
          <p>
            <bdi dir="rtl" className="font-semibold text-brand-100">{organization.legalNameHebrew}</bdi>
            {" · "}
            <bdi dir="ltr">{organization.legalNameLatin}</bdi>
            {" · "}
            {dict.organization.labels.registrationNumberShort} <bdi dir="ltr">{organization.registrationNumber}</bdi>
          </p>
          <address className="not-italic">{formatPostalAddress(dict.organization.address)}</address>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-3 text-sm text-brand-300 sm:flex-row sm:items-center">
          <p>© {dict.brand.name} · {dict.footer.nonprofit} · {dict.footer.rights}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:justify-end">
            <p>{dict.footer.madeWith}</p>
            <a
              href="https://devshift.biz"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-brand-300 transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              dir="ltr"
            >
              <span>Built by</span>
              <Image src={devshiftLogo} alt="DevShift" width={80} height={18} className="block opacity-85" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
