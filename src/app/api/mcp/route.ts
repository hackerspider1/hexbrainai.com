// Model Context Protocol endpoint (Streamable HTTP, stateless, JSON responses).
// Add it to an MCP client as an HTTP server at <site>/api/mcp.
import { INSTRUCTIONS, TOOLS, ToolError } from "@/lib/ai";
import { NO_KEY, identify } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { tooMany } from "@/lib/rate";

export const dynamic = "force-dynamic";

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(m: Rpc) {
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(m.id, -32600, "Not a JSON-RPC 2.0 request.");
  if (m.id === undefined) return null; // a notification: nothing to answer
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "hexbrain", title: SITE.name, version: "0.1.0" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, {
        tools: TOOLS.map((t) => ({
          name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
          annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === m.params?.name);
      if (!tool) return fail(m.id, -32602, `Unknown tool "${String(m.params?.name)}". Available: ${TOOLS.map((t) => t.name).join(", ")}.`);
      try {
        const out = await tool.run((m.params?.arguments as Record<string, unknown>) ?? {});
        return ok(m.id, { content: [{ type: "text", text: out.text }], structuredContent: out.data, isError: false });
      } catch (e) {
        const msg = e instanceof ToolError ? e.message : "The tool failed unexpectedly. Try again, or try a narrower request.";
        if (!(e instanceof ToolError)) console.error("[mcp]", tool.name, e);
        return ok(m.id, { content: [{ type: "text", text: msg }], isError: true });
      }
    }
    case "resources/list": return ok(m.id, { resources: [] });
    case "prompts/list": return ok(m.id, { prompts: [] });
    default:
      return fail(m.id, -32601, `Method "${m.method}" is not supported.`);
  }
}

export async function POST(req: Request) {
  // Browsers on other sites must not be able to drive a locally running server.
  const origin = req.headers.get("origin");
  let sameSite = true;
  if (origin) { try { sameSite = new URL(origin).host === (req.headers.get("host") || new URL(req.url).host); } catch { sameSite = false; } }
  if (origin && !sameSite && !(process.env.HEXBRAIN_ALLOWED_ORIGINS || "").split(",").includes(origin))
    return Response.json(fail(null, -32000, "Origin not allowed."), { status: 403 });
  const who = identify(req);
  if (!who) return tooMany(req, "ai-refused", 30) ?? Response.json(fail(null, -32001, NO_KEY), { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  const busy = tooMany(req, "ai", 90, who.id);
  if (busy) return busy;
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json(fail(null, -32700, "Body is not valid JSON."), { status: 400 }); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m as Rpc)))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const out = await handle(body as Rpc);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}

// No server-initiated stream and no sessions to end.
const notAllowed = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
export const GET = notAllowed;
export const DELETE = notAllowed;
