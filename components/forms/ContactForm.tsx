"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Dictionary } from "@/i18n/dictionaries";
import { PhoneInput } from "@/components/staff/ui/phone-input";
import { contactSubmissionMessage, validateContactSubmission, type ContactErrors, type ContactField, type ContactLocale } from "@/lib/contact-validation";

type FormDict = Dictionary["contact"]["form"];

const fieldClass =
  "w-full rounded-xl border bg-paper px-4 py-3 text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:ring-4 focus:ring-brand-500/15";

type SubmitState = "idle" | "sending" | "success" | "error";

export function ContactForm({ form, privacyNotice, locale = "he" }: { form: FormDict; privacyNotice: ReactNode; locale?: ContactLocale }) {
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<ContactErrors>({});
  const [submitError, setSubmitError] = useState("");
  const submitting = useRef(false);

  const fieldProps = (field: ContactField) => ({ "aria-invalid": Boolean(errors[field]) || undefined, "aria-describedby": errors[field] ? `contact-${field}-error` : undefined });
  const fieldError = (field: ContactField) => errors[field] ? <p id={`contact-${field}-error`} className="mt-2 text-sm text-danger">{errors[field]}</p> : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (submitting.current) return;
    const payload = { ...Object.fromEntries(new FormData(formElement)), phone, locale };
    const validation = validateContactSubmission(payload, locale);
    setErrors(validation.errors);
    if (Object.keys(validation.errors).length) {
      setSubmitState("error");
      setSubmitError(contactSubmissionMessage("invalid_submission", locale));
      formElement.querySelector<HTMLElement>(`#contact-${Object.keys(validation.errors)[0]}`)?.focus();
      return;
    }

    submitting.current = true;
    setSubmitState("sending");
    setSubmitError("");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, ...validation.values }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true) {
        setErrors(result?.error === "invalid_submission" ? validateContactSubmission(payload, locale).errors : {});
        setSubmitError(contactSubmissionMessage(response.status === 429 ? "429" : result?.error, locale));
        setSubmitState("error");
        return;
      }

      formElement.reset();
      setPhone("");
      setSubmitState("success");
    } catch {
      setSubmitError(contactSubmissionMessage("network", locale));
      setSubmitState("error");
    } finally {
      submitting.current = false;
    }
  }

  const labelFor = (name: string, label: string, required?: boolean) => (
    <label htmlFor={`contact-${name}`} className="mb-1.5 block text-sm font-semibold text-ink-800">
      {label}
      {required ? <span className="text-danger"> *</span> : null}
    </label>
  );

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-describedby={submitState === "success" ? undefined : "contact-privacy-notice"}
      className="rounded-3xl border border-line bg-surface p-6 sm:p-8"
    >
      {submitState === "success" ? (
        <div className="flex min-h-80 flex-col items-center justify-center text-center" role="status">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-brand-800" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.25">
              <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="mt-5 font-display text-2xl font-black text-ink-950">{form.successTitle}</h2>
          <p className="mt-2 text-ink-700">{form.success}</p>
          <button
            type="button"
            onClick={() => setSubmitState("idle")}
            className="mt-6 rounded-full border border-brand-700 px-6 py-3 font-semibold text-brand-800 transition-colors hover:bg-brand-50"
          >
            {form.again}
          </button>
        </div>
      ) : (
        <fieldset disabled={submitState === "sending"} className="min-w-0 border-0 p-0">
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="contact-website">Website</label>
            <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              {labelFor("name", form.name, true)}
              <input
                {...fieldProps("name")}
                id="contact-name"
                name="name"
                required
                minLength={2}
                maxLength={100}
                placeholder={form.namePlaceholder}
                className={cn(fieldClass, "border-line focus:border-brand-500")}
              />
              {fieldError("name")}
            </div>
            <div>
              {labelFor("phone", form.phone)}
              <PhoneInput
                {...fieldProps("phone")}
                id="contact-phone"
                value={phone}
                onChange={setPhone}
                locale={locale}
                appearance="public"
                disabled={submitState === "sending"}
                placeholder={form.phonePlaceholder}
              />
              {fieldError("phone")}
            </div>
            <div>
              {labelFor("email", form.email, true)}
              <input
                {...fieldProps("email")}
                id="contact-email"
                name="email"
                type="email"
                dir="ltr"
                required
                maxLength={254}
                placeholder={form.emailPlaceholder}
                className={cn(fieldClass, "border-line text-start focus:border-brand-500")}
              />
              {fieldError("email")}
            </div>
            <div>
              {labelFor("topic", form.topic)}
              <select
                {...fieldProps("topic")}
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
              {fieldError("topic")}
            </div>
          </div>

          <div className="mt-5">
            {labelFor("message", form.message, true)}
            <textarea
              {...fieldProps("message")}
              id="contact-message"
              name="message"
              rows={4}
              required
              minLength={5}
              maxLength={5_000}
              placeholder={form.messagePlaceholder}
              className={cn(fieldClass, "resize-y border-line focus:border-brand-500")}
            />
            {fieldError("message")}
          </div>

          {privacyNotice}

          <button
            type="submit"
            disabled={submitState === "sending"}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-7 font-semibold text-white shadow-soft transition-all duration-200 ease-out-quart hover:bg-brand-800 hover:shadow-lift active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
          >
            {submitState === "sending" ? form.sending : form.submit}
            <svg viewBox="0 0 24 24" className="h-4 w-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h14m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {submitState === "error" ? (
            <p className="mt-4 text-sm font-semibold text-danger" role="alert">
              {submitError || form.errorSubmit}
            </p>
          ) : null}
        </fieldset>
      )}
    </form>
  );
}
