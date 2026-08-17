"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import type { Dictionary } from "@/i18n/dictionaries";

type CommentsDict = Dictionary["comments"];

const fieldClass =
  "w-full rounded-xl border bg-paper px-4 py-3 text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:ring-4 focus:ring-brand-500/15";

type SubmitState = "idle" | "sending" | "success" | "error";

export function CommentsForm({ copy }: { copy: CommentsDict }) {
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSubmitState("sending");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(formElement))),
      });

      if (!response.ok) throw new Error("Comment submission failed");

      formElement.reset();
      setSubmitState("success");
    } catch {
      setSubmitState("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
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
            onClick={() => setSubmitState("idle")}
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
                placeholder={copy.namePlaceholder}
                className={cn(fieldClass, "border-line focus:border-brand-500")}
              />
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
                placeholder={copy.emailPlaceholder}
                className={cn(fieldClass, "border-line text-start focus:border-brand-500")}
              />
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
              placeholder={copy.messagePlaceholder}
              className={cn(fieldClass, "resize-y border-line focus:border-brand-500")}
            />
          </div>

          <button
            type="submit"
            disabled={submitState === "sending"}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-7 font-semibold text-white shadow-soft transition-all duration-200 ease-out-quart hover:bg-brand-800 hover:shadow-lift active:scale-[0.99] disabled:cursor-wait disabled:opacity-70 sm:w-auto"
          >
            {submitState === "sending" ? copy.sending : copy.submit}
          </button>
          {submitState === "error" ? (
            <p className="mt-4 text-sm font-semibold text-danger" role="alert">
              {copy.errorSubmit}
            </p>
          ) : null}
        </>
      )}
    </form>
  );
}
