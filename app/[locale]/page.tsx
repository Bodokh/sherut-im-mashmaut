import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Header, buildHeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Manifesto } from "@/components/sections/Manifesto";
import { Stories } from "@/components/sections/Stories";
import { ReachMap } from "@/components/sections/ReachMap";
import { Support } from "@/components/sections/Support";
import { Partners } from "@/components/sections/Partners";
import { Testimonials } from "@/components/sections/Testimonials";
import { Donate } from "@/components/sections/Donate";
import { Contact } from "@/components/sections/Contact";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <>
      <Header locale={locale} copy={buildHeaderCopy(dict)} />
      <main id="main">
        <Hero locale={locale} dict={dict} />
        <About locale={locale} dict={dict} />
        <Manifesto dict={dict} />
        <Stories dict={dict} />
        <ReachMap dict={dict} />
        <Support dict={dict} />
        <Partners locale={locale} dict={dict} />
        <Testimonials dict={dict} />
        <Donate dict={dict} />
        <Contact locale={locale} dict={dict} />
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
