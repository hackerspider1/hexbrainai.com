import { tooMany } from "@/lib/rate";
import type { NextRequest } from "next/server";
import { getLeaves, getProgramLeaves } from "@/lib/db";

export const dynamic = "force-dynamic";

// The reports behind one weakness node, loaded when the visitor opens it.
export function GET(req: NextRequest) {
  const busy = tooMany(req, "site", 600);
  if (busy) return busy;
  const q = req.nextUrl.searchParams, program = q.get("program"), headers = { "Cache-Control": "private, max-age=120" };
  // On a program's own dial a strip is its reports in one class.
  if (program) return Response.json(getProgramLeaves(program.slice(0, 200), (q.get("class") || "").slice(0, 40)), { headers });
  return Response.json(getLeaves((q.get("weakness") || "").split("|").filter(Boolean)), { headers });
}
