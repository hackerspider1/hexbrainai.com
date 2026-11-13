import { tooMany } from "@/lib/rate";
import type { NextRequest } from "next/server";
import { listReports } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const busy = tooMany(req, "site", 600);
  if (busy) return busy;
  const p = req.nextUrl.searchParams;
  return Response.json(
    listReports({
      q: p.get("q") || undefined,
      weakness: p.get("weakness") || undefined,
      cls: p.get("class") || undefined,
      program: p.get("program") || undefined,
      status: p.get("status") || undefined,
      sort: p.get("sort") || undefined,
      offset: Number(p.get("offset")) || 0,
      limit: Number(p.get("limit")) || 30,
    })
  );
}
