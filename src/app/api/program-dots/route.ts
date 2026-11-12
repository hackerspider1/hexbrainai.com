import { tooMany } from "@/lib/rate";
import type { NextRequest } from "next/server";
import { getProgramDots } from "@/lib/db";

export const dynamic = "force-dynamic";

// Where one program's reports sit on the vulnerability map, loaded when the visitor asks to see them there.
export function GET(req: NextRequest) {
  const busy = tooMany(req, "site", 600);
  if (busy) return busy;
  const program = req.nextUrl.searchParams.get("program") || "";
  return Response.json(program ? getProgramDots(program) : {}, { headers: { "Cache-Control": "private, max-age=120" } });
}
