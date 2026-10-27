"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { contactSubmissionMessage, validateContactSubmission, type ContactErrors, type ContactField } from "@/lib/contact-validation";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

type CommentsDict = Dictionary["comments"];

const fieldClass =
  "w-full rounded-xl border bg-paper px-4 py-3 text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:ring-4 focus:ring-brand-500/15";

type SubmitState = "idle" | "sending" | "success" | "error";

export function CommentsForm({ copy, privacyNotice, locale = "he" }: { copy: CommentsDict; privacyNotice: ReactNode; locale?: Locale }) {
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [fieldErrors, setFieldErrors] = useState<ContactErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const submitting = useRef(false);

  function validateField(field: ContactField, form: HTMLFormElement | null) {
    if (!form) return;
    const { errors } = validateContactSubmission(Object.fromEntries(new FormData(form)), locale);
    setFieldErrors((current) => ({ ...current, [field]: errors[field] }));
  }

  function clearField(field: ContactField) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setErrorMessage(null);
    setSubmitState("idle");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const formElement = event.currentTarget;
    const payload = Object.fromEntries(new FormData(formElement));
    const validation = validateContactSubmission(payload, locale);
    setFieldErrors(validation.errors);
    setErrorMessage(null);
    if (Object.values(validation.errors).some(Boolean)) {
      setSubmitState("error");
      setErrorMessage(copy.validationSummary);
      const firstField = Object.keys(validation.errors)[0];
      const input = formElement.elements.namedItem(firstField);
      if (input instanceof HTMLElement) input.focus();
      return;
    }
    submitting.current = true;
    setSubmitState("sending");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, ...validation.values, locale }),
      });

      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !result || typeof result !== "object" || !("success" in result) || result.success !== true) {
        const errorCode = response.status === 429 ? "rate_limit" : response.status === 413 ? "submission_too_large" : result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "email_send_failed";
        if (errorCode === "invalid_submission") {
          // Revalidate locally so the UI only displays our translated field messages.
          setFieldErrors(validateContactSubmission(payload, locale).errors);
        }
        setErrorMessage(contactSubmissionMessage(errorCode, locale));
        setSubmitState("error");
        return;
      }

      formElement.reset();
      setFieldErrors({});
      setSubmitState("success");
    } catch {
      setErrorMessage(contactSubmissionMessage("network", locale));
      setSubmitState("error");
    } finally {
      submitting.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={submitState === "sending"} aria-describedby={submitState === "success" ? undefined : "comment-privacy-notice"} className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
      {submitState === "success" ? (
        <div className="flex min-h-64 flex-col items-center justify-center text-center" role="status">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-brand-800" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.25">
              <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h3 className="mt-5 font-display text-2xl font-black text-ink-950">{copy.successTitle}</h3>
          <p className="mt-2 text-ink-700">{copy.success}</p>
          <button
            type="button"
            onClick={() => { setSubmitState("idle"); setErrorMessage(null); }}
            className="mt-6 rounded-full border border-brand-700 px-6 py-3 font-semibold text-brand-800 transition-colors hover:bg-brand-50"
          >
            {copy.again}
          </button>
        </div>
      ) : (
        <>
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="comment-website">Website</label>
            <input id="comment-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <input type="hidden" name="topic" value={copy.topic} />

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="comment-name" className="mb-1.5 block text-sm font-semibold text-ink-800">
                {copy.name} <span className="text-danger">*</span>
              </label>
              <input
                id="comment-name"
                name="name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                disabled={submitState === "sending"}
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? "comment-name-error" : undefined}
                onBlur={(event) => validateField("name", event.currentTarget.form)}
                onChange={() => clearField("name")}
                placeholder={copy.namePlaceholder}
                className={cn(fieldClass, fieldErrors.name ? "border-danger focus:border-danger" : "border-line focus:border-brand-500")}
              />
              {fieldErrors.name && <p id="comment-name-error" className="mt-1.5 text-sm font-semibold text-danger" role="alert">{fieldErrors.name}</p>}
            </div>
            <div>
              <label htmlFor="comment-email" className="mb-1.5 block text-sm font-semibold text-ink-800">
                {copy.email} <span className="text-danger">*</span>
              </label>
              <input
                id="comment-email"
                name="email"
                type="email"
                dir="ltr"
                required
                maxLength={254}
                autoComplete="email"
                disabled={submitState === "sending"}
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? "comment-email-error" : undefined}
                onBlur={(event) => validateField("email", event.currentTarget.form)}
                onChange={() => clearField("email")}
                placeholder={copy.emailPlaceholder}
                className={cn(fieldClass, "text-start", fieldErrors.email ? "border-danger focus:border-danger" : "border-line focus:border-brand-500")}
              />
              {fieldErrors.email && <p id="comment-email-error" className="mt-1.5 text-sm font-semibold text-danger" role="alert">{fieldErrors.email}</p>}
            </div>
          </div>

          <div className="mt-5">
            <label htmlFor="comment-message" className="mb-1.5 block text-sm font-semibold text-ink-800">
              {copy.message} <span className="text-danger">*</span>
            </label>
            <textarea
              id="comment-message"
              name="message"
              rows={4}
              required
              minLength={5}
              maxLength={5_000}
              disabled={submitState === "sending"}
              aria-invalid={!!fieldErrors.message}
              aria-describedby={fieldErrors.message ? "comment-message-error" : undefined}
              onBlur={(event) => validateField("message", event.currentTarget.form)}
              onChange={() => clearField("message")}
              placeholder={copy.messagePlaceholder}
              className={cn(fieldClass, "resize-y", fieldErrors.message ? "border-danger focus:border-danger" : "border-line focus:border-brand-500")}
            />
            {fieldErrors.message && <p id="comment-message-error" className="mt-1.5 text-sm font-semibold text-danger" role="alert">{fieldErrors.message}</p>}
          </div>

          {privacyNotice}

          <button
            type="submit"
            disabled={submitState === "sending"}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-7 font-semibold text-white shadow-soft transition-all duration-200 ease-out-quart hover:bg-brand-800 hover:shadow-lift active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
          >
            {submitState === "sending" ? copy.sending : copy.submit}
          </button>
          {submitState === "error" && errorMessage ? (
            <p className="mt-4 text-sm font-semibold text-danger" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </>
      )}
    </form>
  );
}
