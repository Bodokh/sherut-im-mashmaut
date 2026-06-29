"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import type { Dictionary } from "@/i18n/dictionaries";

type FormDict = Dictionary["contact"]["form"];

const fieldClass =
  "w-full rounded-xl border bg-paper px-4 py-3 text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:ring-4 focus:ring-brand-500/15";

export function ContactForm({ form, email }: { form: FormDict; email: string }) {
  const uid = useId();
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    topic: form.topics[0],
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const set = (key: keyof typeof values) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!values.name.trim()) e.name = form.errorRequired;
    if (!values.email.trim()) e.email = form.errorRequired;
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) e.email = form.errorEmail;
    if (!values.message.trim()) e.message = form.errorRequired;
    return e;
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`${uid}-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    const subject = encodeURIComponent(`[${values.topic}] ${values.name}`);
    const body = encodeURIComponent(
      `${values.name}\n${values.email}${values.phone ? ` · ${values.phone}` : ""}\n\n${values.message}`,
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    setDone(true);
  };

  if (done) {
    return (
      <div
        role="status"
        className="flex h-full flex-col items-center justify-center rounded-3xl border border-green-200 bg-green-50 p-10 text-center"
      >
        <div className="grid h-14 w-14 place-items-center rounded-full bg-green-600 text-white">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="mt-5 font-display text-2xl font-bold text-ink-950">{form.successTitle}</h3>
        <p className="mt-2 max-w-sm leading-relaxed text-ink-600">{form.success}</p>
        <button
          type="button"
          onClick={() => {
            setValues({ name: "", email: "", phone: "", topic: form.topics[0], message: "" });
            setDone(false);
          }}
          className="mt-6 font-semibold text-brand-700 underline-offset-4 hover:underline"
        >
          {form.again}
        </button>
      </div>
    );
  }

  const labelFor = (name: string, label: string, required?: boolean) => (
    <label htmlFor={`${uid}-${name}`} className="mb-1.5 block text-sm font-semibold text-ink-800">
      {label}
      {required ? <span className="text-danger"> *</span> : null}
    </label>
  );

  const errorFor = (name: string) =>
    errors[name] ? (
      <p id={`${uid}-${name}-err`} role="alert" className="mt-1.5 text-sm font-medium text-danger">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form noValidate onSubmit={onSubmit} className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          {labelFor("name", form.name, true)}
          <input
            id={`${uid}-name`}
            name="name"
            value={values.name}
            onChange={set("name")}
            placeholder={form.namePlaceholder}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${uid}-name-err` : undefined}
            className={cn(fieldClass, errors.name ? "border-danger" : "border-line focus:border-brand-500")}
          />
          {errorFor("name")}
        </div>
        <div>
          {labelFor("phone", form.phone)}
          <input
            id={`${uid}-phone`}
            name="phone"
            type="tel"
            dir="ltr"
            value={values.phone}
            onChange={set("phone")}
            placeholder={form.phonePlaceholder}
            className={cn(fieldClass, "border-line text-start focus:border-brand-500")}
          />
        </div>
        <div>
          {labelFor("email", form.email, true)}
          <input
            id={`${uid}-email`}
            name="email"
            type="email"
            dir="ltr"
            value={values.email}
            onChange={set("email")}
            placeholder={form.emailPlaceholder}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? `${uid}-email-err` : undefined}
            className={cn(fieldClass, "text-start", errors.email ? "border-danger" : "border-line focus:border-brand-500")}
          />
          {errorFor("email")}
        </div>
        <div>
          {labelFor("topic", form.topic)}
          <select
            id={`${uid}-topic`}
            name="topic"
            value={values.topic}
            onChange={set("topic")}
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
          id={`${uid}-message`}
          name="message"
          rows={4}
          value={values.message}
          onChange={set("message")}
          placeholder={form.messagePlaceholder}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? `${uid}-message-err` : undefined}
          className={cn(fieldClass, "resize-y", errors.message ? "border-danger" : "border-line focus:border-brand-500")}
        />
        {errorFor("message")}
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
