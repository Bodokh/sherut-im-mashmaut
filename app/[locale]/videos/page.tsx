import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Breadcrumbs } from "@/components/site/Breadcrumbs";
import { RelatedLinks } from "@/components/site/RelatedLinks";
import { JsonLd } from "@/components/seo/JsonLd";
import { Button } from "@/components/ui/Button";
import { VideoGrid, type GridVideo } from "@/components/videos/VideoGrid";
import { YouTubePlayer } from "@/components/videos/YouTubePlayer";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { socialLinks } from "@/lib/contact";
import { localizedPath } from "@/lib/routes";
import { resolvePageMetadata } from "@/lib/seo";
import { videosPageGraph } from "@/lib/structured-data";
import {
  getChannelVideos,
  youtubeEmbedUrl,
  youtubeWatchUrl,
  type YouTubeVideo,
} from "@/lib/youtube";
import styles from "./videos.module.css";

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
  return resolvePageMetadata(locale, "videos");
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
      <main id="main" className={styles.main}>
        <section className={styles.cinema} data-theme="dark">
          <div className="shell">
            <div className={styles.breadcrumbs}><Breadcrumbs locale={locale} route="videos" dict={dict} /></div>
            <div className={styles.introduction}>
              <div>
                <h1>{t.title}</h1>
                <p className={styles.lead}>{t.lead}</p>
              </div>
              {latest ? <a href={SUBSCRIBE_URL} target="_blank" rel="noopener noreferrer" className={styles.subscribe}>
                {t.subscribe}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>
              </a> : null}
            </div>

            {latest ? (
              <div className={styles.featured}>
                <p className={styles.featuredLabel}>{t.latest}</p>
                <YouTubePlayer video={latest} playLabel={t.play} priority />
                <div className={styles.featuredDetails}>
                  <div>
                    <h2>{latest.title}</h2>
                    <time dateTime={latest.publishedAt}>{latest.publishedLabel}</time>
                  </div>
                  <div className={styles.featuredDescription}>
                    {latestSummary ? <p>{latestSummary}</p> : null}
                    <a href={latest.watchUrl} target="_blank" rel="noopener noreferrer" className={styles.youtubeLink}>{t.watchOnYoutube}</a>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.empty}>
                <svg viewBox="0 0 80 80" fill="none" aria-hidden="true"><rect x="3" y="13" width="74" height="54" rx="8" /><path d="m33 27 19 13-19 13V27Z" /></svg>
                <h2>{t.emptyTitle}</h2>
                <p>{t.emptyText}</p>
                <Button href={SUBSCRIBE_URL} external variant="white" size="lg">{t.subscribe}</Button>
              </div>
            )}
          </div>
        </section>

        {rest.length > 0 ? <section className={styles.library}>
          <div className="shell">
            <div className={styles.libraryHeading}>
              <h2>{t.allVideos}</h2>
              <p>{t.videoCount.replace("{count}", String(videos.length))}</p>
            </div>
            <VideoGrid videos={rest} playLabel={t.play} closeLabel={t.close} watchOnYoutubeLabel={t.watchOnYoutube} />
          </div>
        </section> : null}

        <section className={styles.invitation}>
          <div className="shell">
            <div className={styles.invitationInner}>
              <div><h2>{t.ctaTitle}</h2><p>{t.ctaText}</p></div>
              <Button href={`${localizedPath(locale, "contact")}#contact-form`} size="lg" arrow>{t.cta}</Button>
            </div>
            <RelatedLinks locale={locale} dict={dict} routes={["lectures", "team", "getInvolved", "contact"]} />
          </div>
        </section>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
