#!/usr/bin/env node
// Pulls disclosed HackerOne reports into data/hexbrain.db.
//
//   node scripts/ingest.mjs list [--max 500]     report list from the official Hacker API (needs a token)
//   node scripts/ingest.mjs details [--max 200]  full write-up for each report from its public JSON page
//   node scripts/ingest.mjs import [file|url]   report list from the open hackerone-reports dataset (no token)
//   node scripts/ingest.mjs index                 build the bypass library from the stored write-ups
//   node scripts/ingest.mjs payloads              import the PayloadsAllTheThings reference collection
//   node scripts/ingest.mjs cves                  import CVE checks, the exploited-in-the-wild list and likelihood scores
//   node scripts/ingest.mjs logos [--max 60]     logo for the programs with the most reports
//   node scripts/ingest.mjs seed <file>          add reports by id (one id per line), no token needed
//   node scripts/ingest.mjs status
//
// Token: set H1_API_USERNAME and H1_API_TOKEN in .env.local
// (create one at https://hackerone.com/settings/api_token/edit).
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, existsSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { parse as parseYaml } from "yaml";
import { passages, referencedReports, tagReport } from "../src/lib/defences.mjs";

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

// Derives the bypass library from the stored reports: passages for precise search, the protections each report
// got past, and links from a bypass to the earlier report it refers to. Safe to run again at any time.
function buildIndex() {
  const rows = db.prepare("SELECT id, title, summary, body FROM reports").all(), known = new Set(rows.map((r) => r.id));
  const sec = db.prepare("INSERT INTO sections (report_id, heading, text) VALUES (?,?,?)");
  const tag = db.prepare("INSERT OR IGNORE INTO report_tags (report_id, tag) VALUES (?,?)");
  const ref = db.prepare("INSERT OR IGNORE INTO report_refs (report_id, ref_id) VALUES (?,?)");
  let nSec = 0, nTag = 0, nRef = 0;
  db.exec("BEGIN; DELETE FROM sections; DELETE FROM report_tags; DELETE FROM report_refs;");
  for (const r of rows) {
    const text = [r.summary, r.body].filter(Boolean).join("\n\n");
    if (r.body) for (const p of passages(r.body)) { sec.run(r.id, p.heading || null, p.text); nSec++; }
    const tags = tagReport(r.title, text), refs = referencedReports(r.title, text).filter((id) => id !== r.id && known.has(id));
    if (refs.length && !tags.includes("fix")) tags.push("fix");
    for (const t of tags) { tag.run(r.id, t); nTag++; }
    if (tags.length) for (const id of refs) { ref.run(r.id, id); nRef++; }
  }
  db.exec("COMMIT; INSERT INTO sections_fts(sections_fts) VALUES ('rebuild');");
  setMeta("indexed_at", new Date().toISOString());
  const reports = db.prepare("SELECT COUNT(DISTINCT report_id) n FROM report_tags").get().n;
  console.log(`Done. ${nSec} passages, ${reports} bypass reports with ${nTag} protection tags, ${nRef} links to earlier reports.`);
}

// Imports PayloadsAllTheThings (MIT licence, see THIRD_PARTY.md): every topic's markdown, cut into passages by heading.
// The files are only read as text. Nothing from the download is run.
const PATT = "https://github.com/swisskyrepo/PayloadsAllTheThings";
const TOPIC_CLASS = [[/xss|dom clobber|css injection|tabnabbing/i, "XSS"], [/server side request|dns rebinding/i, "SSRF"], [/cross-site request forgery/i, "CSRF"], [/sql|nosql|orm leak/i, "SQLI"],
  [/direct object|mass assignment/i, "IDOR"], [/command injection|template injection|deserialization|upload|java rmi|server side include|latex|xslt|csv injection|prompt injection/i, "RCE"],
  [/traversal|file inclusion|zip slip/i, "TRAV"], [/account takeover|oauth|saml|json web token|brute force/i, "AUTH"], [/open redirect/i, "REDIR"], [/business logic|race condition/i, "LOGIC"],
  [/denial of service|regular expression/i, "DOS"], [/crlf|smuggling|xxe|ldap|xpath|graphql|parameter pollution|web sockets/i, "INJ"], [/randomness|type juggling/i, "CRYPTO"],
  [/cors|clickjacking|cache|reverse proxy|virtual hosts|source code management|management interface|dependency confusion|api key/i, "CONF"]];
