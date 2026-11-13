// Model Context Protocol endpoint (Streamable HTTP, stateless, JSON responses).
// Add it to an MCP client as an HTTP server at <site>/api/mcp.
import { INSTRUCTIONS, TOOLS, ToolError } from "@/lib/ai";
import { LIMITS, admit, readJson } from "@/lib/guard";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

// Ready-made starting points an assistant's user can pick: each one walks the tools in a sensible order.
const PROMPTS: { name: string; title: string; description: string; arguments: { name: string; description: string; required: boolean }[]; text: (arg: (name: string) => string) => string }[] = [
  {
    name: "hunt_program", title: "Plan a hunt on a program",
    description: "Builds a test plan for one bug bounty program from what has been reported to it, how it closed those reports, and its known attack surface.",
    arguments: [{ name: "program", description: 'Program name, e.g. "Shopify".', required: true }, { name: "focus", description: "Optional: a feature, asset or bug class to concentrate on.", required: false }],
    text: (arg) => `Plan a bug bounty hunt on ${arg("program")}${arg("focus") ? `, concentrating on ${arg("focus")}` : ""}, using ${SITE.name}.\n` +
      "1. Call hexbrain_get_program_history for the program. Note which classes are reported most, which are often closed as informative or not applicable, and which are rarely reported.\n" +
      "2. Call hexbrain_get_attack_surface. Pick hosts worth a look (try contains: admin, staging, dev, api, internal). These names are not a statement of scope.\n" +
      "3. For the two or three most promising bug classes, call hexbrain_get_testing_playbook with this program, and read one write-up in full with hexbrain_get_report.\n" +
      "4. Give me a short plan: where to look first and why, what to try on each, and which findings this program has tended to reject.\n" +
      "Before any testing, remind me to check the program's own policy for scope. Do not send any requests to the target yourself unless I ask.",
  },
  {
    name: "check_finding", title: "Check a finding before reporting it",
    description: "Compares a finding with disclosed reports to judge whether it is likely a duplicate, how similar ones were closed, and what they paid.",
    arguments: [{ name: "finding", description: "What you found, in a sentence or two.", required: true }, { name: "program", description: "Optional: the program you would report it to.", required: false }],
    text: (arg) => `I found this${arg("program") ? ` on ${arg("program")}` : ""}: ${arg("finding")}\nUsing ${SITE.name}, tell me whether it is worth reporting.\n` +
      `1. Call hexbrain_search_reports for it${arg("program") ? " with this program" : ""}, with search_writeups true. Then repeat with status "duplicate", "informative" and "na" to see what was turned down.\n` +
      (arg("program") ? "2. Call hexbrain_get_program_history to see how this program closes reports of this class.\n" : "2. Search again without a program filter to see how other programs treated the same thing.\n") +
      "3. Read the closest one or two with hexbrain_get_report.\n" +
      "4. Tell me: the nearest disclosed reports, how they were closed and what they paid, how likely mine is to be a duplicate or informative, and what evidence or impact would make it stronger.",
  },
];

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(m: Rpc) {
  if (!m || typeof m !== "object" || Array.isArray(m)) return fail(null, -32600, "Not a JSON-RPC 2.0 request.");
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(m.id, -32600, "Not a JSON-RPC 2.0 request.");
  if (m.id === undefined) return null; // a notification: nothing to answer
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
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
    case "prompts/list":
      return ok(m.id, { prompts: PROMPTS.map((p) => ({ name: p.name, title: p.title, description: p.description, arguments: p.arguments })) });
    case "prompts/get": {
      const p = PROMPTS.find((x) => x.name === m.params?.name), given = (m.params?.arguments ?? {}) as Record<string, unknown>;
      if (!p) return fail(m.id, -32602, `Unknown prompt "${String(m.params?.name)}". Available: ${PROMPTS.map((x) => x.name).join(", ")}.`);
      const missing = p.arguments.filter((x) => x.required && !String(given[x.name] ?? "").trim()).map((x) => x.name);
      if (missing.length) return fail(m.id, -32602, `Missing argument: ${missing.join(", ")}.`);
      const arg = (name: string) => String(given[name] ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
      return ok(m.id, { description: p.description, messages: [{ role: "user", content: { type: "text", text: p.text(arg) } }] });
    }
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
  const read = await readJson(req);
  // A batch counts as one request per message in it, so batching is not a way round the limit.
  const body = read instanceof Response ? null : read.body, size = Array.isArray(body) ? body.length : 1;
  if (size > LIMITS.batch) return Response.json(fail(null, -32600, `A batch may hold at most ${LIMITS.batch} messages.`), { status: 400 });
  const refused = admit(req, Math.max(1, size));
  if (refused) return refused;
  if (read instanceof Response) return read;
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
