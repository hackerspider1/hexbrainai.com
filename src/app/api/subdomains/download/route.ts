import { gunzipSync } from "node:zlib";
import type { NextRequest } from "next/server";
import { tooMany } from "@/lib/rate";
import { packed, pick, surfaceOf } from "@/lib/subdomains";

export const dynamic = "force-dynamic";

// A program's subdomains as a text file, one per line: all of them, or those under one domain.
export function GET(req: NextRequest) {
  const busy = tooMany(req, "download", 20);
  if (busy) return busy;
  const p = req.nextUrl.searchParams, s = surfaceOf(p.get("program") || "");
  if (!s) return Response.json({ error: "No subdomains are stored for this program." }, { status: 404 });
  const suffix = (p.get("suffix") || "").slice(0, 253).toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const headers = { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${suffix || s.handle}-subdomains.txt"`, "X-Content-Type-Options": "nosniff" };
  if (!suffix) return new Response(new Uint8Array(gunzipSync(packed(s.handle))), { headers }); // compressed again on the way out by the server in front
  const names = pick(s.handle, suffix, "");
  if (!names.length) return Response.json({ error: "No subdomains are stored under that domain." }, { status: 404 });
  return new Response(names.join("\n") + "\n", { headers });
}