function walk(dir) { return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
function importPayloads(src) {
  const dir = src || join(root, "data", "sources", "PayloadsAllTheThings");
  if (!existsSync(dir)) { mkdirSync(dirname(dir), { recursive: true }); execFileSync("git", ["clone", "--depth", "1", PATT + ".git", dir], { stdio: "inherit" }); }
  const ins = db.prepare("INSERT INTO techniques (source, topic, class_id, path, text, url) VALUES ('PayloadsAllTheThings',?,?,?,?,?)");
  let n = 0; const topics = new Set();
  db.exec("BEGIN; DELETE FROM techniques WHERE source = 'PayloadsAllTheThings';");
  for (const topic of readdirSync(dir).filter((t) => !/^[._]/.test(t) && statSync(join(dir, t)).isDirectory())) {
    const classId = (TOPIC_CLASS.find(([re]) => re.test(topic)) || [])[1] ?? null;
    for (const file of walk(join(dir, topic)).filter((f) => f.endsWith(".md"))) {
      const rel = file.slice(dir.length + 1), page = `${PATT}/blob/master/${rel.split("/").map(encodeURIComponent).join("/")}`;
      const trail = []; let buf = [], fence = false, anchor = "";
      const flush = () => {
        const text = buf.join("\n").trim(); buf = [];
        const leaf = trail[trail.length - 1] || "";
        if (text.length < 40 || /^(references|labs|summary|table of contents)$/i.test(leaf)) return;
        const path = trail.slice(1).join(" > ") || (rel.endsWith("README.md") ? "Overview" : rel.split("/").pop().replace(/\.md$/, ""));
        for (let i = 0; i < text.length; i += 6000) { ins.run(topic, classId, path, text.slice(i, i + 6000), page + (anchor ? "#" + anchor : "")); n++; }
        topics.add(topic);
      };
      for (const line of readFileSync(file, "utf8").replace(/\r/g, "").split("\n")) {
        if (/^\s*(```|~~~)/.test(line)) fence = !fence;
        const h = !fence && line.match(/^(#{1,4})\s+(.+?)\s*#*$/);
        if (!h) { buf.push(line); continue; }
        flush();
        trail.length = h[1].length - 1; trail[h[1].length - 1] = h[2].replace(/[`*]/g, "").trim();
        for (let i = 0; i < trail.length; i++) trail[i] ??= "";
        anchor = h[2].toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
      }
      flush();
    }
  }
  db.exec("COMMIT; INSERT INTO techniques_fts(techniques_fts) VALUES ('rebuild');");
  setMeta("payloads_at", new Date().toISOString());
  console.log(`Done. ${n} passages from ${topics.size} topics of PayloadsAllTheThings.`);
}

// CVE library: detection checks from nuclei-templates (MIT), "exploited in the wild" from CISA's KEV catalogue,
// and exploitation likelihood from EPSS. The templates are only read as text. Nothing from the download is run.
const NUCLEI = "https://github.com/projectdiscovery/nuclei-templates";
const KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const EPSS_URL = "https://epss.empiricalsecurity.com/epss_scores-current.csv.gz";
const short = (v, n) => { const t = String(v ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
/** Says in words what a template sends and what counts as a positive result. */
function describeCheck(doc) {
  const out = [];
  for (const proto of ["http", "requests", "network", "tcp", "javascript", "code", "headless", "dns", "ssl", "websocket"]) {
    for (const block of Array.isArray(doc[proto]) ? doc[proto] : []) {
      const sends = [];
      for (const raw of block.raw || []) sends.push(short(String(raw).split("\n")[0].replace(/ HTTP\/[\d.]+$/, ""), 160));
      for (const p of block.path || []) sends.push(`${block.method || "GET"} ${short(p, 150)}`);
      if (block.inputs) sends.push(`${proto} probe to ${short((block.host || []).join(", ") || "the service port", 80)}`);
      if (sends.length) out.push("Send: " + [...new Set(sends)].slice(0, 5).join(" ; "));
      const tests = (block.matchers || []).map((m) => {
        const where = m.part && m.part !== "body" ? ` in ${m.part}` : "", not = m.negative ? "not " : "";
        if (m.type === "status") return `${not}status ${[].concat(m.status || []).join(" or ")}`;
        if (m.type === "word") return `${not}contains${where} ${[].concat(m.words || []).slice(0, 4).map((w) => JSON.stringify(short(w, 60))).join(m.condition === "and" ? " and " : " or ")}`;
        if (m.type === "regex") return `${not}matches${where} /${short([].concat(m.regex || [])[0], 80)}/`;
        if (m.type === "dsl") return `${not}${short([].concat(m.dsl || []).join(m.condition === "and" ? " and " : " or "), 200)}`;
        return m.type;
      });
      if (tests.length) out.push("Positive when: " + tests.join(block["matchers-condition"] === "and" ? " AND " : " OR "));
    }
  }
  return out.join("\n").slice(0, 2500);
}
async function importCves(src) {
  const dir = src || join(root, "data", "sources", "nuclei-templates");
  if (!existsSync(dir)) { mkdirSync(dirname(dir), { recursive: true }); execFileSync("git", ["clone", "--depth", "1", NUCLEI + ".git", dir], { stdio: "inherit" }); }
  else try { execFileSync("git", ["-C", dir, "pull", "-q", "--depth", "1"], { stdio: "ignore" }); } catch { console.log("Could not update the templates; using the copy on disk."); }
  const ins = db.prepare(`INSERT OR REPLACE INTO cves (id,name,severity,description,impact,remediation,vendor,product,cpe,cvss,cwe,tags,verified,protocol,refs,template_path,template,check_summary)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let n = 0, bad = 0;
  db.exec("BEGIN; DELETE FROM cves;");
  for (const file of walk(dir).filter((f) => /\.ya?ml$/.test(f) && !f.includes("/.git/"))) {
    const raw = readFileSync(file, "utf8");
    if (!/^id:\s*CVE-\d{4}-\d+/im.test(raw.slice(0, 300))) continue;
    let doc; try { doc = parseYaml(raw); } catch { bad++; continue; }
    const info = doc?.info || {}, cl = info.classification || {}, meta = info.metadata || {};
    const id = String([].concat(cl["cve-id"] || doc.id)[0] || "").toUpperCase();
    if (!/^CVE-\d{4}-\d+$/.test(id)) continue;
    const rel = file.slice(dir.length + 1), one = (v) => (Array.isArray(v) ? v[0] : v) ?? null;
    ins.run(id, short(info.name, 300), String(info.severity || "").toLowerCase() || null, short(info.description, 3000) || null, short(info.impact, 1000) || null, short(info.remediation, 1000) || null,
      one(meta.vendor), one(meta.product), one(cl.cpe), Number(cl["cvss-score"]) || null, [].concat(cl["cwe-id"] || []).join(", ") || null,
      [].concat(info.tags || []).join(","), meta.verified ? 1 : 0, rel.split("/")[0], JSON.stringify([].concat(info.reference || []).slice(0, 12)),
      rel, raw.replace(/\n# digest:.*$/s, "").slice(0, 30000), describeCheck(doc));
    n++;
  }
  // Exploited in the wild (CISA KEV). CVEs with no check of ours are added too, so the library knows about them.
  const kev = (await (await fetch(KEV_URL, { headers: { "User-Agent": UA } })).json()).vulnerabilities || [];
  const mark = db.prepare("UPDATE cves SET kev = 1, kev_added = ?, kev_ransomware = ?, kev_action = ? WHERE id = ?");
  const add = db.prepare("INSERT INTO cves (id,name,description,vendor,product,cwe,kev,kev_added,kev_ransomware,kev_action,refs) VALUES (?,?,?,?,?,?,1,?,?,?,?)");
  let kevNew = 0;
  for (const k of kev) {
    const ransom = /known/i.test(k.knownRansomwareCampaignUse || "") ? 1 : 0;
    if (mark.run(k.dateAdded, ransom, k.requiredAction, k.cveID).changes) continue;
    add.run(k.cveID, short(k.vulnerabilityName, 300), short(k.shortDescription, 3000), String(k.vendorProject || "").toLowerCase(), String(k.product || "").toLowerCase(), [].concat(k.cwes || []).join(", ") || null,
      k.dateAdded, ransom, k.requiredAction, JSON.stringify([`https://nvd.nist.gov/vuln/detail/${k.cveID}`]));
    kevNew++;
  }
  // How likely each is to be exploited (EPSS).
  const csv = gunzipSync(Buffer.from(await (await fetch(EPSS_URL, { headers: { "User-Agent": UA } })).arrayBuffer())).toString("utf8");
  const have = new Set(db.prepare("SELECT id FROM cves").all().map((r) => r.id)), score = db.prepare("UPDATE cves SET epss = ?, epss_pct = ? WHERE id = ?");
  let scored = 0;
  // The same list names every registered CVE, which is what the CVE map draws: one dot each, in order within its year.
  const every = new Map();
  for (const line of csv.split("\n")) {
    const [id, e, p] = line.split(",");
    if (!/^CVE-\d{4}-\d+$/.test(id)) continue;
    every.set(id, Number(e));
    if (have.has(id)) { score.run(Number(e), Number(p), id); scored++; }
  }
  for (const id of have) if (!every.has(id)) every.set(id, null);
  // Each goes into a band of its year: exploited, has a ready check, likely (10%+), possible (1 to 10%), unlikely.
  const state = new Map(db.prepare("SELECT id, kev, (template IS NOT NULL) AS chk FROM cves").all().map((r) => [r.id, r.kev ? 0 : r.chk ? 1 : -1]));
  const groups = new Map();
  for (const [id, e] of every) {
    const s = state.get(id), band = s === 0 || s === 1 ? s : e >= 0.1 ? 2 : e >= 0.01 ? 3 : 4, key = id.split("-")[1] + "|" + band;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([id, e]);
  }
  const put = db.prepare("INSERT INTO cve_map (id, year, band, pos, epss) VALUES (?,?,?,?,?)");
  db.exec("DROP TABLE IF EXISTS cve_all; DELETE FROM cve_map;");
  for (const [key, list] of groups) { const [year, band] = key.split("|").map(Number); list.sort((x, y) => (y[1] || 0) - (x[1] || 0) || (x[0] < y[0] ? -1 : 1)).forEach(([id, e], pos) => put.run(id, year, band, pos, e)); }
  db.exec("COMMIT; INSERT INTO cves_fts(cves_fts) VALUES ('rebuild');");
  console.log(`${every.size} registered CVE ids placed on the map.`);
  setMeta("cves_at", new Date().toISOString());
  console.log(`Done. ${n} CVEs with a check (${bad} templates could not be read), ${kev.length} known to be exploited (${kevNew} of them without a check), ${scored} scored for likelihood.`);
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
else if (cmd === "index") buildIndex();
else if (cmd === "payloads") importPayloads(process.argv[3]);
else if (cmd === "cves") await importCves(process.argv[3]);
else if (cmd === "status") status();
else console.log("Usage: node scripts/ingest.mjs <import|list|details|logos|index|payloads|cves|seed <file>|status> [--max N]");
