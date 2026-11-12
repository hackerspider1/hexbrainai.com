import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CLASSES, MENTIONS, OTHER, classOf, guessWeakness, sevIndex } from "./taxonomy";

const dbPath = process.env.HEXBRAIN_DB || join(process.cwd(), "data", "hexbrain.db");
let handle: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (!handle) {
    mkdirSync(dirname(dbPath), { recursive: true });
    handle = new DatabaseSync(dbPath);
    handle.exec("PRAGMA busy_timeout = 4000;");
    const schema = join(process.cwd(), "db", "schema.sql");
    if (existsSync(schema)) handle.exec(readFileSync(schema, "utf8"));
    if (!(handle.prepare("PRAGMA table_info(reports)").all() as { name: string }[]).some((c) => c.name === "weakness_guess"))
      handle.exec("ALTER TABLE reports ADD COLUMN weakness_guess TEXT");
    // Fill the full-text index once; after that the triggers keep it current.
    if (!handle.prepare("SELECT 1 FROM meta WHERE k = 'fts_built'").get()) {
      handle.exec("INSERT INTO reports_fts(reports_fts) VALUES ('rebuild')");
      handle.exec("INSERT OR REPLACE INTO meta(k, v) VALUES ('fts_built', datetime('now'))");
    }
  }
  return handle;
}

export type ReportRow = {
  id: number; title: string; program: string | null; program_name: string | null; severity: string | null;
  weakness: string | null; cve_ids: string | null; bounty: number | null; votes: number; reporter: string | null;
  substate: string | null; asset_type: string | null; asset: string | null; disclosed_at: string | null;
  submitted_at: string | null; summary: string | null; body: string | null; detail_at: string | null;
  weakness_guess: string | null; logo?: string | null;
};
// [id, title, severity index, bounty, votes, program]
export type Leaf = [number, string, number, number, number, string];
// `members` lists the HackerOne weakness names folded into this node (one name unless it is a "rarer" group).
// `sev` has one digit per report (its severity, 0 to 4), most upvoted first: enough to draw every report as a dot
// without sending its title. Titles load per weakness, on demand.
export type GraphWeakness = { name: string; count: number; bounty: number; sev: string };
export type GraphClass = { id: string; name: string; count: number; bounty: number; weaknesses: GraphWeakness[] };
export type GraphProgram = { name: string; count: number; bounty: number; logo: string | null; classes: [string, number][] };
export type Graph = {
  total: number; withBody: number; programs: number; weaknessCount: number; totalBounty: number;
  classes: GraphClass[]; links: [string, string, number][]; topPrograms: GraphProgram[];
};

const UNCLASSIFIED = "Unclassified";
const PROGRAM = "COALESCE(program_name, program)";
// The weakness set on HackerOne, or our title-based guess when the program left it empty.
const WEAK = "COALESCE(weakness, NULLIF(weakness_guess, ''))";

/** Gives every report that has no weakness a best guess from its title, once. */
function classifyUntyped(d: DatabaseSync) {
  const rows = d.prepare("SELECT id, title FROM reports WHERE weakness IS NULL AND weakness_guess IS NULL").all() as { id: number; title: string }[];
  if (!rows.length) return;
  const upd = d.prepare("UPDATE reports SET weakness_guess = ? WHERE id = ?");
  d.exec("BEGIN");
  for (const r of rows) upd.run(guessWeakness(r.title), r.id);
  d.exec("COMMIT");
}

let cached: { at: number; graph: Graph } | null = null;

