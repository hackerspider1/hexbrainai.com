// Request limits for the public endpoints, held in memory.
// Good for one server; behind several, put the limit in the proxy or CDN instead.
const hits = new Map<string, { n: number; reset: number }>();

/** The visitor's address as the nearest trusted proxy saw it. Visitors can put anything at the front of
 *  X-Forwarded-For, so the entry is counted from the end: HEXBRAIN_PROXY_HOPS proxies sit in front of the app (default 1).
 *  A host that passes the address in a header of its own can name it in HEXBRAIN_CLIENT_IP_HEADER; no such header is trusted unless named. */
function clientIp(req: { headers: Headers }): string {
  const h = req.headers, named = process.env.HEXBRAIN_CLIENT_IP_HEADER, platform = named ? h.get(named) : null;
  if (platform) return platform.split(",")[0].trim();
  const chain = (h.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const hops = Math.max(1, Number(process.env.HEXBRAIN_PROXY_HOPS) || 1);
  return chain[Math.max(0, chain.length - hops)] || h.get("x-real-ip") || "local";
}
/** One IPv6 customer usually holds a whole /64, so those addresses are counted together; IPv4 addresses are counted singly. */
const network = (ip: string) => (ip.includes(":") ? ip.toLowerCase().split(":").slice(0, 4).join(":") + "::/64" : ip);
const MOST = 50_000; // entries kept at once

/** `who` names the caller when known (an account); otherwise the visitor's address is used. `cost` is how many requests this one counts as.
 *  Returns a 429 response when the caller has gone over `limit` in the current window, otherwise null. */
export function tooMany(req: { headers: Headers }, bucket: string, limit: number, who = "", cost = 1, windowMs = 60_000): Response | null {
  const key = bucket + "|" + (who || network(clientIp(req))), now = Date.now();
  let h = hits.get(key);
  if (!h || now > h.reset) {
    hits.delete(key);
    // Kept small without scanning on every request: finished windows are swept when the map fills, and if a flood of
    // new addresses still overfills it the oldest entries go first.
    if (hits.size >= MOST) { for (const [k, v] of hits) if (now > v.reset) hits.delete(k); for (const k of hits.keys()) { if (hits.size < MOST * 0.9) break; hits.delete(k); } }
    hits.set(key, (h = { n: 0, reset: now + windowMs }));
  }
  if ((h.n += cost) <= limit) return null;
  const wait = Math.max(1, Math.ceil((h.reset - now) / 1000));
  const when = wait > 5400 ? `${Math.round(wait / 3600)} hours` : wait > 90 ? `${Math.round(wait / 60)} minutes` : `${wait} seconds`;
  return Response.json({ error: `Too many requests. Try again in ${when}.` }, { status: 429, headers: { "Retry-After": String(wait) } });
}
