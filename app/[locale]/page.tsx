import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { RevealController } from "@/components/motion/RevealController";
import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Manifesto } from "@/components/sections/Manifesto";
import { Stories } from "@/components/sections/Stories";
import { Field } from "@/components/sections/Field";
import { Events } from "@/components/sections/Events";
import { Support } from "@/components/sections/Support";
import { Partners } from "@/components/sections/Partners";
import { Donate } from "@/components/sections/Donate";
import { Contact } from "@/components/sections/Contact";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <>
      <Header locale={locale} dict={dict} />
      <main id="main">
        <Hero dict={dict} />
        <About dict={dict} />
        <Manifesto dict={dict} />
        <Stories dict={dict} />
        <Field dict={dict} />
        <Events dict={dict} />
        <Support dict={dict} />
        <Partners dict={dict} />
        <Donate dict={dict} />
        <Contact dict={dict} />
      </main>
      <Footer locale={locale} dict={dict} />
      <RevealController />
    </>
  );
}