export function getGraph(): Graph {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.graph;
  const d = db();
  classifyUntyped(d);
  const rows = d.prepare(
    `SELECT id, title, severity, ${WEAK} AS weakness, bounty, votes, ${PROGRAM} AS program,
            COALESCE(summary,'') || ' ' || COALESCE(substr(body,1,3000),'') AS text
     FROM reports ORDER BY votes DESC, id DESC`
  ).all() as unknown as { id: number; title: string; severity: string | null; weakness: string | null; bounty: number | null; votes: number; program: string | null; text: string }[];

  const classes = new Map<string, GraphClass>();
  const weak = new Map<string, GraphWeakness>();
  const dots = new Map<GraphWeakness, [number, number, number][]>(); // per weakness: [votes, id, severity]
  const programs = new Map<string, { count: number; bounty: number; classes: Map<string, number> }>();
  const pairs = new Map<string, number>();
  let totalBounty = 0;

  for (const r of rows) {
    const def = classOf(r.weakness), wname = r.weakness || UNCLASSIFIED;
    let c = classes.get(def.id);
    if (!c) classes.set(def.id, (c = { id: def.id, name: def.name, count: 0, bounty: 0, weaknesses: [] }));
    let w = weak.get(wname);
    if (!w) { weak.set(wname, (w = { name: wname, count: 0, bounty: 0, sev: "" })); dots.set(w, []); c.weaknesses.push(w); }
    const bounty = r.bounty || 0;
    c.count++; w.count++; c.bounty += bounty; w.bounty += bounty; totalBounty += bounty;
    dots.get(w)!.push([r.votes || 0, r.id, sevIndex(r.severity)]);
    if (r.program) {
      let p = programs.get(r.program);
      if (!p) programs.set(r.program, (p = { count: 0, bounty: 0, classes: new Map() }));
      p.count++; p.bounty += bounty; p.classes.set(def.id, (p.classes.get(def.id) || 0) + 1);
    }
    // A report filed under one class that talks about another links the two.
    if (def.id !== OTHER.id) {
      const hay = r.title + " " + r.text;
      for (const m of MENTIONS) {
        if (m.id === def.id || !m.re.test(hay)) continue;
        const key = def.id < m.id ? `${def.id}|${m.id}` : `${m.id}|${def.id}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }

  const order = [...CLASSES, OTHER].map((c) => c.id);
  const list = [...classes.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const c of list) c.weaknesses.sort((a, b) => b.count - a.count); // every weakness is its own part of the map
  // Same order as getLeaves(): most upvoted first, newest first among equals.
  for (const c of list) for (const w of c.weaknesses) w.sev = dots.get(w)!.sort((a, b) => b[0] - a[0] || b[1] - a[1]).map((d) => d[2]).join("");
  const links = [...pairs.entries()].map(([k, n]) => [...k.split("|"), n] as [string, string, number])
    .filter(([, , n]) => n >= 3).sort((a, b) => b[2] - a[2]).slice(0, 42);
  const logos = new Map((d.prepare("SELECT name, logo_file FROM programs WHERE logo_file IS NOT NULL").all() as { name: string; logo_file: string }[]).map((r) => [r.name, r.logo_file]));
  // Every program, biggest first. The map gives the first few dozen a logo and a name; the rest are dots on the same ring.
  const topPrograms = [...programs.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([name, p]) => ({ name, count: p.count, bounty: p.bounty, logo: logos.get(name) ?? null, classes: [...p.classes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6) }));
  const withBody = (d.prepare("SELECT COUNT(*) n FROM reports WHERE body IS NOT NULL").get() as { n: number }).n;

  const graph: Graph = { total: rows.length, withBody, programs: programs.size, weaknessCount: weak.size, totalBounty, classes: list, links, topPrograms };
  cached = { at: Date.now(), graph };
  return graph;
}

/** Turns typed words into a full-text query: every word must appear; the last one may be a prefix. */
export function ftsQuery(q: string, inWriteups: boolean): string | null {
  const words = q.split(/[^\p{L}\p{N}_]+/u).filter((w) => w.length > 1).slice(0, 8);
  if (!words.length) return null;
  const expr = words.map((w, i) => `"${w}"${i === words.length - 1 ? "*" : ""}`).join(" ");
  return inWriteups ? expr : `{title program_name weakness} : (${expr})`;
}
/** SQL that joins reports to their full-text matches, with a relevance rank (lower is better). */
export const FTS_JOIN = "JOIN (SELECT rowid AS fid, bm25(reports_fts, 10.0, 4.0, 4.0, 2.0, 1.0) AS rank FROM reports_fts WHERE reports_fts MATCH ?) m ON m.fid = reports.id";

/** The reports of one weakness (or group of weaknesses) as map dots, in the same order as the graph's `sev` string. */
export function getLeaves(names: string[]): Leaf[] {
  const real = names.filter((n) => n && n !== UNCLASSIFIED).slice(0, 200), parts: string[] = [];
  if (real.length) parts.push(`${WEAK} IN (${real.map(() => "?").join(",")})`);
  if (names.includes(UNCLASSIFIED)) parts.push(`${WEAK} IS NULL`);
  if (!parts.length) return [];
  const rows = db().prepare(
    `SELECT id, title, severity, bounty, votes, ${PROGRAM} AS program FROM reports WHERE ${parts.join(" OR ")} ORDER BY votes DESC, id DESC`
  ).all(...real) as { id: number; title: string; severity: string | null; bounty: number | null; votes: number; program: string | null }[];
  return rows.map((r) => [r.id, r.title.length > 96 ? r.title.slice(0, 94) + "…" : r.title, sevIndex(r.severity), r.bounty || 0, r.votes || 0, r.program || ""]);
}

/** Which dots on the map belong to one program: for each weakness, the positions of its reports in that weakness's `sev` order. */
export function getProgramDots(program: string): Record<string, number[]> {
  const rows = db().prepare(`SELECT ${WEAK} AS w, ${PROGRAM} AS p FROM reports ORDER BY votes DESC, id DESC`).all() as { w: string | null; p: string | null }[];
  const seen = new Map<string, number>(), out: Record<string, number[]> = {};
  for (const r of rows) {
    const w = r.w || UNCLASSIFIED, i = seen.get(w) || 0;
    seen.set(w, i + 1);
    if (r.p === program) (out[w] ||= []).push(i);
  }
  return out;
}

export type ListQuery = { q?: string; weakness?: string; cls?: string; program?: string; sort?: string; offset?: number; limit?: number };

export function listReports(o: ListQuery) {
  const where: string[] = [], args: (string | number)[] = [];
  const weaknessIn = (names: (string | null)[]) => {
    const real = names.filter((n): n is string => !!n && n !== UNCLASSIFIED), parts: string[] = [];
    if (real.length) { parts.push(`${WEAK} IN (${real.map(() => "?").join(",")})`); args.push(...real); }
    if (names.some((n) => !n || n === UNCLASSIFIED)) parts.push(`${WEAK} IS NULL`);
    where.push(parts.length ? `(${parts.join(" OR ")})` : "0");
  };
  const match = o.q ? ftsQuery(o.q, false) : null, join = match ? FTS_JOIN : "";
  if (match) args.push(match);
  if (o.weakness) weaknessIn(o.weakness.split("|"));
  if (o.program) { where.push(`${PROGRAM} = ?`); args.push(o.program); }
  if (o.cls) {
    const names = (db().prepare(`SELECT DISTINCT ${WEAK} w FROM reports`).all() as { w: string | null }[]).map((r) => r.w);
    weaknessIn(names.filter((n) => classOf(n).id === o.cls));
  }
  const order = o.sort === "bounty" ? "bounty DESC NULLS LAST, votes DESC" : o.sort === "new" ? "id DESC" : match && !o.sort ? "rank, votes DESC" : "votes DESC, id DESC";
  const w = where.length ? "WHERE " + where.join(" AND ") : "";
  const limit = Math.min(Math.max(o.limit ?? 30, 1), 100), offset = Math.max(o.offset ?? 0, 0);
  const total = (db().prepare(`SELECT COUNT(*) n FROM reports ${join} ${w}`).get(...args) as { n: number }).n;
  const rows = db().prepare(
    `SELECT id,title,${PROGRAM} AS program,severity,${WEAK} AS weakness,bounty,votes,reporter,disclosed_at FROM reports ${join} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  return { total, rows };
}

// Upstream fetches go through one queue: at most one request every 600 ms, each report fetched once however
// many visitors ask for it, and a full queue is skipped rather than grown. This keeps us polite to HackerOne
// and stops the site being used to hammer it.
const inflight = new Map<number, Promise<ReportRow | undefined>>();
let gate: Promise<void> = Promise.resolve(), lastFetch = 0, waiting = 0;
function politely<T>(fn: () => Promise<T>): Promise<T> {
  waiting++;
  const turn = gate.then(async () => {
    const wait = 600 - (Date.now() - lastFetch);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetch = Date.now();
  });
  gate = turn.catch(() => {});
  return turn.then(fn).finally(() => { waiting--; });
}

/** Returns the report, downloading its public write-up from HackerOne first if we don't have it yet. */
export function getReport(id: number): Promise<ReportRow | undefined> {
  const running = inflight.get(id);
  if (running) return running;
  const p = loadReport(id).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

async function loadReport(id: number): Promise<ReportRow | undefined> {
  const get = () => db().prepare(
    `SELECT r.*, (SELECT logo_file FROM programs p WHERE p.name = COALESCE(r.program_name, r.program)) AS logo FROM reports r WHERE r.id = ?`
  ).get(id) as unknown as ReportRow | undefined;
  const r = get();
  if (!r || r.detail_at || waiting > 12) return r;
  try {
    const res = await politely(() => fetch(`https://hackerone.com/reports/${id}.json`, {
      headers: { Accept: "application/json", "User-Agent": "hexbrain/0.1" }, signal: AbortSignal.timeout(9000),
    }));
    if (res.status === 404 || res.status === 410) {
      // No longer public on HackerOne: remember that so we don't ask again on every view.
      db().prepare("UPDATE reports SET detail_at=?, detail_status=? WHERE id=?").run(new Date().toISOString(), res.status, id);
      return get();
    }
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return r;
    const j = await res.json(), sc = j.structured_scope || {};
    const pics = j.team?.profile_picture_urls || {}, pname = r.program_name || j.team?.profile?.name || j.team?.handle;
    if (pname) db().prepare(`INSERT INTO programs (name, handle, logo_url) VALUES (?,?,?) ON CONFLICT(name) DO UPDATE SET
      handle=COALESCE(excluded.handle, programs.handle), logo_url=COALESCE(excluded.logo_url, programs.logo_url)`).run(pname, j.team?.handle ?? null, pics.medium || pics.small || null);
    const summary = ((j.summaries || []) as { content?: string }[]).map((x) => x.content).filter(Boolean).join("\n\n") || null;
    db().prepare(
      `UPDATE reports SET body=?, summary=COALESCE(?,summary), asset_type=?, asset=?, detail_at=?, detail_status=200,
        severity=COALESCE(?,severity), disclosed_at=COALESCE(?,disclosed_at), submitted_at=COALESCE(?,submitted_at),
        reporter=COALESCE(?,reporter), program=COALESCE(?,program), cve_ids=COALESCE(?,cve_ids), weakness=COALESCE(weakness,?) WHERE id=?`
    ).run(j.vulnerability_information || null, summary, sc.asset_type ?? null, sc.asset_identifier ?? null, new Date().toISOString(),
      j.severity_rating ?? null, j.disclosed_at ?? null, j.submitted_at ?? null, j.reporter?.username ?? null,
      j.team?.handle ?? null, JSON.stringify(j.cve_ids || []), j.weakness?.name ?? null, id);
    return get();
  } catch {
    return r;
  }
}

export function relatedReports(r: ReportRow, n = 6) {
  return db().prepare(
    `SELECT id,title,${PROGRAM} AS program,severity,bounty,votes FROM reports WHERE ${WEAK} IS ? AND id != ? ORDER BY votes DESC LIMIT ?`
  ).all(r.weakness || r.weakness_guess || null, r.id, n) as unknown as Pick<ReportRow, "id" | "title" | "program" | "severity" | "bounty" | "votes">[];
}

export { PROGRAM as PROGRAM_SQL, WEAK as WEAK_SQL };
