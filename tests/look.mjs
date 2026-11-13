// Opens the running app in headless Chrome, performs a list of steps and saves screenshots, so a design can be reviewed.
//   node tests/look.mjs <outDir> <width>x<height> '<json steps>'       (BASE=http://localhost:3210 unless set)
// Steps: {go:"/path"} {wait:ms} {settle:true} {shot:"name"} {hover:["cls","XSS"]} {click:["weakOf","Shopify","Cross-site Scripting"]}
//        {clickDom:"selector", nth:0} {key:"Escape"} {hoverAt:[x,y]} {clickAt:[x,y]} {wheel:[x,y,delta]} {eval:"js"}
// hover and click take a hook of window.__vg (see the end of src/components/map/renderer.ts) and its arguments.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "http://localhost:3210";
const OUT = process.argv[2] || ".shots", [VW, VH] = (process.argv[3] || "1440x900").split("x").map(Number), steps = JSON.parse(process.argv[4] || "[]");
mkdirSync(OUT, { recursive: true });
const PORT = 9351, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "hb-look-"))}`, "--no-first-run", "--no-default-browser-check", `--window-size=${VW},${VH}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
let ws, seq = 0; const pending = new Map(), errors = [];
try {
  for (let i = 0; i < 40 && !ws; i++) {
    try { const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); if (page) ws = new WebSocket(page.webSocketDebuggerUrl); } catch { await sleep(250); }
  }
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === "Runtime.exceptionThrown") errors.push("exception: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 400));
    else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console.error: " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
  };
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
  const settle = async () => { for (let i = 0; i < 60; i++) { if (await ev("window.__vg?.state().settled")) break; await sleep(100); } await sleep(250); };
  const at = async ([kind, ...args]) => ev(`window.__vg.${kind}(${args.map((a) => JSON.stringify(a)).join(",")})`);
  for (const d of ["Runtime", "Page"]) await send(d + ".enable");
  await send("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 1, mobile: VW < 600 });
  for (const st of steps) {
    if (st.go) { await send("Page.navigate", { url: BASE + st.go }); await sleep(st.ms ?? 3500); }
    else if (st.wait) await sleep(st.wait);
    else if (st.settle) await settle();
    else if (st.shot) { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(OUT, st.shot + ".png"), Buffer.from(r.result.data, "base64")); }
    else if (st.hover) { const p = await at(st.hover); if (!p) { errors.push("no position for " + st.hover); continue; } await mouse("mouseMoved", p[0] + (st.dx || 0), p[1] + (st.dy || 0), { button: "none" }); await sleep(350); }
    else if (st.click) { const p = await at(st.click); if (!p) { errors.push("no position for " + st.click); continue; } const x = p[0] + (st.dx || 0), y = p[1] + (st.dy || 0); await mouse("mouseMoved", x, y, { button: "none" }); await sleep(150); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await sleep(300); }
    else if (st.hoverAt) { await mouse("mouseMoved", st.hoverAt[0], st.hoverAt[1], { button: "none" }); await sleep(350); }
    else if (st.clickAt) { const [x, y] = st.clickAt; await mouse("mouseMoved", x, y, { button: "none" }); await sleep(120); await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); await sleep(300); }
    else if (st.wheel) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: st.wheel[0], y: st.wheel[1], deltaX: 0, deltaY: st.wheel[2] }); await sleep(900); }
    else if (st.key) { await send("Input.dispatchKeyEvent", { type: "keyDown", key: st.key, code: st.key }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: st.key, code: st.key }); await sleep(300); }
    else if (st.clickDom) { await ev(`[...document.querySelectorAll(${JSON.stringify(st.clickDom)})][${st.nth || 0}]?.click()`); await sleep(300); }
    else if (st.eval) console.log("eval:", JSON.stringify(await ev(st.eval)));
  }
} catch (e) { errors.push(String(e.stack || e)); } finally { chrome.kill(); }
console.log(errors.length ? "ERRORS:\n" + errors.slice(0, 6).join("\n") : "no page errors");
process.exit(0);
