import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Header, type HeaderCopy } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
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
  const headerCopy = {
    brandName: dict.brand.name,
    langName: dict.langName,
    nav: {
      about: dict.nav.about,
      stories: dict.nav.stories,
      field: dict.nav.field,
      events: dict.nav.events,
      support: dict.nav.support,
      partners: dict.nav.partners,
      contact: dict.nav.contact,
      donate: dict.nav.donate,
    },
    a11y: {
      skip: dict.a11y.skip,
      openMenu: dict.a11y.openMenu,
      closeMenu: dict.a11y.closeMenu,
      menu: dict.a11y.menu,
      langSwitch: dict.a11y.langSwitch,
    },
  } satisfies HeaderCopy;

  return (
    <>
      <Header locale={locale} copy={headerCopy} />
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
    </>
  );
}
