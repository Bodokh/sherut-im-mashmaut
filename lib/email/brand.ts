import { SITE_ORIGIN } from "../site-origin";

export const emailColors = {
  ink: "#102d40",
  text: "#173547",
  muted: "#3d5969",
  line: "#d3e0e5",
  mint: "#dceadf",
  sage: "#b8d0bc",
  canvas: "#edf3f5",
} as const;

const logo = `${SITE_ORIGIN}/images/logo-mark.png`;
const font = "Arial,Helvetica,sans-serif";
const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

/** Use escaped text or trusted markup for HTML fragments. */
export function emailParagraph(safeHtml: string): string {
  return `<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:${emailColors.muted};overflow-wrap:anywhere;word-break:break-word">${safeHtml}</p>`;
}

export function emailPanel(safeHtml: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 20px">
    <tr><td bgcolor="${emailColors.mint}" style="padding:20px 22px;background:${emailColors.mint};border:1px solid ${emailColors.sage};border-radius:8px;color:${emailColors.text};font-family:${font};font-size:16px;line-height:1.65">${safeHtml}</td></tr>
  </table>`;
}

/** Destinations come from fixed application URLs or provider-owned template variables. */
export function emailButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
    <td bgcolor="${emailColors.ink}" style="background:${emailColors.ink};border-radius:5px;mso-padding-alt:13px 20px">
      <a href="${escapeEmailHtml(href)}" style="display:inline-block;padding:13px 20px;background:${emailColors.ink};border-radius:5px;color:#ffffff;font-family:${font};font-size:15px;font-weight:bold;line-height:22px;text-decoration:none;mso-padding-alt:0">${escapeEmailHtml(label)}</a>
    </td>
  </tr></table>`;
}

export function renderBrandedEmail({ language, category, title, body }: {
  language: "he" | "en";
  category: string;
  title: string;
  body: string;
}): string {
  const hebrew = language === "he";
  const dir = hebrew ? "rtl" : "ltr";
  const align = hebrew ? "right" : "left";
  const name = hebrew ? "שירות עם משמעות" : "Service with Meaning";
  const secondaryName = hebrew ? "Service with Meaning" : "שירות עם משמעות";
  const safeTitle = escapeEmailHtml(title);
  const { ink, text, muted, line, sage, canvas } = emailColors;

  return `<!doctype html>
<html lang="${language}" dir="${dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${safeTitle}</title>
  <style>
    @media only screen and (max-width:480px) {
      .mail-inset { padding-left:20px !important; padding-right:20px !important; }
      .mail-title { font-size:28px !important; }
      .mail-surround { padding-top:12px !important; padding-bottom:12px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${canvas};color:${text};font-family:${font};-webkit-text-size-adjust:100%">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${canvas}" style="background:${canvas}"><tr>
    <td class="mail-surround" align="center" style="padding:32px 10px">
      <!--[if mso]><table role="presentation" width="620" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="${dir}" bgcolor="#ffffff" style="max-width:620px;background:#ffffff;border:1px solid ${line};border-radius:12px">
        <tr><td class="mail-inset" bgcolor="${ink}" style="padding:22px 32px;background:${ink};border-radius:11px 11px 0 0">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" dir="${dir}"><tr>
            <td width="70" valign="middle"><img src="${logo}" width="54" height="54" alt="" style="display:block;border:0;width:54px;height:54px;border-radius:50%"></td>
            <td valign="middle" align="${align}" style="font-family:${font}">
              <p style="margin:0;color:#ffffff;font-size:21px;line-height:1.3;font-weight:bold">${name}</p>
              <p lang="${hebrew ? "en" : "he"}" dir="${hebrew ? "ltr" : "rtl"}" style="margin:4px 0 0;color:${sage};font-size:12px;line-height:1.3;text-align:${align}">${secondaryName}</p>
            </td>
          </tr></table>
        </td></tr>
        <tr><td height="5" bgcolor="${sage}" style="height:5px;background:${sage};font-size:0;line-height:0" aria-hidden="true">&nbsp;</td></tr>
        <tr><td class="mail-inset" align="${align}" dir="${dir}" style="padding:29px 32px 16px;color:${text};font-family:${font};font-size:16px;line-height:1.65">
          <p style="margin:0 0 7px;color:#396456;font-size:13px;font-weight:bold;line-height:1.4">${escapeEmailHtml(category)}</p>
          <h1 class="mail-title" style="margin:0 0 18px;color:${text};font-size:34px;line-height:1.15;font-weight:bold;letter-spacing:-.4px">${safeTitle}</h1>
          ${body}
        </td></tr>
        <tr><td class="mail-inset" align="${align}" dir="${dir}" bgcolor="#f7f9fa" style="padding:15px 32px;background:#f7f9fa;border-top:1px solid ${line};border-radius:0 0 11px 11px;color:${muted};font-family:${font};font-size:12px;line-height:1.55">
          <strong>${name}</strong><span aria-hidden="true"> &nbsp;·&nbsp; </span><a href="${SITE_ORIGIN}" dir="ltr" style="color:${muted};text-decoration:underline">imashmaut.co.il</a>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr></table>
</body>
</html>`;
}
