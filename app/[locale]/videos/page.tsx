import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui/Button";
import { Eyebrow, Section } from "@/components/ui/Section";
import { VideoGrid, type GridVideo } from "@/components/videos/VideoGrid";
import { YouTubePlayer } from "@/components/videos/YouTubePlayer";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { socialLinks } from "@/lib/contact";
import { localizedPath } from "@/lib/routes";
import { buildPageMetadata } from "@/lib/seo";
import { videosPageGraph } from "@/lib/structured-data";
import {
  getChannelVideos,
  youtubeEmbedUrl,
  youtubeWatchUrl,
  type YouTubeVideo,
} from "@/lib/youtube";

// Regenerate the page in the background at most every 3 hours (matches lib/youtube.ts).
export const revalidate = 10800;

const SUBSCRIBE_URL = `${socialLinks.youtube}?sub_confirmation=1`;

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds) return "";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

function toGridVideo(video: YouTubeVideo, locale: Locale): GridVideo {
  return {
    id: video.id,
    title: video.title,
    thumbnail: video.thumbnail,
    duration: formatDuration(video.durationSeconds),
    embedUrl: youtubeEmbedUrl(video.id),
    watchUrl: youtubeWatchUrl(video.id),
    publishedAt: video.publishedAt,
    publishedLabel: new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jerusalem",
    }).format(new Date(video.publishedAt)),
  };
}

// The first paragraph is usually the summary; the rest tends to be links and hashtags.
function leadParagraph(description: string): string {
  return description.split(/\n\s*\n/)[0]?.trim() ?? "";
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = isLocale(locale) ? locale : "he";
  return buildPageMetadata(safeLocale, "videos", getDictionary(safeLocale));
}

export default async function VideosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const t = dict.videosPage;

  const videos = await getChannelVideos();
  const [latest, ...rest] = videos.map((video) => toGridVideo(video, locale));
  const latestSummary = videos[0] ? leadParagraph(videos[0].description) : "";

  return (
    <>
      <Header locale={locale} currentRoute="videos" copy={buildHeaderCopy(dict)} />
      <JsonLd data={videosPageGraph(locale, dict, videos)} />
      <main id="main" className="pt-[var(--header-h)]">
        <Section className="overflow-hidden pb-14 sm:pb-16">
          <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 -z-10 opacity-60" />
          <Breadcrumbs locale={locale} route="videos" dict={dict} />
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <Eyebrow>{t.kicker}</Eyebrow>
              <h1 className="mt-4 text-[clamp(2.25rem,4.5vw,4rem)] font-black leading-[1.05] text-ink-950">
                {t.title}
              </h1>
              <p className="mt-6 max-w-[56ch] text-lg leading-relaxed text-ink-700">{t.lead}</p>
            </div>
            {latest ? (
              <Button href={SUBSCRIBE_URL} external variant="outline" size="lg" className="self-start lg:self-auto">
                {t.subscribe}
              </Button>
            ) : null}
          </div>
        </Section>

        {latest ? (
          <Section tone="navy" className="overflow-hidden py-14 sm:py-20">
            <div aria-hidden className="aurora-techelet pointer-events-none absolute inset-0 opacity-40" />
            <div aria-hidden className="weave pointer-events-none absolute inset-0 opacity-40" />
            <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(16rem,0.8fr)] lg:items-center lg:gap-12">
              <YouTubePlayer video={latest} playLabel={t.play} priority />
              <div>
                <Eyebrow tone="dark">{t.latest}</Eyebrow>
                <h2 className="mt-4 text-balance text-[clamp(1.6rem,2.6vw,2.25rem)] font-bold leading-tight text-white">
                  {latest.title}
                </h2>
                <time dateTime={latest.publishedAt} className="mt-3 block text-brand-200">
                  {latest.publishedLabel}
                </time>
                {latestSummary ? (
                  <p className="mt-5 line-clamp-5 max-w-[48ch] leading-relaxed text-brand-100">{latestSummary}</p>
                ) : null}
                <Button href={latest.watchUrl} external variant="outlineLight" className="mt-7">
                  {t.watchOnYoutube}
                </Button>
              </div>
            </div>
          </Section>
        ) : (
          <Section tone="navy" className="overflow-hidden py-16 sm:py-20">
            <div aria-hidden className="weave pointer-events-none absolute inset-0 opacity-50" />
            <div className="relative mx-auto max-w-xl text-center">
              <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold text-white">{t.emptyTitle}</h2>
              <p className="mt-4 text-lg leading-relaxed text-brand-100">{t.emptyText}</p>
              <Button href={SUBSCRIBE_URL} external variant="white" size="lg" className="mt-8">
                {t.subscribe}
              </Button>
            </div>
          </Section>
        )}

        {rest.length > 0 ? (
          <Section tone="surface" className="py-16 sm:py-20">
            <div className="mb-10 flex items-baseline justify-between gap-4">
              <h2 className="text-[clamp(1.75rem,3vw,2.5rem)] font-bold text-ink-950">{t.allVideos}</h2>
              <p className="text-ink-600">{t.videoCount.replace("{count}", String(videos.length))}</p>
            </div>
            <VideoGrid
              videos={rest}
              playLabel={t.play}
              closeLabel={t.close}
              watchOnYoutubeLabel={t.watchOnYoutube}
            />
          </Section>
        ) : null}

        <Section className="py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-[clamp(1.9rem,3.5vw,3rem)] font-bold text-ink-950">{t.ctaTitle}</h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-700">{t.ctaText}</p>
            <Button href={`${localizedPath(locale, "contact")}#contact-form`} size="lg" arrow className="mt-8">
              {t.cta}
            </Button>
          </div>
          <div className="mt-16">
            <RelatedLinks locale={locale} dict={dict} routes={["lectures", "team", "getInvolved", "contact"]} />
          </div>
        </Section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
