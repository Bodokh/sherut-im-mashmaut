import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Section, Eyebrow } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { media } from "@/lib/media";

const FOUNDER_INDEX = 0; // אודליה קדמי — order matches `about.members` / `media.team`

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = getDictionary(isLocale(locale) ? locale : "he");
  return {
    title: t.teamPage.metaTitle,
    description: t.teamPage.metaDescription,
  };
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
  const lecturerMembers = dict.about.members;
  const members = [
    ...lecturerMembers.map((member, index) => ({
      member,
      image: media.team[index],
      imagePosition: "top" as const,
    })),
    {
      member: t.daniel,
      image: media.danielBodokh,
      imagePosition: "center" as const,
    },
  ];
  const founder = lecturerMembers[FOUNDER_INDEX];

  return (
    <>
      <Header locale={locale} copy={buildHeaderCopy(dict)} />
      <main id="main" className="pt-[var(--header-h)]">
        <Section className="overflow-hidden">
          <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <div className="max-w-2xl">
            <Eyebrow>{t.kicker}</Eyebrow>
            <h1 className="mt-4 text-[clamp(2.2rem,4.2vw,3.6rem)] font-black leading-[1.06] text-ink-950">
              {t.title}
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-700">{t.lead}</p>
          </div>

          <ul className="mt-14 grid gap-8 md:grid-cols-2">
            {members.map(({ member: m, image, imagePosition }, i) => (
              <li
                key={m.name}
                data-reveal
                style={{ ["--reveal-delay" as string]: `${(i % 2) * 90}ms` }}
                className="grid gap-5 rounded-3xl border border-line bg-surface p-5 sm:grid-cols-[11rem_1fr] sm:p-6"
              >
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-brand-100 sm:aspect-auto sm:min-h-44">
                  <Image
                    src={image}
                    alt={m.name}
                    fill
                    sizes="(max-width: 640px) 92vw, 176px"
                    className={
                      imagePosition === "center"
                        ? "object-cover object-[center_30%]"
                        : "object-cover object-top"
                    }
                  />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-bold text-ink-950">{m.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-brand-700">{m.role}</p>
                  <p className="mt-3 leading-relaxed text-ink-600">{m.bio}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* צוות הנהלה */}
        <Section id="leadership" tone="surface">
          <div className="max-w-2xl" data-reveal>
            <h2 className="text-[clamp(1.85rem,3.2vw,2.75rem)] font-bold text-balance">
              {t.leadershipTitle}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-700">{t.leadershipLead}</p>
          </div>

          <div
            className="mt-10 grid max-w-3xl gap-5 rounded-3xl border border-line bg-paper p-5 sm:grid-cols-[10rem_1fr] sm:p-6"
            data-reveal
          >
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-brand-100">
              <Image
                src={media.team[FOUNDER_INDEX]}
                alt={founder.name}
                fill
                sizes="(max-width: 640px) 92vw, 160px"
                className="object-cover object-top"
              />
            </div>
            <div>
              <h3 className="font-display text-2xl font-bold text-ink-950">{founder.name}</h3>
              <p className="mt-1 text-sm font-semibold text-brand-700">{founder.role}</p>
              <p className="mt-3 leading-relaxed text-ink-600">{founder.bio}</p>
            </div>
          </div>
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
              <Button href={`/${locale}/contact`} variant="white" size="lg" arrow>
                {t.cta}
              </Button>
            </div>
          </div>
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
