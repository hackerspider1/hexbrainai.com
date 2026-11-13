import type { NextRequest } from "next/server";
import { tooMany } from "@/lib/rate";
import { pick, surfaceOf } from "@/lib/subdomains";

export const dynamic = "force-dynamic";

// One page of a program's subdomains, optionally under one domain and matching some text.
export function GET(req: NextRequest) {
  const busy = tooMany(req, "hosts", 150); // each call may unpack a large list, so this has its own, lower limit
  if (busy) return busy;
  const p = req.nextUrl.searchParams, s = surfaceOf(p.get("program") || "");
  if (!s) return Response.json({ total: 0, rows: [] });
  const found = pick(s.handle, (p.get("suffix") || "").slice(0, 253), (p.get("q") || "").slice(0, 80));
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const limit = Math.min(Math.max(Number(p.get("limit")) || 120, 1), 2400); // the map asks for as many as one strip draws
  return Response.json({ total: found.length, rows: found.slice(offset, offset + limit) });
}
