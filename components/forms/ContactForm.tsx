import { cn } from "@/lib/cn";
import type { Dictionary } from "@/i18n/dictionaries";

type FormDict = Dictionary["contact"]["form"];

const fieldClass =
  "w-full rounded-xl border bg-paper px-4 py-3 text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:ring-4 focus:ring-brand-500/15";

export function ContactForm({ form, email }: { form: FormDict; email: string }) {
  const labelFor = (name: string, label: string, required?: boolean) => (
    <label htmlFor={`contact-${name}`} className="mb-1.5 block text-sm font-semibold text-ink-800">
      {label}
      {required ? <span className="text-danger"> *</span> : null}
    </label>
  );

  return (
    <form
      action={`mailto:${email}?subject=${encodeURIComponent(form.submit)}`}
      method="post"
      encType="text/plain"
      className="rounded-3xl border border-line bg-surface p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          {labelFor("name", form.name, true)}
          <input
            id="contact-name"
            name="name"
            required
            placeholder={form.namePlaceholder}
            className={cn(fieldClass, "border-line focus:border-brand-500")}
          />
        </div>
        <div>
          {labelFor("phone", form.phone)}
          <input
            id="contact-phone"
            name="phone"
            type="tel"
            dir="ltr"
            placeholder={form.phonePlaceholder}
            className={cn(fieldClass, "border-line text-start focus:border-brand-500")}
          />
        </div>
        <div>
          {labelFor("email", form.email, true)}
          <input
            id="contact-email"
            name="email"
            type="email"
            dir="ltr"
            required
            placeholder={form.emailPlaceholder}
            className={cn(fieldClass, "border-line text-start focus:border-brand-500")}
          />
        </div>
        <div>
          {labelFor("topic", form.topic)}
          <select
            id="contact-topic"
            name="topic"
            defaultValue={form.topics[0]}
            className={cn(fieldClass, "border-line focus:border-brand-500")}
          >
            {form.topics.map((topic) => (
              <option key={topic} value={topic}>
                {topic}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5">
        {labelFor("message", form.message, true)}
        <textarea
          id="contact-message"
          name="message"
          rows={4}
          required
          placeholder={form.messagePlaceholder}
          className={cn(fieldClass, "resize-y border-line focus:border-brand-500")}
        />
      </div>

      <button
        type="submit"
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-7 font-semibold text-white shadow-soft transition-all duration-200 ease-out-quart hover:bg-brand-800 hover:shadow-lift active:scale-[0.99] sm:w-auto"
      >
        {form.submit}
        <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}
