// Request limits for the public endpoints, held in memory.
// Good for one server; behind several, put the limit in the proxy or CDN instead.
const hits = new Map<string, { n: number; reset: number }>();

/** The visitor's address as the nearest trusted proxy saw it. Visitors can put anything at the front of
 *  X-Forwarded-For, so the entry is counted from the end: HEXBRAIN_PROXY_HOPS proxies sit in front of the app (default 1). */
function clientIp(req: { headers: Headers }): string {
  const h = req.headers, platform = h.get("x-vercel-forwarded-for") || h.get("cf-connecting-ip") || h.get("fly-client-ip");
  if (platform) return platform.split(",")[0].trim();
  const chain = (h.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const hops = Math.max(1, Number(process.env.HEXBRAIN_PROXY_HOPS) || 1);
  return chain[Math.max(0, chain.length - hops)] || h.get("x-real-ip") || "local";
}

/** `who` names the caller when known (an account); otherwise the visitor's address is used. `cost` is how many requests this one counts as.
 *  Returns a 429 response when the caller has gone over `limit` in the current window, otherwise null. */
export function tooMany(req: { headers: Headers }, bucket: string, limit: number, who = "", cost = 1, windowMs = 60_000): Response | null {
  const key = bucket + "|" + (who || clientIp(req)), now = Date.now();
  let h = hits.get(key);
  if (!h || now > h.reset) {
    if (hits.size > 20000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    hits.set(key, (h = { n: 0, reset: now + windowMs }));
  }
  if ((h.n += cost) <= limit) return null;
  const wait = Math.max(1, Math.ceil((h.reset - now) / 1000));
  const when = wait > 5400 ? `${Math.round(wait / 3600)} hours` : wait > 90 ? `${Math.round(wait / 60)} minutes` : `${wait} seconds`;
  return Response.json({ error: `Too many requests. Try again in ${when}.` }, { status: 429, headers: { "Retry-After": String(wait) } });
}
