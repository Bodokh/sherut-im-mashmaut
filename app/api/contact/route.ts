import { Resend } from "resend";
import { validateContactSubmission } from "../../../lib/contact-validation";
import { emailColors, emailPanel, emailParagraph, escapeEmailHtml, renderBrandedEmail } from "../../../lib/email/brand";
import { ORGANIZATION_EMAIL_FROM } from "../../../lib/organization-email";

const DEFAULT_SUPPORT_EMAIL = "support@imashmaut.co.il";

function readField(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  return typeof value === "string" ? value.trim() : "";
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

  const { values, errors } = validateContactSubmission(payload, payload.locale === "en" ? "en" : "he");
  if (Object.keys(errors).length) {
    return Response.json({ error: "invalid_submission", fieldErrors: errors }, { status: 400 });
  }
  const { name, email, phone, topic, message } = values;

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.CONTACT_FORM_TO_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;

  if (!apiKey) {
    console.error("RESEND_API_KEY is not configured");
    return Response.json({ error: "email_service_unavailable" }, { status: 503 });
  }

  const safeName = escapeEmailHtml(name);
  const safeEmail = escapeEmailHtml(email);
  const safeMailto = escapeEmailHtml(encodeURIComponent(email.toWellFormed()).replace("%40", "@"));
  const safePhone = phone ? `<span dir="ltr">${escapeEmailHtml(phone)}</span>` : "לא צוין";
  const safeTopic = escapeEmailHtml(topic || "יצירת קשר");
  const safeMessage = escapeEmailHtml(message).replace(/\r\n?|\n/g, "<br />");
  const subject = `פנייה חדשה מהאתר: ${topic || "יצירת קשר"}`;
  const contactFields = [
    ["שם", safeName],
    ["דוא״ל", `<a dir="ltr" href="mailto:${safeMailto}" style="color:${emailColors.ink};text-decoration:underline">${safeEmail}</a>`],
    ["טלפון", safePhone],
    ["נושא", safeTopic],
  ];
  const details = `<table width="100%" dir="rtl" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:15px;line-height:1.5;color:${emailColors.text}">${contactFields.map(([label, value], index) => `
    <tr>
      <th scope="row" width="54" align="right" valign="top" style="width:54px;padding:10px 0 10px 8px;color:${emailColors.ink};${index ? `border-top:1px solid ${emailColors.line}` : ""}">${label}</th>
      <td align="right" valign="top" style="padding:10px 0;word-break:break-word;overflow-wrap:anywhere;${index ? `border-top:1px solid ${emailColors.line}` : ""}">${value}</td>
    </tr>`).join("")}</table>`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: ORGANIZATION_EMAIL_FROM,
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
      html: renderBrandedEmail({
        language: "he",
        category: "פניות מהאתר",
        title: "פנייה חדשה מאתר שירות עם משמעות",
        body: `${emailPanel(details)}
          <h2 style="margin:24px 0 8px;color:${emailColors.ink};font-size:18px;line-height:1.4">תוכן ההודעה</h2>
          <p style="margin:0;font-size:16px;line-height:1.65;word-break:break-word;overflow-wrap:anywhere">${safeMessage}</p>`,
      }),
    });

    if (error) {
      console.error("Resend rejected contact email", error);
      return Response.json({ error: "email_send_failed" }, { status: 502 });
    }

    // The team email is already accepted. A failed courtesy confirmation must
    // not turn this into a failed submission and encourage a duplicate retry.
    try {
      const confirmation = await resend.emails.send({
        from: ORGANIZATION_EMAIL_FROM,
        to: [email],
        subject: "קיבלנו את פנייתך | שירות עם משמעות",
        text: [
          `שלום ${name},`,
          "",
          "קיבלנו את פנייתך באתר שירות עם משמעות.",
          "הצוות יחזור אליך בהקדם.",
          "",
          "אין צורך להשיב להודעה זו.",
        ].join("\n"),
        html: renderBrandedEmail({
          language: "he",
          category: "אישור פנייה",
          title: "קיבלנו את פנייתך",
          body: `${emailParagraph(`שלום ${safeName},`)}
            ${emailPanel('<p style="margin:0;font-size:16px;line-height:1.65">קיבלנו את פנייתך באתר שירות עם משמעות.<br /><strong>הצוות יחזור אליך בהקדם.</strong></p>')}
            <p style="margin:18px 0 0;color:${emailColors.muted};font-size:14px;line-height:1.6">אין צורך להשיב להודעה זו.</p>`,
        }),
      });

      if (confirmation.error) {
        console.error("Resend rejected confirmation email", confirmation.error);
      }
    } catch {
      console.error("Contact confirmation email failed after the submission was accepted");
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Contact email failed", error);
    return Response.json({ error: "email_send_failed" }, { status: 502 });
  }
}
