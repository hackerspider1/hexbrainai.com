// Hits every kind of route and every AI tool with ordinary and odd input, and reports status, time and size.
//   node tests/probe.mjs            (BASE=http://localhost:3210; HEXBRAIN_DB=<the file the server reads> if not data/hexbrain.db)
// It makes one temporary account and API key and removes them afterwards. Anything marked BAD or SLOW needs a look.
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://localhost:3210", SLOW = Number(process.env.SLOW || 400);
const db = new DatabaseSync(process.env.HEXBRAIN_DB || join(dirname(fileURLToPath(import.meta.url)), "..", "data", "hexbrain.db")); db.exec("PRAGMA busy_timeout = 8000;");
const email = `probe-${randomBytes(5).toString("hex")}@example.com`, key = "sk_" + randomBytes(24).toString("base64url");
db.prepare("INSERT INTO users (sub, email, name, created_at) VALUES (?,?,?,?)").run(email, email, "Probe", new Date().toISOString());
const uid = db.prepare("SELECT id FROM users WHERE email = ?").get(email).id;
db.prepare("INSERT OR IGNORE INTO invites (email, added_by, created_at) VALUES (?,?,?)").run(email, "probe", new Date().toISOString());
db.prepare("INSERT INTO api_keys (user_id, name, prefix, hash, created_at) VALUES (?,?,?,?,?)").run(uid, "probe", key.slice(0, 9), createHash("sha256").update(key).digest("hex"), new Date().toISOString());
const out = []; let bad = 0, slow = 0;
const hit = async (label, path, expect, opts = {}) => {
  const t = performance.now();
  try {
    const r = await fetch(BASE + path, { redirect: "manual", ...opts, headers: { ...(opts.auth ? { authorization: "Bearer " + key } : {}), ...(opts.headers || {}) } });
    const body = await r.text(), ms = Math.round(performance.now() - t), ok = [].concat(expect).includes(r.status), late = ms > (opts.slow ?? SLOW);
    if (!ok) bad++; if (ok && late) slow++;
    out.push(`${!ok ? "BAD " : late ? "SLOW" : "ok  "} ${r.status} ${String(ms).padStart(5)}ms ${String(body.length).padStart(8)}b  ${label}${ok ? "" : "  -> expected " + expect + " :: " + body.slice(0, 160).replace(/\s+/g, " ")}`);
    return { r, body };
  } catch (e) { bad++; out.push(`BAD  ERR  ${label} ${e.message}`); return {}; }
};
const rpc = (method, params) => ({ method: "POST", auth: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
try {
  await fetch(BASE + "/"); await fetch(BASE + "/api/graph"); // warm the caches, so timings are of a running site
  for (const p of ["/", "/?view=programs", "/?view=cves", "/browse", "/about", "/privacy", "/terms", "/account", "/cves", "/bypasses", "/payloads", "/class/xss", "/class/xss?status=valid", "/program/Shopify", "/program/IBM",
    "/report/826097", "/cve/CVE-2021-44228", "/cve/CVE-2020-0001", "/bypasses/waf", "/payloads/XSS%20Injection", "/sitemap.xml", "/robots.txt", "/manifest.webmanifest", "/opengraph-image", "/icon", "/.well-known/security.txt"]) await hit("page " + p, p, 200, { slow: 900 });
  for (const [p, e] of [["/report/abc", 404], ["/report/-1", 404], ["/report/1.5", 404], ["/report/99999999999999999999", 404], ["/class/nope", 404], ["/program/No%20Such", 404], ["/program/100%25", 404], ["/cve/not-a-cve", 404], ["/cve/CVE-1900-1", 404],
    ["/payloads/nope", 404], ["/bypasses/nope", 404], ["/nope", 404], ["/class/xss?status=%27", 200], ["/account?error=__proto__", 200]]) await hit("odd  " + p, p, e);
  const core = await (await fetch(BASE + "/api/cve-core")).json(), one = core.find((c) => c[3] > 0) || core[0];
  for (const [p, e] of [["/api/graph", 200], ["/api/reports?q=ssrf&limit=5", 200], ["/api/reports?limit=2.5&offset=1e400", 200], ["/api/reports?q=%22%22%22%20OR%20NEAR(&sort=zzz", 200], ["/api/reports?q=" + "a".repeat(5000), 200], ["/api/reports?class=NOPE&status=zzz", 200],
    ["/api/leaves?weakness=" + encodeURIComponent("SQL Injection"), 200], ["/api/leaves?program=Shopify&class=XSS", 200], ["/api/leaves?program=nope&class=zzz", 200], ["/api/program-dots?program=Shopify", 200], ["/api/program-dots?program=nope", 200],
    ["/api/cve-core", 200], [`/api/cve-band?year=${one[2]}&month=${one[3]}&band=0`, 200], [`/api/cve-band?year=${one[2]}&month=${one[3]}&band=4&limit=1500`, 200], [`/api/cve-band?year=${one[2]}&month=${one[3]}&band=4&q=wordpress`, 200], ["/api/cve-band?year=abc&month=99&band=9", 200], ["/api/cve-band?year=2024&month=1.5&band=0&limit=1e9&offset=-3&q=%25%25", 200],
    ["/api/cve-find?q=CVE-2021-4422", 200], ["/api/cve-find?q=hashicorp%20vault", 200], ["/api/cve-find?q=%22%22(*%20NEAR", 200], ["/api/cve-find?q=" + "z".repeat(4000), 200],
    ["/api/subdomains?program=GitHub&q=api", 200], ["/api/subdomains?program=IBM", 200], ["/api/subdomains?program=IBM&q=.*%5B&suffix=..%2F..%2Fetc&offset=-4&limit=1e9", 200], ["/api/subdomains/download?program=GitLab&suffix=gitter.im", 200], ["/api/subdomains/download?program=..%2F..%2Fetc%2Fpasswd", 404], ["/api/subdomains/download?program=GitLab&suffix=nope.example", 404]]) await hit("api  " + p.slice(0, 84), p, e);
  await hit("ai without key", "/api/v1/list_classes", 401); await hit("ai bad key", "/api/v1/list_classes", 401, { headers: { authorization: "Bearer sk_nope" } }); await hit("openapi", "/api/v1/openapi.json", 200);
  const tools = [["list_classes", {}], ["search_reports", { query: "oauth redirect_uri", limit: 5 }], ["search_reports", { query: "account takeover via password reset token leak in referer header", search_writeups: true }], ["search_reports", { topic: "ssrf", status: "valid", min_severity: "high", sort: "bounty" }], ["search_reports", { status: "bogus" }, 200, true],
    ["get_report", { id: 826097 }], ["get_report", { id: "abc" }, 200, true], ["get_testing_playbook", { topic: "ssrf" }], ["get_testing_playbook", { topic: "idor", program: "Shopify" }], ["get_program_history", { program: "Shopify" }], ["get_program_history", { program: "%%" }, 200, true],
    ["get_attack_surface", { program: "GitHub", contains: "admin" }], ["get_attack_surface", { program: "IBM", domain: "cloud.ibm.com", limit: 300 }], ["get_attack_surface", { program: "Sheer" }, 200, true],
    ["find_bypasses", { protection: "waf", topic: "xss" }], ["find_bypasses", { blocked_by: "<script> is stripped", topic: "xss" }], ["find_payloads", { need: "ssti jinja2 sandbox escape" }], ["find_payloads", { topic: "SQL Injection" }],
    ["plan_tests", { feature: "password reset by email with a token in the link" }], ["plan_tests", { feature: "file upload of profile pictures with image resizing", program: "Shopify" }],
    ["find_cves", { technologies: ["apache 2.4.49", "grafana 8.3.0", "wordpress 5.8", "jira 8.13", "hashicorp vault 1.19"] }], ["find_cves", { technologies: ["1".repeat(60000) + "x"] }], ["find_cves", { technologies: ["some product nobody has heard of 9.9"] }],
    ["get_cve", { id: "CVE-2021-41773" }], ["get_cve", { id: one[0] }], ["get_cve", { id: "CVE-2026-128100" }], ["get_cve", { id: "nope" }, 200, true]];
  for (const [t, args, , wantErr] of tools) {
    const { body } = await hit(`tool ${t} ${JSON.stringify(args).slice(0, 70)}`, "/api/mcp", 200, rpc("tools/call", { name: "hexbrain_" + t, arguments: args }));
    let j; try { j = JSON.parse(body); } catch { j = null; }
    const res = j?.result, text = res?.content?.[0]?.text || "";
    if (!res || !!res.isError !== !!wantErr || (!wantErr && (!text || !res.structuredContent))) { bad++; out.push(`BAD       ^ ${wantErr ? "expected a tool error" : "expected text and structured content"}: ${(text || body || "").slice(0, 160).replace(/\s+/g, " ")}`); }
  }
  for (const [label, body, e] of [["initialize", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, 200], ["tools/list", { jsonrpc: "2.0", id: 2, method: "tools/list" }, 200], ["ping", { jsonrpc: "2.0", id: 3, method: "ping" }, 200],
    ["prompts/list", { jsonrpc: "2.0", id: 8, method: "prompts/list" }, 200], ["prompts/get", { jsonrpc: "2.0", id: 9, method: "prompts/get", params: { name: "hunt_program", arguments: { program: "Shopify" } } }, 200],
    ["notification (no id)", { jsonrpc: "2.0", method: "notifications/initialized" }, 202], ["unknown method", { jsonrpc: "2.0", id: 4, method: "nope" }, 200], ["unknown tool", { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope" } }, 200],
    ["wrong argument types", { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "hexbrain_search_reports", arguments: { query: { a: 1 }, limit: [9], topic: 5 } } }, 200], ["arguments is a string", { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "hexbrain_get_report", arguments: "x" } }, 200],
    ["body null", null, 200], ["batch with junk", [null, 5, "x"], 200], ["batch of 3", [1, 2, 3].map((id) => ({ jsonrpc: "2.0", id, method: "ping" })), 200], ["batch of 11", Array.from({ length: 11 }, (_, id) => ({ jsonrpc: "2.0", id, method: "ping" })), 400]])
    await hit("mcp  " + label, "/api/mcp", e, { method: "POST", auth: true, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  await hit("mcp  not json", "/api/mcp", 400, { method: "POST", auth: true, headers: { "content-type": "application/json" }, body: "{nope" });
  await hit("mcp  GET", "/api/mcp", 405);
  await hit("rest GET with a query", "/api/v1/search_reports?query=ssrf&limit=2", 200, { auth: true });
  await hit("rest POST", "/api/v1/get_cve", 200, { method: "POST", auth: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ id: "CVE-2021-44228" }) });
  await hit("rest unknown tool", "/api/v1/nope", 404, { auth: true });
} finally {
  db.prepare("DELETE FROM api_keys WHERE user_id = ?").run(uid); db.prepare("DELETE FROM invites WHERE email = ?").run(email); db.prepare("DELETE FROM users WHERE id = ?").run(uid);
}
console.log(out.join("\n"));
console.log(`\n${out.length} checks: ${bad} bad, ${slow} slow (over ${SLOW} ms)`);
process.exit(bad ? 1 : 0);
