import type { ApiFailure } from "../contracts";

export const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache",
  "Vary": "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
};

export function failureStatus(failure: ApiFailure): number {
  switch (failure.error.code) {
    case "not_authenticated": return 401;
    case "not_staff": case "forbidden": return 403;
    case "not_found": return 404;
    case "validation": return 400;
    case "conflict": case "ceo_protected": return 409;
    default: return 503;
  }
}

export function privateFailure(failure: ApiFailure): Response {
  return Response.json(failure, { status: failureStatus(failure), headers: privateHeaders });
}

export function unauthenticated(): Response {
  return privateFailure({ ok: false, error: { code: "not_authenticated", message: "יש להיכנס למערכת כדי להמשיך." } });
}

/** A captured account is a consistency precondition, never an authorization source. */
export function accountBindingFailure(request: Request, verifiedUserId: string): ApiFailure | null {
  if (verifiedUserId && request.headers.get("X-Mentoring-Account") === verifiedUserId) return null;
  return { ok: false, error: { code: "not_authenticated", message: "זהות החשבון השתנתה. יש להיכנס מחדש לפני שליחת העדכון." } };
}

const MAX_COMMAND_BYTES = 256 * 1024;

/** JSON-only, same-origin commands. Never trust a client-supplied actor or role. */
export async function readCommandBody(request: Request): Promise<
  { ok: true; value: unknown } | ApiFailure
> {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin !== new URL(request.url).origin || (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")) {
    return { ok: false, error: { code: "forbidden", message: "לא ניתן לשלוח פעולה ממקור חיצוני." } };
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return { ok: false, error: { code: "validation", message: "יש לשלוח פעולה בפורמט הנתמך." } };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, error: { code: "validation", message: "לא התקבלו פרטי פעולה." } };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_COMMAND_BYTES) {
        await reader.cancel();
        return { ok: false, error: { code: "validation", message: "הפעולה גדולה מדי. יש לקצר את התוכן ולנסות שוב." } };
      }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) };
  } catch {
    return { ok: false, error: { code: "validation", message: "לא ניתן לקרוא את פרטי הפעולה. יש לנסות שוב." } };
  } finally {
    reader.releaseLock();
  }
}
