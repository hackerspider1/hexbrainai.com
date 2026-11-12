import { tooMany } from "@/lib/rate";
import { getGraph } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const busy = tooMany(req, "site", 600);
  if (busy) return busy;
  return Response.json(getGraph());
}
