// A small per-visitor request limit for the public endpoints, held in memory.
// Good for one server; behind several, put the limit in the proxy or CDN instead.
const hits = new Map<string, { n: number; reset: number }>();

/** `who` names the caller when known (an API key); otherwise the visitor's address is used.
 *  Returns a 429 response when this visitor has made more than `perMinute` requests in the current minute, otherwise null. */
export function tooMany(req: Request, bucket: string, perMinute: number, who = ""): Response | null {
  const ip = who || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const key = bucket + "|" + ip, now = Date.now();
  let h = hits.get(key);
  if (!h || now > h.reset) {
    if (hits.size > 20000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    hits.set(key, (h = { n: 0, reset: now + 60_000 }));
  }
  if (++h.n <= perMinute) return null;
  const wait = Math.max(1, Math.ceil((h.reset - now) / 1000));
  return Response.json({ error: `Too many requests. Try again in ${wait} seconds.` }, { status: 429, headers: { "Retry-After": String(wait) } });
}
