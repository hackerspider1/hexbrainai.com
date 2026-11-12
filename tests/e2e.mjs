// Drives the running app in headless Chrome with real mouse and keyboard events and reports what works.
//   pnpm dev --port 3210   (in another terminal)
//   node tests/e2e.mjs [screenshot folder]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3210";
const OUT = process.argv[2] || mkdtempSync(join(tmpdir(), "vg-shots-"));
mkdirSync(OUT, { recursive: true });
const PORT = 9347;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "vg-"))}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1440,900", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });

let ws, seq = 0, speed; const pending = new Map(), errors = [], results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 220) }); };
const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const settle = async (extra = 300) => { for (let i = 0; i < 70; i++) { if (await ev("window.__vg?.state().settled")) break; await sleep(100); } await sleep(extra); };
const go = async (path, wait = 3500) => { await send("Page.navigate", { url: BASE + path }); await sleep(wait); await settle(); };
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
const hover = async (x, y) => { await mouse("mouseMoved", x, y, { button: "none" }); await sleep(260); };
const click = async (x, y) => { await hover(x, y); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await sleep(220); };
const key = async (k, code = k) => { await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, text: k.length === 1 ? k : undefined }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code }); await sleep(220); };
const type = async (t) => { await send("Input.insertText", { text: t }); await sleep(900); };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, name + ".png"), Buffer.from(r.result.data, "base64")); };
const at = (kind, ...args) => ev(`window.__vg.${kind}(${args.map((a) => JSON.stringify(a)).join(",")})`); // where a part of the map is on screen
const labels = () => ev(`[...document.querySelectorAll('svg text')].filter(t => +t.getAttribute('opacity') > 0.05).map(t => ({t: t.textContent, x: +t.getAttribute('x'), y: +t.getAttribute('y'), a: t.getAttribute('text-anchor'), fill: t.getAttribute('fill'), px: +t.getAttribute('font-size'), w: t.getComputedTextLength()}))`);
const hot = (l) => l.fill.includes("255,106,61");
const box = (l) => { const x0 = l.a === "middle" ? l.x - l.w / 2 : l.a === "end" ? l.x - l.w : l.x; return [x0, l.y - l.px * 0.8, x0 + l.w, l.y + 2]; };
let pairs = [];
const overlaps = (list) => { pairs = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = box(list[i]), b = box(list[j]); if (a[0] < b[2] - 2 && a[2] > b[0] + 2 && a[1] < b[3] - 1.5 && a[3] > b[1] + 1.5) pairs.push(`"${list[i].t}" x "${list[j].t}"`); } return pairs.length; };
const search = () => ev("decodeURIComponent(location.search.replace(/\\+/g, ' '))");
const crumbs = () => ev("document.querySelector('nav')?.innerText.replace(/\\s+/g,' ').trim()");
const panel = () => ev("(() => { const a = document.querySelector('aside'); return a && a.getAttribute('aria-hidden') === 'false' ? a.innerText.replace(/\\s+/g,' ').slice(0, 320) : null; })()");
const clickDom = (sel, nth = 0) => ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})][${nth}]; if (!e) return false; e.click(); return true; })()`);
const clickText = (sel, text) => ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(text)})); if (!e) return false; e.click(); return true; })()`);
const rows = () => ev("document.querySelectorAll('aside a[href^=\"/report/\"]').length");
const fps = () => ev("new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 1500 ? requestAnimationFrame(f) : r(Math.round(n / 1.5)); }; requestAnimationFrame(f); })");
const STORED = "Cross-site Scripting (XSS) - Stored";

