#!/usr/bin/env node
// Pulls disclosed HackerOne reports into data/hexbrain.db.
//
//   node scripts/ingest.mjs list [--max 500]     report list from the official Hacker API (needs a token)
//   node scripts/ingest.mjs details [--max 200]  full write-up for each report from its public JSON page
//   node scripts/ingest.mjs import [file|url]   report list from the open hackerone-reports dataset (no token)
//   node scripts/ingest.mjs logos [--max 60]     logo for the programs with the most reports
//   node scripts/ingest.mjs seed <file>          add reports by id (one id per line), no token needed
//   node scripts/ingest.mjs status
//
// Token: set H1_API_USERNAME and H1_API_TOKEN in .env.local
// (create one at https://hackerone.com/settings/api_token/edit).
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local", ".env"]) {
  const p = join(root, f);
  if (existsSync(p)) process.loadEnvFile(p);
}
const dbPath = process.env.HEXBRAIN_DB || join(root, "data", "hexbrain.db");
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec(readFileSync(join(root, "db", "schema.sql"), "utf8"));
if (!db.prepare("PRAGMA table_info(reports)").all().some((c) => c.name === "weakness_guess")) db.exec("ALTER TABLE reports ADD COLUMN weakness_guess TEXT");

const UA = "hexbrain-ingest/0.1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, dflt) => {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const setMeta = (k, v) =>
  db.prepare("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, String(v));

const upsertList = db.prepare(`
  INSERT INTO reports (id,title,program,program_name,severity,weakness,cve_ids,bounty,votes,reporter,substate,disclosed_at,submitted_at,summary)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
    title=excluded.title, program=excluded.program, program_name=excluded.program_name,
    severity=excluded.severity, weakness=excluded.weakness, cve_ids=excluded.cve_ids,
    bounty=excluded.bounty, votes=excluded.votes, reporter=excluded.reporter, substate=excluded.substate,
    disclosed_at=excluded.disclosed_at, submitted_at=excluded.submitted_at,
    summary=COALESCE(excluded.summary, reports.summary)`);

async function list() {
  const user = process.env.H1_API_USERNAME, token = process.env.H1_API_TOKEN;
  if (!user || !token) {
    console.error("Missing H1_API_USERNAME / H1_API_TOKEN. Add them to web/.env.local, then run this again.");
    process.exit(1);
  }
  const auth = "Basic " + Buffer.from(`${user}:${token}`).toString("base64");
  const max = Number(arg("max", Infinity));
  let page = Number(arg("page", 1)), saved = 0;
  while (saved < max) {
    const url = new URL("https://api.hackerone.com/v1/hackers/hacktivity");
    url.searchParams.set("queryString", "disclosed:true");
    url.searchParams.set("page[size]", "100");
    url.searchParams.set("page[number]", String(page));
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json", "User-Agent": UA } });
    if (res.status === 429) { console.log("Rate limited, waiting 60s"); await sleep(60000); continue; }
    if (!res.ok) { console.error(`HackerOne API answered ${res.status} on page ${page}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
    const items = (await res.json()).data || [];
    if (!items.length) break;
    db.exec("BEGIN");
    for (const it of items) {
      const a = it.attributes || {}, r = it.relationships || {};
      const id = Number(it.id || (a.url || "").split("/").pop());
      if (!id || !a.title) continue;
      const prog = r.program?.data?.attributes || {}, rep = r.reporter?.data?.attributes || {};
      const sum = r.report_generated_content?.data?.attributes?.hacktivity_summary || null;
      upsertList.run(id, a.title, prog.handle ?? null, prog.name ?? null, a.severity_rating ?? null, a.cwe ?? null,
        JSON.stringify(a.cve_ids || []), a.total_awarded_amount ?? null, a.votes ?? 0, rep.username ?? null,
        a.substate ?? null, a.disclosed_at ?? null, a.submitted_at ?? null, sum);
      saved++;
    }
    db.exec("COMMIT");
    console.log(`page ${page}: ${items.length} reports (${saved} saved so far)`);
    page++;
    await sleep(500);
  }
  setMeta("list_synced_at", new Date().toISOString());
  console.log(`Done. ${saved} reports listed.`);
}

// Remember each program's HackerOne handle and profile picture, keyed by the name used in the report list.
const upsertProgram = db.prepare(`INSERT INTO programs (name, handle, logo_url) VALUES (?,?,?)
  ON CONFLICT(name) DO UPDATE SET handle=COALESCE(excluded.handle, programs.handle), logo_url=COALESCE(excluded.logo_url, programs.logo_url)`);
function saveProgram(j, name) {
  const key = name || j.team?.profile?.name || j.team?.handle;
  if (!key) return;
  const pics = j.team?.profile_picture_urls || {};
  upsertProgram.run(key, j.team?.handle ?? null, pics.medium || pics.small || null);
}

async function fetchDetail(id) {
  const res = await fetch(`https://hackerone.com/reports/${id}.json`, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!res.ok) return { status: res.status };
  const type = res.headers.get("content-type") || "";
  if (!type.includes("json")) return { status: 403 };
  return { status: 200, j: await res.json() };
}

function summaryOf(j) {
  const s = (j.summaries || []).map((x) => x.content).filter(Boolean);
  return s.length ? s.join("\n\n") : null;
}

async function details() {
  const max = Number(arg("max", 200));
  // Reports with no weakness yet go first, so every report gets a type as early as possible.
  const rows = db.prepare("SELECT id, program_name FROM reports WHERE detail_at IS NULL ORDER BY (weakness IS NULL) DESC, votes DESC, id DESC LIMIT ?").all(max);
  const upd = db.prepare(`UPDATE reports SET body=?, summary=COALESCE(?,summary), asset_type=?, asset=?, detail_at=?, detail_status=?,
    severity=COALESCE(?,severity), disclosed_at=COALESCE(?,disclosed_at), submitted_at=COALESCE(?,submitted_at), reporter=COALESCE(?,reporter),
    program=COALESCE(?,program), cve_ids=COALESCE(?,cve_ids), weakness=COALESCE(weakness,?), substate=COALESCE(?,substate) WHERE id=?`);
  const gap = Number(arg("gap", 700));
  let ok = 0;
  for (const { id, program_name } of rows) {
    const d = await fetchDetail(id);
    if (d.status === 200) saveProgram(d.j, program_name);
    if (d.status === 403 || d.status === 429) {
      console.error(`HackerOne answered ${d.status} for report ${id}. Stopping so we don't hammer it; run again later.`);
      break;
    }
    const now = new Date().toISOString();
    if (d.status !== 200) { upd.run(null, null, null, null, now, d.status, null, null, null, null, null, null, null, null, id); await sleep(gap); continue; }
    const j = d.j, sc = j.structured_scope || {};
    upd.run(j.vulnerability_information || null, summaryOf(j), sc.asset_type ?? null, sc.asset_identifier ?? null, now, 200,
      j.severity_rating ?? null, j.disclosed_at ?? null, j.submitted_at ?? null, j.reporter?.username ?? null,
      j.team?.handle ?? null, JSON.stringify(j.cve_ids || []), j.weakness?.name ?? null, j.substate ?? null, id);
    ok++;
    if (ok % 100 === 0) console.log(`${ok}/${rows.length} write-ups saved`);
    await sleep(gap);
  }
  setMeta("details_synced_at", new Date().toISOString());
  console.log(`Done. ${ok} write-ups saved.`);
}

async function seed(file) {
  const ids = [...new Set(readFileSync(file, "utf8").match(/\d{4,}/g) || [])].map(Number);
  const have = new Set(db.prepare("SELECT id FROM reports").all().map((r) => r.id));
  const ins = db.prepare(`INSERT OR REPLACE INTO reports
    (id,title,program,program_name,severity,weakness,cve_ids,bounty,votes,reporter,substate,asset_type,asset,disclosed_at,submitted_at,summary,body,detail_at,detail_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,200)`);
  let ok = 0;
  for (const id of ids) {
    if (have.has(id)) continue;
    const d = await fetchDetail(id);
    if (d.status === 403 || d.status === 429) { console.error(`HackerOne answered ${d.status}. Stopping.`); break; }
    if (d.status !== 200) { console.log(`skip ${id} (${d.status})`); continue; }
    const j = d.j, sc = j.structured_scope || {};
    ins.run(id, j.title, j.team?.handle ?? null, j.team?.profile?.name ?? j.team?.handle ?? null, j.severity_rating ?? null,
      j.weakness?.name ?? null, JSON.stringify(j.cve_ids || []), null, j.vote_count ?? 0, j.reporter?.username ?? null,
      j.substate ?? null, sc.asset_type ?? null, sc.asset_identifier ?? null, j.disclosed_at ?? null, j.submitted_at ?? null,
      summaryOf(j), j.vulnerability_information || null, new Date().toISOString());
    ok++;
    if (ok % 10 === 0) console.log(`${ok} reports seeded`);
    await sleep(1100);
  }
  console.log(`Done. ${ok} reports seeded.`);
}

// Open dataset of disclosed reports (id, title, program, upvotes, bounty, weakness). No token needed.
const DATASET = "https://raw.githubusercontent.com/reddelexc/hackerone-reports/master/data.csv";
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.length > 1) rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.length > 1) rows.push(row); }
  return rows;
}
async function importCsv(src) {
  const text = src && existsSync(src) ? readFileSync(src, "utf8") : await (await fetch(src || DATASET, { headers: { "User-Agent": UA } })).text();
  const rows = parseCsv(text), head = rows.shift().map((h) => h.trim());
  const col = (n) => head.indexOf(n);
  const ins = db.prepare(`INSERT INTO reports (id,title,program_name,votes,bounty,weakness) VALUES (?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, program_name=excluded.program_name, votes=excluded.votes,
      bounty=excluded.bounty, weakness=COALESCE(excluded.weakness, reports.weakness)`);
  let n = 0;
  db.exec("BEGIN");
  for (const r of rows) {
    const id = Number((r[col("link")] || "").split("/").pop());
    if (!id || !r[col("title")]) continue;
    const bounty = Number(r[col("bounty")]) || null, weak = (r[col("vuln_type")] || "").trim() || null;
    ins.run(id, r[col("title")], r[col("program")] || null, Number(r[col("upvotes")]) || 0, bounty, weak);
    n++;
  }
  db.exec("COMMIT");
  setMeta("list_synced_at", new Date().toISOString());
  console.log(`Done. ${n} reports listed from the open dataset.`);
}

