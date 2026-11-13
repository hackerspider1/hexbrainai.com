// Checks sign-in, accounts and API keys against a copy of the app started with Google sign-in switched on.
// It cannot sign in through Google itself, so it creates a test account directly and drives the rest in a real browser.
//   node tests/auth.mjs      (starts its own server on port 3211 and stops it afterwards)
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), ".."), BASE = "http://localhost:3211", PORT = 9349;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [], check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 240) });
const server = spawn("pnpm", ["exec", "next", "dev", "--port", "3211"], { cwd: root, stdio: "ignore", detached: true,
  env: { ...process.env, GOOGLE_CLIENT_ID: "test-client.apps.example", GOOGLE_CLIENT_SECRET: "test-secret", HEXBRAIN_PUBLIC_URL: BASE, NEXT_DIST_DIR: ".next-auth-test", HEXBRAIN_OPEN_API: "", HEXBRAIN_API_KEY: "", HEXBRAIN_INVITE_ONLY: "true", HEXBRAIN_ADMINS: "admin@example.com" } });
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "vg-auth-"))}`, "--no-first-run", "--no-default-browser-check", "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
const db = new DatabaseSync(process.env.HEXBRAIN_DB || join(root, "data", "hexbrain.db")); // the server started below reads the same file
db.exec("PRAGMA busy_timeout = 4000;");
const sub = "test-" + randomBytes(6).toString("hex"), session = randomBytes(32).toString("base64url");
let userId = 0, adminId = 0, ws, seq = 0; const pending = new Map(), errors = [];
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const go = async (path) => { await send("Page.navigate", { url: BASE + path }); await sleep(3500); };
const get = (path, headers = {}) => fetch(BASE + path, { headers, redirect: "manual" });

try {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(BASE + "/about")).ok) break; } catch { /* starting */ } await sleep(1000); }

  // Signing in
  let r = await get("/auth/google"), loc = r.headers.get("location") || "";
  check("sign-in: sends the visitor to Google with this site's details", r.status >= 300 && r.status < 400 && loc.startsWith("https://accounts.google.com/") && loc.includes("client_id=test-client.apps.example") && loc.includes(encodeURIComponent(BASE + "/auth/google/callback")), loc.slice(0, 200));
  check("sign-in: remembers the request in a cookie scripts cannot read", /oauth=[^;]+;.*HttpOnly/i.test(r.headers.get("set-cookie") || ""), r.headers.get("set-cookie"));
  r = await get("/auth/google/callback?state=forged&code=abc", { cookie: "oauth=real.nonce" });
  check("sign-in: a reply that does not match the request is refused", (r.headers.get("location") || "").endsWith("/account?error=state"), r.headers.get("location"));
  r = await get("/auth/google/callback?error=access_denied");
  check("sign-in: cancelling at Google comes back with a clear message", (r.headers.get("location") || "").endsWith("/account?error=cancelled"));
  check("account page, signed out: offers Google sign-in", /Continue with Google/.test(await (await get("/account")).text()));

  // The API without a key
  r = await get("/api/v1/list_classes");
  check("API: refused without a key, with directions", r.status === 401 && /account/.test((await r.json()).error || ""));
  r = await fetch(BASE + "/api/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  check("API (MCP): refused without a key", r.status === 401);
  check("API: a made-up key is refused", (await get("/api/v1/list_classes", { authorization: "Bearer sk_not-a-real-key" })).status === 401);
  check("the map itself still needs no account", (await get("/")).status === 200 && (await get("/api/reports?q=ssrf&limit=1")).status === 200);

  // A signed-in person
  db.prepare("INSERT INTO users (sub, email, name, created_at) VALUES (?,?,?,?)").run(sub, "tester@example.com", "Test Person", new Date().toISOString());
  userId = db.prepare("SELECT id FROM users WHERE sub = ?").get(sub).id;
  db.prepare("INSERT INTO sessions (hash, user_id, expires_at) VALUES (?,?,?)").run(createHash("sha256").update(session).digest("hex"), userId, Date.now() + 3600e3);
  for (let i = 0; i < 40 && !ws; i++) { try { const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); if (page) ws = new WebSocket(page.webSocketDebuggerUrl); } catch { await sleep(250); } }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown") errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
    else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300)); };
  for (const d of ["Runtime", "Page", "Network"]) await send(d + ".enable");
  await send("Network.setCookie", { name: "session", value: session, url: BASE, httpOnly: true });
  await go("/account");
  const closed = await ev("document.querySelector('main').innerText");
  check("invite only: someone not invited sees why and cannot create a key", /API access is by invitation/.test(closed) && !/Create API key/.test(closed) && !/Invitations/.test(closed), closed.slice(0, 200));
  db.prepare("INSERT OR REPLACE INTO invites (email, added_by, created_at) VALUES (?,?,?)").run("tester@example.com", "test", new Date().toISOString());
  await go("/account");
  const page = await ev("document.querySelector('main').innerText");
  check("account page: shows the profile", /Test Person/.test(page) && /tester@example\.com/.test(page) && /API keys/.test(page), page.slice(0, 200));
  await ev("(() => { const i = document.querySelector('input[name=name]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'laptop'); i.dispatchEvent(new Event('input', { bubbles: true })); [...document.querySelectorAll('button')].find(b => b.textContent === 'Create API key').click(); })()");
  for (let i = 0; i < 20 && !(await ev("!!document.querySelector('#new-key')")); i++) await sleep(500);
  const key = (await ev("document.querySelector('#new-key')?.textContent")) || "";
  check("account page: creating a key shows it once", /^sk_[\w-]{30,}$/.test(key || ""), key);
  check("account page: the new key is listed by name, not in full", await ev("(() => { const t = document.querySelector('main').innerText; return /laptop/.test(t) && /0 requests/.test(t); })()"));
  check("the database holds only a hash of the key", !db.prepare("SELECT hash, prefix FROM api_keys WHERE user_id = ?").all(userId).some((k) => k.hash === key || key.startsWith(k.hash)) && db.prepare("SELECT COUNT(*) n FROM api_keys WHERE user_id = ?").get(userId).n === 1);
  r = await get("/api/v1/list_classes", { authorization: "Bearer " + key });
  check("API: works with the new key", r.status === 200 && (await r.json()).classes?.length > 5);
  r = await fetch(BASE + "/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  db.prepare("DELETE FROM invites WHERE email = ?").run("tester@example.com");
  check("invite only: withdrawing the invitation stops the key at once", (await get("/api/v1/list_classes", { authorization: "Bearer " + key })).status === 401);
  db.prepare("INSERT OR REPLACE INTO invites (email, added_by, created_at) VALUES (?,?,?)").run("tester@example.com", "test", new Date().toISOString());
  check("API (MCP): works with the new key", r.status === 200 && (await r.json()).result?.tools?.length === 11);
  await go("/account");
  check("account page: counts the key's requests", /2 requests/.test(await ev("document.querySelector('main').innerText")));
  // Limits that stop the API being abused
  const mcp = (body, k = key) => fetch(BASE + "/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", authorization: "Bearer " + k }, body: typeof body === "string" ? body : JSON.stringify(body) });
  const ping = (n) => Array.from({ length: n }, (_, i) => ({ jsonrpc: "2.0", id: i + 1, method: "ping" }));
  check("limits: an oversized batch is refused", (await mcp(ping(11))).status === 400);
  r = await mcp(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(70000) } }));
  check("limits: an oversized request body is refused", r.status === 413, r.status);
  r = await fetch(BASE + "/api/v1/search_reports", { method: "POST", headers: { "Content-Type": "application/json", authorization: "Bearer " + key }, body: JSON.stringify({ query: "x".repeat(70000) }) });
  check("limits: the same on the REST door", r.status === 413, r.status);
  let last = 200; for (let i = 0; i < 8 && last === 200; i++) last = (await mcp(ping(10))).status;
  r = await mcp(ping(10));
  check("limits: a batch counts as one request per message", last === 200 && r.status === 429 && Number(r.headers.get("retry-after")) > 0, last + " " + r.status);
  const second = "sk_" + randomBytes(24).toString("base64url");
  db.prepare("INSERT INTO api_keys (user_id, name, prefix, hash, created_at) VALUES (?,?,?,?,?)").run(userId, "second", second.slice(0, 7), createHash("sha256").update(second).digest("hex"), new Date().toISOString());
  check("limits: a second key on the same account shares the limit", (await get("/api/v1/list_classes", { authorization: "Bearer " + second })).status === 429);
  db.prepare("DELETE FROM api_keys WHERE hash = ?").run(createHash("sha256").update(second).digest("hex"));
  r = await get("/about", { "x-forwarded-for": "203.0.113.9, 127.0.0.1" });
  check("limits: pages still load for an ordinary visitor", r.status === 200);
  await go("/");
  check("home: header shows the account, not Sign in", await ev("!!document.querySelector('header a[aria-label=\"Your account\"]')"));
  await ev("document.querySelector('header button[class*=primary]').click()"); await sleep(500);
  check("Connect AI: tells a signed-in person where to get a key", /Create one on your account page/.test(await ev("document.querySelector('[role=dialog]')?.innerText") || ""));
  await go("/account");
  await ev("[...document.querySelectorAll('button')].find(b => b.textContent === 'Revoke').click()"); await sleep(2000);
  check("API: a revoked key stops working", (await get("/api/v1/list_classes", { authorization: "Bearer " + key })).status === 401);
  await ev("[...document.querySelectorAll('button')].find(b => b.textContent === 'Sign out').click()"); await sleep(2500);
  check("sign out: ends the session on the server too", db.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = ?").get(userId).n === 0 && /Continue with Google/.test(await (await get("/account", { cookie: "session=" + session })).text()));

  // An admin manages invitations on the account page
  const adminSub = "test-admin-" + randomBytes(6).toString("hex"), adminSession = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO users (sub, email, name, created_at) VALUES (?,?,?,?)").run(adminSub, "admin@example.com", "Admin Person", new Date().toISOString());
  adminId = db.prepare("SELECT id FROM users WHERE sub = ?").get(adminSub).id;
  db.prepare("INSERT INTO sessions (hash, user_id, expires_at) VALUES (?,?,?)").run(createHash("sha256").update(adminSession).digest("hex"), adminId, Date.now() + 3600e3);
  db.prepare("DELETE FROM invites WHERE email = 'tester@example.com'").run(); // back on the waiting list
  await send("Network.setCookie", { name: "session", value: adminSession, url: BASE, httpOnly: true });
  await go("/account");
  check("invitations: an admin sees who has signed in and is waiting", await ev("/Signed in and waiting/.test(document.querySelector('main').innerText) && !![...document.querySelectorAll('main form')].find((f) => f.querySelector('input[name=emails][value=\"tester@example.com\"]'))"));
  await ev("[...document.querySelectorAll('main form')].find((f) => f.querySelector('input[name=emails][value=\"tester@example.com\"]')).querySelector('button').click()"); await sleep(2500);
  check("invitations: approving someone waiting invites them", !!db.prepare("SELECT 1 FROM invites WHERE email = 'tester@example.com'").get());
  check("invitations: an admin sees the list and can create keys without an invitation", await ev("(() => { const t = document.querySelector('main').innerText; return /Invitations/.test(t) && /Create API key/.test(t); })()"));
  await ev("(() => { const i = document.querySelector('input[name=emails]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'Friend@Example.com, not-an-email'); i.dispatchEvent(new Event('input', { bubbles: true })); [...document.querySelectorAll('button')].find(b => b.textContent === 'Invite').click(); })()");
  await sleep(2500);
  const invited = db.prepare("SELECT email FROM invites WHERE added_by = 'admin@example.com' AND email != 'tester@example.com'").all().map((r) => r.email);
  check("invitations: adding one stores the address in lower case and skips what is not an address", invited.length === 1 && invited[0] === "friend@example.com", invited.join(","));
  check("invitations: the new address is listed", /friend@example\.com/.test(await ev("document.querySelector('main').innerText")));
  await ev("[...document.querySelectorAll('form')].find(f => f.querySelector('input[name=email][value=\"friend@example.com\"]')).querySelector('button').click()"); await sleep(2500);
  check("invitations: removing one takes it off the list", !db.prepare("SELECT 1 FROM invites WHERE email = 'friend@example.com'").get());
} catch (e) {
  check("test run completed", false, e.stack || e);
} finally {
  db.prepare("DELETE FROM invites WHERE email IN ('tester@example.com', 'friend@example.com')").run();
  if (adminId) { for (const t of ["api_keys", "sessions"]) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(adminId); db.prepare("DELETE FROM users WHERE id = ?").run(adminId); }
  if (userId) { for (const t of ["api_keys", "sessions"]) db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId); db.prepare("DELETE FROM users WHERE id = ?").run(userId); }
  chrome.kill(); try { process.kill(-server.pid); } catch { /* already gone */ }
  await sleep(500); rmSync(join(root, ".next-auth-test"), { recursive: true, force: true });
}
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" || "));
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : "  -> " + r.detail}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
process.exit(0);
