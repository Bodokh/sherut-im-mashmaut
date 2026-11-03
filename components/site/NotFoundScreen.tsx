import Image from "next/image";
import Link from "next/link";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { localizedPath, SITE_ORIGIN, type SiteRouteKey } from "@/lib/routes";
import { staffPathsAtRoot, staffPublicPath } from "@/lib/staff-host";
import styles from "./NotFoundScreen.module.css";

const CONTINUE_ROUTES = ["lectures", "guidance", "videos", "faq"] as const satisfies readonly SiteRouteKey[];

const LOGO_MARK_SRC = "/images/logo-mark.png";

export function NotFoundScreen({
  locale,
  context = "site",
}: {
  locale: Locale;
  context?: "site" | "staff";
}) {
  const dict = getDictionary(context === "staff" ? "he" : locale);
  const copy = dict.notFound;
  const staff = context === "staff";
  const homeHref = staff ? staffPublicPath("/staff") : localizedPath(locale, "home");
  const publicSiteHref = staff && staffPathsAtRoot() ? `${SITE_ORIGIN}/` : "/";

  if (!staff) {
    return (
      <div className={styles.page} data-theme="dark">
        <Header locale={locale} currentRoute="home" copy={buildHeaderCopy(dict)} />
        <main id="main" className={`shell ${styles.main}`}>
          <div className={styles.content}>
            <h1><span className="sr-only">404. </span>{copy.title}</h1>
            <p className={styles.lead}>{copy.lead}</p>
            <div className={styles.actions}>
              <Button href={localizedPath(locale, "home")} variant="white" size="lg" arrow className={styles.homeButton}>
                {copy.home}
              </Button>
              <Button href={localizedPath(locale, "contact")} variant="outlineLight" size="lg">
                {copy.contact}
              </Button>
            </div>
            <nav aria-label={copy.continue} className={styles.continue}>
              <p>{copy.continue}</p>
              <ul>
                {CONTINUE_ROUTES.map((route) => (
                  <li key={route}>
                    <Link href={localizedPath(locale, route)}>
                      {dict.routeLabels[route]}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                        <path d="M4 12h16m-6-6 6 6-6 6" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className={styles.art} aria-hidden="true">
            <svg className={styles.road} viewBox="0 0 600 800" fill="none">
              <defs>
                <linearGradient id="recovery-road-blue" x1="90" y1="710" x2="370" y2="70" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#3b758e" />
                  <stop offset=".45" stopColor="#a3c8d5" />
                  <stop offset="1" stopColor="#37657a" />
                </linearGradient>
                <linearGradient id="recovery-road-sage" x1="160" y1="700" x2="360" y2="160" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#819f9b" />
                  <stop offset=".5" stopColor="#e0ece8" />
                  <stop offset="1" stopColor="#92b1ae" />
                </linearGradient>
              </defs>
              <g className={styles.roadShape}>
                <path d="M345-25c-28 97 11 149-17 209-26 61-169 75-159 134 9 57 150 73 147 150-3 83-192 133-191 212 0 64 126 108 263 131C167 803 17 770 27 684c10-94 200-150 204-219 5-56-137-78-146-139-15-92 211-95 225-155 14-58-15-109 35-196Z" fill="url(#recovery-road-blue)" />
                <path d="M364-25c-30 96 5 148-22 210-24 65-132 82-116 139 16 56 188 68 185 150-4 88-166 143-153 218 13 68 149 106 266 126-176-13-345-42-353-118-10-89 154-153 161-228 7-59-149-87-161-144-17-72 144-87 157-148 14-59-13-109 36-205Z" fill="url(#recovery-road-sage)" />
              </g>
            </svg>
            <span className={styles.code} dir="ltr">404</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-10 opacity-90" />
      <div
        aria-hidden
        className="float-slow pointer-events-none absolute -z-10 hidden h-72 w-72 rounded-full bg-green-300/35 blur-3xl md:block"
        style={{ insetInlineStart: "-4rem", top: "38%" }}
      />

      {staff ? (
        <header className="relative border-b border-line/80 bg-paper/75 backdrop-blur-md">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:inset-inline-start-4 focus:top-3 focus:z-[300] focus:rounded-full focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
          >
            {dict.a11y.skip}
          </a>
          <div className="shell flex h-[var(--header-h)] items-center justify-between gap-3">
            <Link
              href={homeHref}
              aria-label={dict.brand.name}
              className="inline-flex min-w-0 shrink-0 rounded-lg text-ink-950 transition-opacity hover:opacity-85"
            >
              <Logo name={dict.brand.name} priority />
            </Link>
          </div>
        </header>
      ) : (
        <Header locale={locale} currentRoute="home" copy={buildHeaderCopy(dict)} />
      )}

      <main
        id="main"
        className={cn(
          "shell relative flex flex-1 items-center",
          staff ? "py-12 sm:py-16" : "pb-16 pt-[calc(var(--header-h)+3rem)]",
        )}
      >
        <div className="hero-rise grid w-full items-center gap-10 lg:grid-cols-[auto_minmax(0,32rem)] lg:gap-20">
          <div
            aria-hidden
            className="flex select-none items-center font-display text-[clamp(4.75rem,18vw,10.5rem)] leading-none font-black tracking-[-0.04em] text-brand-800"
          >
            <span>4</span>
            <span className="relative mx-[0.04em] inline-flex size-[0.84em] items-center justify-center text-green-600">
              <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  pathLength="1"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  className="not-found-ring"
                />
              </svg>
              <Image
                src={LOGO_MARK_SRC}
                alt=""
                width={512}
                height={512}
                priority
                sizes="180px"
                className="relative size-[74%] rounded-full shadow-glow"
              />
            </span>
            <span>4</span>
          </div>

          <div className="flex min-w-0 flex-col items-start gap-6">
            <h1 className="max-w-[14ch] text-[clamp(2.15rem,3vw+1rem,3.7rem)] font-black leading-[1.05]">
              <span className="sr-only">404. </span>
              {staff ? copy.staffTitle : copy.title}
            </h1>
            <p className="max-w-[40ch] text-lg leading-relaxed text-ink-700 sm:text-xl">
              {staff ? copy.staffLead : copy.lead}
            </p>
            <div className="flex flex-wrap gap-3">
              {staff ? (
                <>
                  <Button href={homeHref} variant="primary" size="lg" arrow>
                    {copy.staffHome}
                  </Button>
                  <Button href={publicSiteHref} variant="outline" size="lg">
                    {copy.staffSite}
                  </Button>
                </>
              ) : (
                <>
                  <Button href={localizedPath(locale, "home")} variant="primary" size="lg" arrow>
                    {copy.home}
                  </Button>
                  <Button href={localizedPath(locale, "contact")} variant="outline" size="lg">
                    {copy.contact}
                  </Button>
                </>
              )}
            </div>

            {staff ? null : (
              <>
                <div className="hr-brand w-full" />
                <nav aria-label={copy.continue} className="flex flex-col gap-3">
                  <p className="text-ink-600">{copy.continue}</p>
                  <ul className="flex flex-wrap gap-x-5 gap-y-2">
                    {CONTINUE_ROUTES.map((route) => (
                      <li key={route}>
                        <Link
                          href={localizedPath(locale, route)}
                          className="text-[1.05rem] font-semibold text-brand-800 transition-colors hover:text-brand-950"
                        >
                          {dict.routeLabels[route]}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
