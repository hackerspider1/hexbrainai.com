// Plain REST access to the same tools, for assistants that call HTTP APIs instead of MCP (for example GPT Actions).
//   GET  /api/v1/search_reports?topic=ssrf&limit=5
//   POST /api/v1/get_testing_playbook   {"topic":"IDOR","program":"Shopify"}
import { TOOLS, ToolError } from "@/lib/ai";
import { NO_KEY, identify } from "@/lib/auth";
import { tooMany } from "@/lib/rate";

export const dynamic = "force-dynamic";

async function run(req: Request, params: Promise<{ tool: string }>, args: Record<string, unknown>) {
  const who = identify(req);
  if (!who) return tooMany(req, "ai-refused", 30) ?? Response.json({ error: NO_KEY }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  const busy = tooMany(req, "ai", 90, who.id);
  if (busy) return busy;
  const name = (await params).tool;
  const tool = TOOLS.find((t) => t.name === name || t.name === `hexbrain_${name}`);
  if (!tool) return Response.json({ error: `Unknown tool "${name}".`, available: TOOLS.map((t) => t.name.replace("hexbrain_", "")) }, { status: 404 });
  try {
    return Response.json((await tool.run(args)).data);
  } catch (e) {
    if (e instanceof ToolError) return Response.json({ error: e.message }, { status: 400 });
    console.error("[api]", tool.name, e);
    return Response.json({ error: "The request failed unexpectedly." }, { status: 500 });
  }
}

export function GET(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  return run(req, ctx.params, Object.fromEntries(new URL(req.url).searchParams));
}

export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  let body: unknown = {};
  try { body = await req.json(); } catch { return Response.json({ error: "Body is not valid JSON." }, { status: 400 }); }
  return run(req, ctx.params, (body && typeof body === "object" ? body : {}) as Record<string, unknown>);
}
