import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Section, Eyebrow } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { media } from "@/lib/media";
import { localizedPath } from "@/lib/routes";
import { buildPageMetadata } from "@/lib/seo";
import { teamPageGraph } from "@/lib/structured-data";

const BIO_LINK_CLASS =
  "font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 transition-colors hover:text-brand-900";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "he";
  return buildPageMetadata(safeLocale, "team", getDictionary(safeLocale));
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const t = dict.teamPage;
  const [odelia, tzofnat, lizzy, hillel, roi] = t.members;
  const eranCard = {
    name: t.eran.name,
    role: t.eran.role,
    bio: (
      <>
        {t.eran.bioExperience} {t.eran.bioBeforeDevShift}
        <a
          href="https://devshift.biz"
          target="_blank"
          rel="noreferrer"
          className={BIO_LINK_CLASS}
        >
          <bdi>{t.eran.devshiftName}</bdi>
        </a>
        {t.eran.bioBetweenCompanies}
        <a
          href="https://www.ai-crafters.com/"
          target="_blank"
          rel="noreferrer"
          className={BIO_LINK_CLASS}
        >
          <bdi>{t.eran.aiCraftersName}</bdi>
        </a>
        {t.eran.bioAfterCompanies}
      </>
    ),
  };
  const members = [
    {
      member: t.daniel,
      image: media.danielBodokh,
      anonymousAvatar: false,
      imagePosition: "center" as const,
    },
    {
      member: odelia,
      image: media.team[0],
      anonymousAvatar: false,
      imagePosition: "top" as const,
    },
    {
      member: hillel,
      image: null,
      anonymousAvatar: false,
      imagePosition: "top" as const,
    },
    {
      member: roi,
      image: null,
      anonymousAvatar: Boolean(roi && "anonymousAvatar" in roi && roi.anonymousAvatar),
      imagePosition: "top" as const,
    },
    {
      member: eranCard,
      image: media.eranBodokh,
      anonymousAvatar: false,
      imagePosition: "center" as const,
    },
    {
      member: t.talia,
      image: null,
      anonymousAvatar: false,
      imagePosition: "top" as const,
    },
    {
      member: tzofnat,
      image: media.team[1],
      anonymousAvatar: false,
      imagePosition: "top" as const,
    },
    {
      member: lizzy,
      image: media.team[2],
      anonymousAvatar: false,
      imagePosition: "top" as const,
    },
  ];

  return (
    <>
      <Header locale={locale} currentRoute="team" copy={buildHeaderCopy(dict)} />
      <JsonLd data={teamPageGraph(locale, dict)} />
      <main id="main" className="pt-[var(--header-h)]">
        <Section id="leadership" className="overflow-hidden">
          <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <Breadcrumbs locale={locale} route="team" dict={dict} />
          <div className="max-w-2xl">
            <Eyebrow>{t.kicker}</Eyebrow>
            <h1 className="mt-4 text-[clamp(2.2rem,4.2vw,3.6rem)] font-black leading-[1.06] text-ink-950">
              {t.title}
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-700">{t.lead}</p>
          </div>

          <ul className="mt-14 grid gap-8 md:grid-cols-2">
            {members.map(({ member: m, image, anonymousAvatar, imagePosition }, i) => (
              <li
                key={m.name}
                id={`team-member-${i + 1}`}
                data-reveal={i === 0 ? undefined : ""}
                style={{ ["--reveal-delay" as string]: `${(i % 2) * 90}ms` }}
                className={`grid gap-5 rounded-3xl border border-line bg-surface p-5 sm:h-[15.5rem] sm:p-6 ${
                  image || anonymousAvatar ? "sm:grid-cols-[11rem_1fr]" : "content-center"
                }`}
              >
                {image ? (
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-brand-100 sm:aspect-auto sm:min-h-44">
                    <Image
                      src={image}
                      alt={m.name}
                      fill
                      loading={i === 0 ? "eager" : "lazy"}
                      fetchPriority={i === 0 ? "high" : "auto"}
                      sizes="(max-width: 640px) 92vw, 176px"
                      className={
                        imagePosition === "center"
                          ? "object-cover object-[center_30%]"
                          : "object-cover object-top"
                      }
                    />
                  </div>
                ) : anonymousAvatar ? (
                  <div
                    aria-hidden="true"
                    className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 sm:aspect-auto sm:min-h-44"
                  >
                    <svg viewBox="0 0 96 96" className="h-28 w-28" fill="none">
                      <circle cx="48" cy="35" r="18" fill="currentColor" opacity="0.78" />
                      <path
                        d="M16 88c2.8-19.6 15.1-29.4 32-29.4S77.2 68.4 80 88"
                        fill="currentColor"
                        opacity="0.78"
                      />
                    </svg>
                  </div>
                ) : null}
                <div className={image || anonymousAvatar ? undefined : "self-center sm:px-4"}>
                  <h2 className="font-display text-2xl font-bold text-ink-950">{m.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-brand-700">{m.role}</p>
                  <p className="mt-3 leading-relaxed text-ink-600">{m.bio}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mx-auto mt-12 max-w-2xl text-center text-lg leading-relaxed text-ink-700">
            {t.volunteersNote}
          </p>
        </Section>

        {/* CTA */}
        <Section tone="navy" className="overflow-hidden">
          <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-0 opacity-40" />
          <div aria-hidden className="weave pointer-events-none absolute inset-0 -z-0 opacity-50" />
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-[clamp(1.85rem,3.4vw,2.9rem)] font-bold text-white" data-reveal>
              {t.ctaTitle}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-brand-100" data-reveal>
              {t.ctaText}
            </p>
            <div className="mt-8" data-reveal>
              <Button href={localizedPath(locale, "contact")} variant="white" size="lg" arrow>
                {t.cta}
              </Button>
            </div>
          </div>
        </Section>

        <Section className="py-14 sm:py-16">
          <RelatedLinks locale={locale} dict={dict} routes={["lectures", "guidance", "getInvolved", "contact"]} />
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