// Saves a small logo for the programs with the most reports into public/logos.
async function logos() {
  const max = Number(arg("max", 60)), dir = join(root, "public", "logos");
  mkdirSync(dir, { recursive: true });
  const top = db.prepare(`SELECT COALESCE(program_name, program) name, COUNT(*) n FROM reports
    WHERE COALESCE(program_name, program) IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT ?`).all(max);
  const getP = db.prepare("SELECT * FROM programs WHERE name = ?");
  let saved = 0;
  for (const { name } of top) {
    let p = getP.get(name);
    if (!p?.logo_url) {
      const ids = db.prepare(`SELECT id FROM reports WHERE COALESCE(program_name, program) = ? AND COALESCE(detail_status, 200) = 200 ORDER BY id DESC LIMIT 3`).all(name);
      for (const { id } of ids) {
        const d = await fetchDetail(id);
        await sleep(700);
        if (d.status === 403 || d.status === 429) { console.error(`HackerOne answered ${d.status}. Stopping.`); return; }
        if (d.status === 200) { saveProgram(d.j, name); break; }
      }
      p = getP.get(name);
    }
    if (!p?.logo_url || p.logo_file) continue;
    const res = await fetch(p.logo_url, { headers: { "User-Agent": UA } });
    if (!res.ok) { console.log(`no logo for ${name} (${res.status})`); continue; }
    const type = res.headers.get("content-type") || "", ext = type.includes("png") ? "png" : type.includes("svg") ? "svg" : type.includes("gif") ? "gif" : type.includes("webp") ? "webp" : "jpg";
    const file = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "." + ext;
    writeFileSync(join(dir, file), Buffer.from(await res.arrayBuffer()));
    db.prepare("UPDATE programs SET logo_file = ? WHERE name = ?").run("/logos/" + file, name);
    saved++;
    await sleep(200);
  }
  console.log(`Done. ${saved} logos saved.`);
}

function status() {
  const r = db.prepare("SELECT COUNT(*) n, SUM(body IS NOT NULL) withBody, COUNT(DISTINCT weakness) weaknesses, COUNT(DISTINCT program) programs FROM reports").get();
  console.log(r, db.prepare("SELECT k,v FROM meta").all());
}

const cmd = process.argv[2];
if (cmd === "list") await list();
else if (cmd === "details") await details();
else if (cmd === "seed") await seed(process.argv[3]);
else if (cmd === "import") await importCsv(process.argv[3]);
else if (cmd === "logos") await logos();
else if (cmd === "status") status();
else console.log("Usage: node scripts/ingest.mjs <import|list|details|logos|seed <file>|status> [--max N]");
