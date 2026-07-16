import { Resend } from "resend";

const DEFAULT_SUPPORT_EMAIL = "support@imashmaut.co.il";
const FROM_EMAIL = "שירות עם משמעות <notifications@imashmaut.co.il>";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "unsupported_content_type" }, { status: 415 });
  }

  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > 12_000) {
    return Response.json({ error: "submission_too_large" }, { status: 413 });
  }

  let body: unknown;

  try {
    const rawBody = await request.text();
    if (rawBody.length > 12_000) {
      return Response.json({ error: "submission_too_large" }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "invalid_submission" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const website = readField(payload, "website");

  // Bots commonly fill hidden fields. Return success so they do not retry.
  if (website) return Response.json({ success: true });

  const name = readField(payload, "name");
  const email = readField(payload, "email");
  const phone = readField(payload, "phone");
  const topic = readField(payload, "topic");
  const message = readField(payload, "message");

  const isValid =
    name.length >= 2 &&
    name.length <= 100 &&
    EMAIL_PATTERN.test(email) &&
    email.length <= 254 &&
    phone.length <= 50 &&
    topic.length <= 100 &&
    message.length >= 5 &&
    message.length <= 5_000;

  if (!isValid) {
    return Response.json({ error: "invalid_submission" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.CONTACT_FORM_TO_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;

  if (!apiKey) {
    console.error("RESEND_API_KEY is not configured");
    return Response.json({ error: "email_service_unavailable" }, { status: 503 });
  }

  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone || "לא צוין");
  const safeTopic = escapeHtml(topic || "יצירת קשר");
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");
  const subject = `פנייה חדשה מהאתר: ${topic || "יצירת קשר"}`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [recipient],
      replyTo: email,
      subject,
      text: [
        `שם: ${name}`,
        `דוא״ל: ${email}`,
        `טלפון: ${phone || "לא צוין"}`,
        `נושא: ${topic || "יצירת קשר"}`,
        "",
        message,
      ].join("\n"),
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #172033">
          <h2 style="margin-bottom: 20px">פנייה חדשה מאתר שירות עם משמעות</h2>
          <p><strong>שם:</strong> ${safeName}</p>
          <p><strong>דוא״ל:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
          <p><strong>טלפון:</strong> ${safePhone}</p>
          <p><strong>נושא:</strong> ${safeTopic}</p>
          <hr style="border: 0; border-top: 1px solid #dce2ec; margin: 24px 0" />
          <p>${safeMessage}</p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend rejected contact email", error);
      return Response.json({ error: "email_send_failed" }, { status: 502 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Contact email failed", error);
    return Response.json({ error: "email_send_failed" }, { status: 502 });
  }
}
