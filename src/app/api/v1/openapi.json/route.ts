// OpenAPI description of the REST tools, generated from the same definitions the MCP endpoint uses.
import { INSTRUCTIONS, TOOLS } from "@/lib/ai";
import { keysRequired } from "@/lib/auth";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const base = process.env.HEXBRAIN_PUBLIC_URL || new URL(req.url).origin;
  const paths: Record<string, unknown> = {};
  for (const t of TOOLS) {
    const short = t.name.replace("hexbrain_", "");
    paths[`/api/v1/${short}`] = {
      post: {
        operationId: short, summary: t.title, description: t.description,
        requestBody: { required: true, content: { "application/json": { schema: t.inputSchema } } },
        responses: {
          "200": { description: "Result", content: { "application/json": { schema: { type: "object", additionalProperties: true } } } },
          "400": { description: "The request was not valid; the `error` field says how to fix it." },
        },
      },
    };
  }
  return Response.json({
    openapi: "3.1.0",
    info: { title: SITE.name, version: "0.1.0", description: INSTRUCTIONS },
    servers: [{ url: base }],
    paths,
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    ...(keysRequired() ? { security: [{ bearer: [] }] } : {}),
  });
}
