// Plain REST access to the same tools, for assistants that call HTTP APIs instead of MCP (for example GPT Actions).
//   GET  /api/v1/search_reports?topic=ssrf&limit=5
//   POST /api/v1/get_testing_playbook   {"topic":"IDOR","program":"Shopify"}
import { TOOLS, ToolError } from "@/lib/ai";
import { admit, readJson } from "@/lib/guard";

export const dynamic = "force-dynamic";

async function run(req: Request, params: Promise<{ tool: string }>, args: Record<string, unknown>) {
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
  return admit(req) ?? run(req, ctx.params, Object.fromEntries(new URL(req.url).searchParams));
}

export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }) {
  const refused = admit(req);
  if (refused) return refused;
  const read = await readJson(req);
  if (read instanceof Response) return read;
  const { body } = read;
  return run(req, ctx.params, (body && typeof body === "object" ? body : {}) as Record<string, unknown>);
}
