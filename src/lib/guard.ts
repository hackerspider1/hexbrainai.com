// The door in front of the AI endpoints: who may call, how often, and how large a request may be.
import { NO_KEY, identify } from "@/lib/auth";
import { tooMany } from "@/lib/rate";

export const LIMITS = { perMinute: 90, perDay: 5000, perAddress: 240, refused: 30, body: 64 * 1024, batch: 10 };

/** Lets a request through or returns the response that refuses it. `cost` is how many tool calls it carries.
 *  Limits are per account, not per key, so making more keys buys nothing; a second limit per address covers many accounts on one machine. */
export function admit(req: Request, cost = 1): Response | null {
  const who = identify(req);
  if (!who) return tooMany(req, "ai-refused", LIMITS.refused) ?? Response.json({ error: NO_KEY }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  return tooMany(req, "ai-address", LIMITS.perAddress, "", cost) ?? tooMany(req, "ai", LIMITS.perMinute, who.id, cost)
    ?? (who.id ? tooMany(req, "ai-day", LIMITS.perDay, who.id, cost, 86_400_000) : null);
}

/** Reads a JSON body no larger than the limit. Returns a Response when it is too large or not JSON. */
export async function readJson(req: Request): Promise<{ body: unknown } | Response> {
  const tooBig = () => Response.json({ error: `Request body is larger than ${LIMITS.body / 1024} KB.` }, { status: 413 });
  if (Number(req.headers.get("content-length")) > LIMITS.body) return tooBig();
  const reader = req.body?.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if ((size += value.length) > LIMITS.body) { await reader.cancel(); return tooBig(); }
    chunks.push(value);
  }
  try { return { body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }; }
  catch { return Response.json({ error: "Body is not valid JSON." }, { status: 400 }); }
}