try {
  for (let i = 0; i < 40 && !ws; i++) {
    try { const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); if (page) ws = new WebSocket(page.webSocketDebuggerUrl); } catch { await sleep(250); }
  }
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown") errors.push("exception: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
    else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console.error: " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push("log: " + m.params.entry.text.slice(0, 300) + " " + (m.params.entry.url || ""));
  };
  for (const d of ["Runtime", "Page", "Log"]) await send(d + ".enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // 1. Overview: the dial
  await go("/", 4500);
  const total = Number(await ev("[...document.querySelectorAll('button')].find(b => b.querySelector('span')?.textContent === 'programs')?.querySelector('b').textContent.replace(/,/g,'')"));
  let L = await labels();
  const classNames = L.filter((l) => l.px === 12.5);
  check("overview: every class is named round the dial", classNames.length === 18, classNames.length + " class names");
  check("overview: no overlapping labels", overlaps(L) === 0, pairs.join(" ; "));
  check("overview: labels inside the window", L.every((l) => box(l)[0] > 0 && box(l)[2] < 1440 && l.y > 60 && l.y < 900));
  const corner = await ev("['section', 'div[class*=stats]'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })");
  const under = L.filter((l) => corner.some((r) => box(l)[0] < r[2] && box(l)[2] > r[0] && box(l)[1] < r[3] && box(l)[3] > r[1]));
  check("overview: no map label runs under the corner text", under.length === 0, under.map((l) => l.t).join(" ; "));
  speed = { overview: await fps() };
  await shot("1-overview");

  // 2. Hovering and opening a class
  let p = await at("cls", "SQLI");
  await hover(p[0], p[1]);
  L = await labels();
  check("hover class: its name turns orange", L.some((l) => l.t === "SQL Injection" && hot(l)));
  check("hover class: linked classes say how many reports they share", L.some((l) => /shared with SQL Injection/.test(l.t)), L.filter((l) => /shared/.test(l.t)).length + " linked");
  check("hover class: cursor is a pointer", (await ev("document.querySelector('canvas').style.cursor")) === "pointer");
  await shot("2-hover-class");
  await click(p[0], p[1]); await settle(600);
  check("click class: opens it", (await search()) === "?class=SQLI" && /SQL Injection/.test(await crumbs() || ""), await search());
  check("click class: panel lists its weaknesses", /Weaknesses in this class/.test(await panel() || ""), await panel());
  check("click class: the dial turned it to the left", Math.abs(((await at("cls", "SQLI"))[1]) - 460) < 140 && (await at("weak", "SQL Injection"))[0] < (await at("cls", "SQLI"))[0]);
  await go("/?class=XSS", 4000);
  L = await labels();
  const wl = L.filter((l) => /^W-\d+\.\d+ /.test(l.t));
  check("class view: every weakness is named beside its strip", wl.length === 7, wl.length + " of 7");
  check("class view: no overlapping labels", overlaps(L) === 0, pairs.join(" ; "));
  speed.classOpen = await fps();
  await shot("3-class");

  // 3. Hovering and opening a weakness
  p = await at("weak", STORED);
  await hover(p[0], p[1]);
  check("hover strip: its name highlights", (await ev("window.__vg.state().hover")) === "w" + STORED && (await labels()).some((l) => l.t === STORED));
  await click(p[0], p[1]); await settle(1500);
  check("click strip: opens the weakness", (await search()).includes("weakness=" + STORED), await search());
  L = await labels();
  const cols = L.filter((l) => /^#\d+/.test(l.t));
  check("weakness view: report names in two columns", cols.length >= 16 && new Set(cols.map((l) => l.a)).size === 2, cols.length + " names");
  check("weakness view: no overlapping labels", overlaps(L) === 0, pairs.join(" ; "));
  check("weakness view: side list loaded", (await rows()) >= 10, (await rows()) + " rows");
  speed.weaknessOpen = await fps();
  await shot("4-weakness");
  const first = cols[0], nameY = first.y + 13, nameX = first.a === "end" ? first.x - 30 : first.x + 30;
  await hover(nameX, nameY);
  check("hover report name: highlights", (await labels()).some((l) => l.t === first.t && hot(l)));
  await click(nameX, nameY); await sleep(900);
  check("click report name: shows its card", /Read the full report/.test(await panel() || ""), await panel());
  const href = await ev("document.querySelector('aside a[href^=\"/report/\"]')?.getAttribute('href')");
  const rp = href ? await fetch(BASE + href) : null;
  check("report card: link opens a real report page", rp && rp.status === 200, href + " " + rp?.status);
  check("report card: opens in a new tab", (await ev("document.querySelector('aside a[href^=\"/report/\"]')?.target")) === "_blank");
  await key("Escape"); await sleep(500);
  check("Esc from report: back to the weakness", /weakness=/.test(await search()) && !/Read the full report/.test(await panel() || ""));
  p = await at("leaf", STORED, 300);
  await click(p[0], p[1]); await sleep(700);
  check("click a dot: opens that report's card", /Read the full report/.test(await panel() || ""), await panel());
  await key("Escape"); await sleep(500);

  // 4. Paging the names, sorting and loading more
  const before = (await labels()).filter((l) => /^#\d+/.test(l.t)).map((l) => l.t).join("|");
  await clickText("aside button", "Next names"); await sleep(700);
  const after = (await labels()).filter((l) => /^#\d+/.test(l.t)).map((l) => l.t).join("|");
  check("Next names: columns show different reports", after && after !== before);
  await clickText("aside button", "Biggest bounty"); await sleep(900);
  check("sort by bounty: list reloads", (await ev("document.querySelector('aside button[aria-pressed=\"true\"]')?.textContent")) === "Biggest bounty" && (await rows()) > 5);
  const n1 = await rows(); await clickText("aside button", "Show more"); await sleep(1000);
  check("Show more: adds rows", (await rows()) > n1, `${n1} -> ${await rows()}`);

  // 5. Zoom, drag, stepping out
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 500, y: 450, deltaX: 0, deltaY: -400 }); await sleep(900);
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 500, y: 450, deltaX: 0, deltaY: 900 }); await sleep(900);
  await mouse("mouseMoved", 300, 820, { button: "none" }); await mouse("mousePressed", 300, 820);
  for (let i = 1; i <= 6; i++) await mouse("mouseMoved", 300 + i * 25, 820 - i * 10);
  await mouse("mouseReleased", 450, 760); await sleep(400);
  check("zoom and drag: view survives, focus kept", /weakness=/.test(await search()));
  await key("Escape"); await sleep(400); await key("Escape"); await settle(600);
  check("Esc twice: back to overview", (await search()) === "" && (await panel()) === null, await search());
  check("overview restored: intro text visible", (await ev("getComputedStyle(document.querySelector('section')).opacity")) === "1");

  // 6. Programs view, and a program's footprint on the dial
  await clickText("nav button", "Programs"); await settle(900);
  check("Programs view: opens from the switch", (await search()) === "?view=programs", await search());
  L = await labels();
  const named = L.filter((l) => l.t.length > 2 && !/ reports?$/.test(l.t) && !/^x -?\d/.test(l.t)).length;
  check("Programs view: programs are named round the dial", named >= 30, named + " names visible");
  check("Programs view: no overlapping labels", overlaps(L) === 0, pairs.join(" ; "));
  speed.programs = await fps();
  await shot("5-programs");
  p = await at("prog", "Shopify");
  await hover(p[0], p[1]);
  check("Programs view: hovering a bubble highlights it", (await labels()).some((l) => l.t === "Shopify" && hot(l)));
  await click(p[0], p[1]); await settle(600);
  check("Programs view: clicking a bubble opens the program", (await search()).includes("program=Shopify") && /What gets reported here/.test(await panel() || ""), await search());
  check("program panel: logo shown", await ev("!!document.querySelector('aside h2 img') && document.querySelector('aside h2 img').naturalWidth > 0"));
  check("program panel: reports listed", (await rows()) > 5);
  await clickText("aside button", "vulnerability map"); await settle(1200);
  L = await labels();
  check("program on the dial: stays open, switches view", (await search()) === "?program=Shopify", await search());
  check("program on the dial: each class says how many reports are its", L.filter((l) => /^\d[\d,]* from Shopify$/.test(l.t)).length >= 10, L.filter((l) => /from Shopify/.test(l.t)).length + " classes");
  check("program on the dial: panel counts the marks", /467 orange marks/.test(await panel() || ""), (await panel() || "").slice(0, 200));
  await shot("6-program-on-dial");
  await clickDom("aside button[class*=row]", 0); await settle(600);
  check("program panel: clicking a class opens it", /class=/.test(await search()) && !/program=/.test(await search()), await search());
  await clickDom("header button", 0); await settle(500);
  check("Back button: steps out", (await search()) === "");

  // 6b. The arcs of program logos beside the dial
  let orb = await at("orbit");
  check("side arcs: program logos on both sides of the dial", orb.length >= 8 && orb.some((o) => o[1] < 400) && orb.some((o) => o[1] > 1040), orb.length + " logos");
  await sleep(1500);
  const orb2 = await at("orbit"), same = orb2.find((o) => o[0] === orb[0][0]);
  check("side arcs: logos drift along the arc", !same || Math.hypot(same[1] - orb[0][1], same[2] - orb[0][2]) > 0.5);
  orb = await at("orbit"); const pickO = orb[Math.floor(orb.length / 2)];
  await hover(pickO[1], pickO[2]);
  const held = await at("orbit"), heldSame = held.find((o) => o[0] === pickO[0]);
  await sleep(700);
  const held2 = (await at("orbit")).find((o) => o[0] === pickO[0]);
  check("side arcs: drift pauses under the cursor and the logo is named", heldSame && held2 && Math.hypot(held2[1] - heldSame[1], held2[2] - heldSame[2]) < 0.2 && (await labels()).some((l) => l.t === pickO[0] && hot(l)), pickO[0]);
  await click(held2[1], held2[2]); await settle(900);
  check("side arcs: clicking a logo marks that program on the dial", (await search()) === "?program=" + pickO[0] && (await labels()).some((l) => l.t.endsWith("from " + pickO[0].slice(0, 19)) || /from /.test(l.t)), await search());
  await key("Escape"); await settle(500);

  // 7. Full lists behind the counters
  await clickText("button", "programs"); await sleep(600);
  check("programs counter: lists every program", (await ev("document.querySelectorAll('aside button').length")) === total, `${await ev("document.querySelectorAll('aside button').length")} rows for ${total}`);
  await ev("(() => { const i = document.querySelector('aside input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'shop'); i.dispatchEvent(new Event('input', { bubbles: true })); })()"); await sleep(400);
  const filtered = await ev("[...document.querySelectorAll('aside button')].map(b => b.innerText.replace(/\\s+/g,' ')).join(' | ')");
  check("programs list: filter narrows it", /Shopify/.test(filtered || "") && (filtered || "").split("|").length < 10, filtered);
  await clickDom("aside button", 0); await settle(600);
  check("programs list: clicking a row opens that program", /program=/.test(await search()), await search());
  await key("Escape"); await settle(500);
  await clickText("button", "weaknesses"); await sleep(600);
  const wTotal = Number(await ev("[...document.querySelectorAll('button')].find(b => b.querySelector('span')?.textContent === 'weaknesses')?.querySelector('b').textContent"));
  check("weaknesses counter: lists every weakness", (await ev("document.querySelectorAll('aside button').length")) === wTotal, `${await ev("document.querySelectorAll('aside button').length")} rows for ${wTotal}`);
  await ev("[...document.querySelectorAll('aside button')].at(-1).click()"); await settle(1400);
  check("weaknesses list: a one-report weakness opens on the map", /weakness=/.test(await search()) && /1 disclosed report/.test(await panel() || ""), (await panel() || "").slice(0, 160));
  await key("Escape"); await sleep(300); await key("Escape"); await settle(500);

  // 8. Find and Connect AI
  await key("f", "KeyF"); await type("oauth token");
  const found = await ev("document.querySelectorAll('[role=dialog] a[href^=\"/report/\"]').length");
  check("Find: returns results", found > 0, found + " results");
  await shot("7a-find");
  await key("Escape");
  check("Find: Esc closes", !(await ev("!!document.querySelector('[role=dialog]')")));
  await key("f", "KeyF"); await type("ssrf");
  check("Find: offers places on the map as well as reports", /Class/.test(await ev("document.querySelector('[role=dialog] button[data-i=\"0\"]')?.innerText") || ""));
  await key("ArrowDown"); await key("ArrowUp"); await key("Enter"); await settle(600);
  check("Find: Enter on a class opens it on the map", (await search()) === "?class=SSRF" && !(await ev("!!document.querySelector('[role=dialog]')")), await search());
  await key("Escape"); await settle(500);
  // 8b. Sign-in is not open yet, and Connect AI is only for people who are signed in
  check("Connect AI: not offered to someone who is not signed in", !(await ev("[...document.querySelectorAll('header button')].some(b => /Connect AI/.test(b.textContent))")));
  await key("c", "KeyC");
  check("Connect AI: its shortcut does nothing when signed out", !(await ev("!!document.querySelector('[role=dialog]')")));
  check("header: Sign in is marked as coming soon", /Sign in\s*Soon/.test(await ev("document.querySelector('header a[href=\"/account\"]').innerText") || ""));
  const acct = await (await fetch(BASE + "/account")).text();
  check("account page: says sign-in is coming soon, with no Google button", /Coming soon/.test(acct) && !/Continue with Google/.test(acct));
  const start = await fetch(BASE + "/auth/google", { redirect: "manual" });
  check("sign-in address: leads back to the coming-soon page, not to Google", (start.headers.get("location") || "").endsWith("/account"), start.headers.get("location"));

  // 9. Links
  await go("/?class=XSS&weakness=" + encodeURIComponent(STORED), 4500); await sleep(1200);
  check("link to a weakness: opens it", /Stored/.test(await panel() || "") && (await labels()).filter((l) => /^#\d+/.test(l.t)).length >= 16);
  await go("/?class=NOPE&weakness=zzz", 3500);
  check("broken link: falls back to the overview", (await panel()) === null && (await labels()).filter((l) => l.px === 12.5).length === 18);
  await go("/?view=programs", 4000);
  check("link to the Programs view: opens it", (await labels()).filter((l) => l.t.length > 2 && !/ reports?$/.test(l.t)).length >= 30);
  await go("/?program=GitLab", 4500); await sleep(800);
  check("link to a program: shows its reports on the dial", (await labels()).some((l) => /from GitLab$/.test(l.t)) && /GitLab/.test(await panel() || ""));

  // 10. Report pages
  await send("Page.navigate", { url: BASE + "/report/1819832" }); await sleep(2500);
  check("report page: write-up rendered", (await ev("document.querySelector('article')?.innerText.length")) > 800);
  check("report page: no remote images", (await ev("[...document.images].filter(i => !i.src.startsWith(location.origin)).length")) === 0);
  check("report page: outside links are safe", await ev("[...document.querySelectorAll('article a[href^=\"http\"]')].every(a => a.target === '_blank' && /noopener/.test(a.rel))"));
  check("unknown report: 404", (await fetch(BASE + "/report/999999999")).status === 404);
  check("non-numeric report id: 404", (await fetch(BASE + "/report/abc")).status === 404);

  // 10b. Pages and files a public site needs
  const get = async (u) => { const r = await fetch(BASE + u); return { status: r.status, type: r.headers.get("content-type") || "", text: await r.text() }; };
  const home = await get("/");
  check("home: title, description, canonical link and share image", /<title>HexBrain: /.test(home.text) && /name="description"/.test(home.text) && /rel="canonical"/.test(home.text) && /og:image/.test(home.text));
  check("icon, touch icon and share image are served", (await get("/icon")).type.includes("png") && (await get("/favicon.ico")).status === 200 && (await get("/apple-icon")).type.includes("png") && (await get("/opengraph-image")).type.includes("png"));
  const sm = await get("/sitemap.xml");
  check("sitemap lists the reports", sm.status === 200 && (sm.text.match(/<url>/g) || []).length > 1000, (sm.text.match(/<url>/g) || []).length + " urls");
  check("robots.txt points at the sitemap and keeps crawlers out of the API", /Disallow: \/api\//.test((await get("/robots.txt")).text) && /sitemap\.xml/.test((await get("/robots.txt")).text));
  const about = await get("/about");
  check("about page: explains the data and the disclaimer", about.status === 200 && /not affiliated/.test(about.text) && /hackerone-reports/.test(about.text));
  const lost = await get("/no-such-page");
  check("unknown address: a proper not-found page", lost.status === 404 && /not on the map/.test(lost.text));
  const rpt = await get("/report/1819832");
  check("report page: its own title and description", /<title>Delete anyone[^<]* · HexBrain<\/title>/.test(rpt.text) && /name="description" content="Insecure Direct Object/.test(rpt.text));

  // 10c. What an AI assistant sees
  const rpc = async (method, params) => (await (await fetch(BASE + "/api/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json());
  const tools = (await rpc("tools/list")).result?.tools?.map((t) => t.name) || [];
  check("AI: five tools are offered", tools.length === 5, tools.join(","));
  const calls = [["hexbrain_list_classes", {}], ["hexbrain_search_reports", { query: "oauth", limit: 2 }], ["hexbrain_get_report", { id: 1819832, max_chars: 600 }],
    ["hexbrain_get_testing_playbook", { topic: "ssrf", limit: 2, excerpt_chars: 300 }], ["hexbrain_get_program_history", { program: "gitlab", limit: 2 }]];
  for (const [name, args] of calls) { const r = (await rpc("tools/call", { name, arguments: args })).result; check(`AI: ${name} answers`, r && r.isError === false && r.content[0].text.length > 60, JSON.stringify(r).slice(0, 160)); }
  check("AI: the REST door and its description answer", (await get("/api/v1/list_classes")).status === 200 && /openapi/.test((await get("/api/v1/openapi.json")).text));

  // 11. Phone
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 800, deviceScaleFactor: 2, mobile: true });
  await go("/", 4500);
  check("phone: page fits the width", (await ev("document.documentElement.scrollWidth")) <= 390);
  L = await labels();
  const heroTop = await ev("document.querySelector('section').getBoundingClientRect().top");
  check("phone: no map label runs into the intro text", L.every((l) => l.y < heroTop + 2), L.filter((l) => l.y >= heroTop + 2).map((l) => l.t).join(" ; "));
  check("phone: no overlapping labels", overlaps(L) === 0, pairs.join(" ; "));
  await shot("8-phone-overview");
  await clickText("button", "Explore the map"); await settle(700);
  check("phone: class opens in a bottom sheet", /Weaknesses in this class/.test(await panel() || ""));
  await shot("9-phone-class");
  await clickDom("aside button", 0); await settle(1500);
  check("phone: weakness list loads", (await rows()) > 5);
  await shot("10-phone-weakness");
} catch (e) {
  check("test run completed", false, e.stack || e);
} finally {
  chrome.kill();
}
check("no page errors during the run", errors.length === 0, errors.slice(0, 4).join(" || "));
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : "  -> " + r.detail}`);
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
if (speed) console.log("frames per second (headless):", JSON.stringify(speed));
process.exit(0);
