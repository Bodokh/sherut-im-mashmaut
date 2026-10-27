import Image from "next/image";
import Link from "next/link";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/cn";
import { localizedPath, type SiteRouteKey } from "@/lib/routes";

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
  const homeHref = staff ? "/staff" : localizedPath(locale, "home");

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
                  <Button href="/staff" variant="primary" size="lg" arrow>
                    {copy.staffHome}
                  </Button>
                  <Button href="/" variant="outline" size="lg">
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
