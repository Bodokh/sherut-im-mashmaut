import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { contactLinks } from "@/lib/contact";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";

const FOOTER_LINKS = [
  "about",
  "team",
  "stories",
  "field",
  "testimonials",
  "support",
  "partners",
  "contact",
] as const;

const SOCIAL = [
  {
    key: "instagram",
    label: "Instagram",
    href: "#",
    path: "M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.2 1 .47 1.4.9.43.4.7.8.9 1.4.17.4.36 1 .42 2.2.07 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.06 1.2-.25 1.8-.42 2.2-.2.6-.47 1-.9 1.4-.4.43-.8.7-1.4.9-.4.17-1 .36-2.2.42-1.3.07-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.06-1.8-.25-2.2-.42-.6-.2-1-.47-1.4-.9-.43-.4-.7-.8-.9-1.4-.17-.4-.36-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.06-1.2.25-1.8.42-2.2.2-.6.47-1 .9-1.4.4-.43.8-.7 1.4-.9.4-.17 1-.36 2.2-.42C8.4 2.2 8.8 2.2 12 2.2Zm0 1.8c-3.1 0-3.5 0-4.7.07-.9.04-1.4.2-1.7.32-.43.17-.74.37-1.06.7-.32.31-.52.62-.7 1.05-.12.3-.28.8-.32 1.7C3.25 8.5 3.25 8.9 3.25 12s0 3.5.07 4.7c.04.9.2 1.4.32 1.7.17.43.37.74.7 1.06.31.32.62.52 1.05.7.3.12.8.28 1.7.32 1.2.07 1.6.07 4.7.07s3.5 0 4.7-.07c.9-.04 1.4-.2 1.7-.32.43-.17.74-.37 1.06-.7.32-.31.52-.62.7-1.05.12-.3.28-.8.32-1.7.07-1.2.07-1.6.07-4.7s0-3.5-.07-4.7c-.04-.9-.2-1.4-.32-1.7a2.8 2.8 0 0 0-.7-1.06 2.8 2.8 0 0 0-1.05-.7c-.3-.12-.8-.28-1.7-.32C15.5 4 15.1 4 12 4Zm0 3.06A4.94 4.94 0 1 1 12 17a4.94 4.94 0 0 1 0-9.88Zm0 1.8a3.14 3.14 0 1 0 0 6.28 3.14 3.14 0 0 0 0-6.28Zm5.15-.86a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0Z",
  },
  {
    key: "facebook",
    label: "Facebook",
    href: "#",
    path: "M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H17V3.6c-.3-.04-1.3-.13-2.46-.13-2.43 0-4.1 1.48-4.1 4.2v2.34H7.7V13h2.74v8h3.06Z",
  },
  {
    key: "youtube",
    label: "YouTube",
    href: "#",
    path: "M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.28 5 12 5 12 5s-6.28 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.76 1.77C5.72 19 12 19 12 19s6.28 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3-5.2 3Z",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    href: contactLinks.whatsapp,
    path: "M12 2.04c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.45 1.34 4.96L2 22l5.16-1.35a9.9 9.9 0 0 0 4.84 1.25h.01c5.49 0 9.95-4.46 9.95-9.96 0-2.66-1.03-5.16-2.91-7.04A9.9 9.9 0 0 0 12 2.04Zm0 1.8c2.18 0 4.23.85 5.77 2.4a8.13 8.13 0 0 1 2.39 5.76c0 4.5-3.66 8.16-8.16 8.16a8.2 8.2 0 0 1-4.17-1.14l-.3-.18-3.06.8.82-2.98-.2-.31a8.1 8.1 0 0 1-1.25-4.35c0-4.5 3.66-8.16 8.16-8.16Zm4.71 11.62c-.26-.13-1.52-.75-1.75-.83-.24-.09-.41-.13-.58.13-.17.26-.67.83-.82 1-.15.17-.3.2-.56.07-.26-.13-1.08-.4-2.06-1.27-.76-.68-1.27-1.52-1.42-1.78-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.46.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.07-.13-.58-1.4-.79-1.92-.21-.5-.42-.43-.58-.44h-.5c-.17 0-.45.06-.68.32-.24.26-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.66.13.17 1.8 2.76 4.37 3.87.61.26 1.09.42 1.46.54.61.2 1.17.17 1.61.1.49-.07 1.52-.62 1.73-1.22.21-.6.21-1.1.15-1.22-.06-.11-.24-.18-.5-.31Z",
  },
];

function footerHref(locale: Locale, id: (typeof FOOTER_LINKS)[number]): string {
  return id === "team" ? `/${locale}/team` : `/${locale}#${id}`;
}

export function Footer({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <footer className="relative overflow-hidden bg-brand-950 text-brand-100" data-theme="dark">
      <div aria-hidden className="weave absolute inset-0 opacity-50" />
      <div className="absolute inset-0 -z-0 bg-gradient-to-b from-brand-950 to-brand-900/60" aria-hidden />

      <div className="shell relative py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-12">
          {/* Brand */}
          <div className="lg:col-span-5">
            <Link href={`/${locale}`} className="inline-flex text-white" aria-label={dict.brand.name}>
              <Logo name={dict.brand.name} />
            </Link>
            <p className="mt-5 max-w-sm text-[0.98rem] leading-relaxed text-brand-200">
              {dict.footer.blurb}
            </p>
            <Button href={`/${locale}#donate`} variant="white" className="mt-7" arrow>
              {dict.footer.donate}
            </Button>
          </div>

          {/* Nav */}
          <nav className="lg:col-span-3" aria-label={dict.footer.navTitle}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-300">
              {dict.footer.navTitle}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {FOOTER_LINKS.map((id) => (
                <li key={id}>
                  <Link
                    href={footerHref(locale, id)}
                    className="text-brand-100 transition-colors hover:text-white"
                  >
                    {dict.nav[id]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div className="lg:col-span-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-300">
              {dict.footer.contactTitle}
            </h2>
            <ul className="mt-4 space-y-2.5 text-brand-100">
              <li>
                <a className="transition-colors hover:text-white" href={contactLinks.email}>
                  {dict.contact.details.email}
                </a>
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
            <ul className="mt-4 flex items-center gap-2.5">
              {SOCIAL.map((s) => (
                <li key={s.key}>
                  <a
                    href={s.href}
                    aria-label={s.label}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-brand-100 transition-colors hover:bg-white/15 hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                      <path d={s.path} />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="hr-brand mt-14 opacity-30" />

        <div className="mt-6 flex flex-col items-start justify-between gap-2 text-sm text-brand-300 sm:flex-row sm:items-center">
          <p>
            © {dict.brand.name} · {dict.footer.nonprofit} · {dict.footer.rights}
          </p>
          <p>{dict.footer.madeWith}</p>
        </div>
      </div>
    </footer>
  );
}
