import { tooMany } from "@/lib/rate";
import type { NextRequest } from "next/server";
import { getLeaves } from "@/lib/db";

export const dynamic = "force-dynamic";

// The reports behind one weakness node, loaded when the visitor opens it.
export function GET(req: NextRequest) {
  const busy = tooMany(req, "site", 600);
  if (busy) return busy;
  const names = (req.nextUrl.searchParams.get("weakness") || "").split("|").filter(Boolean);
  return Response.json(getLeaves(names), { headers: { "Cache-Control": "private, max-age=120" } });
}
