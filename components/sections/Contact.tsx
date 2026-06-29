import { Section, Eyebrow } from "@/components/ui/Section";
import { ContactForm } from "@/components/forms/ContactForm";
import type { Dictionary } from "@/i18n/dictionaries";

function DetailRow({ label, value, href, dir }: { label: string; value: string; href?: string; dir?: "ltr" }) {
  const content = (
    <>
      <dt className="text-sm font-semibold text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-display text-lg font-bold text-ink-950" dir={dir}>
        {value}
      </dd>
    </>
  );
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      {href ? (
        <a href={href} className="block transition-colors hover:text-brand-700">
          {content}
        </a>
      ) : (
        content
      )}
    </div>
  );
}

export function Contact({ dict }: { dict: Dictionary }) {
  const t = dict.contact;
  const d = t.details;

  return (
    <Section id="contact">
      <div className="max-w-2xl" data-reveal>
        <Eyebrow>{t.kicker}</Eyebrow>
        <h2 className="mt-4 text-[clamp(2rem,3.6vw,3.25rem)] font-bold text-balance">{t.title}</h2>
        <p className="mt-5 text-lg leading-relaxed text-ink-700">{t.lead}</p>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7" data-reveal>
          <ContactForm form={t.form} email={d.email} />
        </div>

        <aside className="lg:col-span-5" data-reveal style={{ ["--reveal-delay" as string]: "120ms" }}>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <DetailRow label={d.emailLabel} value={d.email} href={`mailto:${d.email}`} dir="ltr" />
            <DetailRow label={d.phoneLabel} value={d.phone} href={`tel:${d.phone}`} dir="ltr" />
            <DetailRow label={d.hoursLabel} value={d.hours} />
            <DetailRow label={d.addressLabel} value={d.address} />
          </dl>
        </aside>
      </div>
    </Section>
  );
}
