// The CVE library: lookups by technology and by id, and a rough judgement of whether a version is affected.
import { db } from "./db";

export type Cve = {
  id: string; name: string | null; severity: string | null; description: string | null; impact: string | null; remediation: string | null;
  vendor: string | null; product: string | null; cpe: string | null; cvss: number | null; cwe: string | null; tags: string | null; verified: number;
  protocol: string | null; refs: string | null; template_path: string | null; template: string | null; check_summary: string | null;
  kev: number; kev_added: string | null; kev_ransomware: number; kev_action: string | null; epss: number | null; epss_pct: number | null;
};
const LIST = "id, name, severity, description, vendor, product, cpe, cvss, tags, verified, protocol, check_summary, template_path, kev, kev_added, kev_ransomware, epss, epss_pct, (template IS NOT NULL) AS has_check";
export type CveRow = Pick<Cve, "id" | "name" | "severity" | "description" | "vendor" | "product" | "cpe" | "cvss" | "tags" | "verified" | "protocol" | "check_summary" | "template_path" | "kev" | "kev_added" | "kev_ransomware" | "epss" | "epss_pct"> & { has_check: number };
const plain = <T,>(rows: unknown[]) => rows.map((r) => ({ ...(r as object) })) as T[];

export function getCve(id: string): Cve | undefined {
  const r = db().prepare("SELECT * FROM cves WHERE id = ?").get(id.toUpperCase());
  return r ? ({ ...r } as Cve) : undefined;
}
/** A CVE we hold no details for, only that it is registered and how likely it is to be exploited. */
export type CveStub = { id: string; epss: number | null; title: string | null; cvss: number | null; product: string | null; fixed: string | null; published: string | null };
/** A registered CVE we hold no check for: its likelihood of exploitation, and its headline and basic facts when cve.now has them. */
export function getCveStub(id: string): CveStub | undefined {
  const r = db().prepare("SELECT m.id, m.epss, i.title, i.cvss, i.product, i.fixed, i.published FROM cve_map m LEFT JOIN cve_info i ON i.id = m.id WHERE m.id = ?").get(id.toUpperCase());
  if (r) return { ...r } as CveStub;
  // Too new to have a likelihood score yet, but already listed.
  const fresh = db().prepare("SELECT id, NULL AS epss, title, cvss, product, fixed, published FROM cve_info WHERE id = ?").get(id.toUpperCase());
  return fresh ? ({ ...fresh } as CveStub) : undefined;
}
type Dot = [string, string, number, number, number, string];
/** The CVEs in one band of one month for the CVE map, most likely to be exploited first: [id, headline, band digit, 0, likelihood %, ""].
 *  `q` keeps only those whose id, headline or product contains the text. */
export function cveBand(year: number, month: number, band: number, o: { q?: string; offset?: number; limit?: number } = {}): { total: number; rows: Dot[] } {
  const q = (o.q || "").trim().slice(0, 80), pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  const from = "FROM cve_map m LEFT JOIN cves c ON c.id = m.id LEFT JOIN cve_info i ON i.id = m.id WHERE m.year = ? AND m.month = ? AND m.band = ?" +
    (q ? " AND (m.id LIKE ? ESCAPE '\\' OR COALESCE(c.name, i.title, '') LIKE ? ESCAPE '\\' OR COALESCE(i.product, c.product, '') LIKE ? ESCAPE '\\')" : "");
  const args = q ? [year, month, band, pattern, pattern, pattern] : [year, month, band];
  const limit = Math.min(Math.max(Math.trunc(o.limit || 0) || 60, 1), 1500), offset = Math.max(Math.trunc(o.offset || 0) || 0, 0);
  const total = (db().prepare(`SELECT COUNT(*) n ${from}`).get(...args) as { n: number }).n;
  const rows = db().prepare(`SELECT m.id, COALESCE(c.name, i.title) AS name, m.epss ${from} ORDER BY m.pos LIMIT ? OFFSET ?`).all(...args, limit, offset) as { id: string; name: string | null; epss: number | null }[];
  return { total, rows: rows.map((r) => [r.id, r.name || "", 4 - band, 0, Math.round((r.epss || 0) * 1000) / 10, ""]) };
}
/** Every CVE known to be exploited, newest listing first: [id, headline, year, month, has a ready check, likelihood %]. They are drawn inside the CVE index. */
export function cveCore(): [string, string, number, number, number, number][] {
  const rows = db().prepare(`SELECT c.id, COALESCE(c.name, i.title, '') AS name, m.year, m.month, (c.template IS NOT NULL) AS chk, m.epss
    FROM cves c JOIN cve_map m ON m.id = c.id LEFT JOIN cve_info i ON i.id = c.id WHERE c.kev = 1 AND m.band = 0 ORDER BY c.kev_added DESC, m.epss DESC`).all() as { id: string; name: string; year: number; month: number; chk: number; epss: number | null }[];
  return rows.map((r) => [r.id, r.name.length > 70 ? r.name.slice(0, 68) + "…" : r.name, r.year, r.month, r.chk ? 1 : 0, Math.round((r.epss || 0) * 1000) / 10]);
}
export function cveStats() {
  return { ...(db().prepare("SELECT COUNT(*) total, COALESCE(SUM(template IS NOT NULL),0) with_check, COALESCE(SUM(kev),0) exploited, COALESCE(SUM(kev AND template IS NOT NULL),0) exploited_with_check, (SELECT COUNT(*) FROM cve_map) registered FROM cves").get() as object) } as { total: number; with_check: number; exploited: number; exploited_with_check: number; registered: number };
}
export function topCves(limit: number): CveRow[] {
  return plain<CveRow>(db().prepare(`SELECT ${LIST} FROM cves WHERE kev = 1 AND template IS NOT NULL ORDER BY kev_added DESC, epss DESC LIMIT ?`).all(limit));
}
export function cveProducts(limit: number) {
  return plain<{ product: string; vendor: string | null; n: number }>(db().prepare("SELECT product, vendor, COUNT(*) n FROM cves WHERE product IS NOT NULL AND template IS NOT NULL GROUP BY product ORDER BY n DESC LIMIT ?").all(limit));
}
export function cveIds(): string[] {
  return (db().prepare("SELECT id FROM cves WHERE template IS NOT NULL OR kev = 1").all() as { id: string }[]).map((r) => r.id);
}

/** Splits "apache http server 2.4.49" into the name and the version. */
export function parseTech(input: string): { name: string; version: string | null } {
  const t = input.slice(0, 100); // long input has no meaning here and would make the pattern below slow
  const m = t.trim().match(/^(.*?)[\s/@:v-]*?(\d+(?:\.\d+)+[\w.-]*)\s*$/);
  return m && m[1].trim() ? { name: m[1].trim(), version: m[2] } : { name: t.trim(), version: null };
}
const parts = (v: string) => v.split(/[.\-_]/).map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
function compareVersions(a: string, b: string): number {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}
/** Whether `version` looks affected, from version limits stated in the CVE's name, description and product identifier. An estimate only. */
export function looksAffected(version: string, c: { name: string | null; description: string | null; cpe: string | null }): "likely" | "unlikely" | "unknown" {
  const exact = c.cpe?.split(":")[5];
  if (exact && /^\d/.test(exact)) return compareVersions(version, exact) === 0 ? "likely" : "unknown";
  const text = `${c.name || ""}. ${c.description || ""}`;
  let verdict: "likely" | "unlikely" | "unknown" = "unknown";
  const note = (hit: boolean) => { if (hit) verdict = "likely"; else if (verdict === "unknown") verdict = "unlikely"; };
  for (const m of text.matchAll(/(before|prior to|earlier than|below|<=|<|up to and including|up to|through|until)\s*(?:version\s*)?v?(\d+(?:\.\d+)+)/gi)) {
    const inclusive = /<=|including|through|up to|until/i.test(m[1]) && !/^</.test(m[1]) || m[1] === "<=";
    const c2 = compareVersions(version, m[2]);
    note(inclusive ? c2 <= 0 : c2 < 0);
  }
  for (const m of text.matchAll(/v?(\d+(?:\.\d+)+)\s*(?:and|or)\s*(?:earlier|below|prior|older)/gi)) note(compareVersions(version, m[1]) <= 0);
  if (verdict === "unknown") { const named = (c.name || "").match(/\b(\d+\.\d+(?:\.\d+)*)\b/); if (named) verdict = compareVersions(version, named[1]) === 0 ? "likely" : "unknown"; }
  return verdict;
}

// Everyday names for products whose catalogue name is different.
const ALIASES: Record<string, string> = {
  apache: "http_server", "apache httpd": "http_server", httpd: "http_server", "apache http server": "http_server", iis: "internet_information_services",
  "apache tomcat": "tomcat", "apache struts": "struts", "apache solr": "solr", "apache druid": "druid", "apache airflow": "airflow", "apache ofbiz": "ofbiz",
  exchange: "exchange_server", "microsoft exchange": "exchange_server", sharepoint: "sharepoint_server", confluence: "confluence_server", jira: "jira_server",
  gitlab: "gitlab", "spring boot": "spring_boot", "spring framework": "spring_framework", weblogic: "weblogic_server", "f5 big-ip": "big-ip_access_policy_manager",
};
/** True when the CVE is in the very product the name refers to, so comparing versions makes sense. */
export function sameProduct(name: string, c: { product: string | null; vendor?: string | null }): boolean {
  const n = name.toLowerCase().trim(), product = (c.product || "").toLowerCase();
  if (!product) return false;
  if (ALIASES[n]) return product === ALIASES[n];
  const flat = product.replace(/[_-]/g, " "), words = n.split(/[^a-z0-9.+#]+/).filter(Boolean), parts = flat.split(" ");
  if (flat === n || product === words.join("_") || (words.length > 1 && words.every((w) => parts.includes(w)))) return true;
  // "fortinet fortios" is the product "fortios" by the vendor "fortinet": the vendor's name in front changes nothing.
  const vendor = (c.vendor || "").toLowerCase().replace(/[_-]/g, " ").split(" ").filter(Boolean);
  return vendor.length > 0 && parts.every((w) => words.includes(w)) && words.every((w) => parts.includes(w) || vendor.includes(w));
}

export type KnownCve = { id: string; title: string | null; cvss: number | null; product: string | null; fixed: string | null; kev: number; published: string | null };
/** CVEs that name a product, from the full list of registered CVEs (no check is stored for these): exploited first, then the most severe and newest. */
export function knownFor(name: string, limit: number, skip: string[] = []): { total: number; rows: KnownCve[] } {
  const words = name.toLowerCase().split(/[^a-z0-9.+#]+/).filter((w) => w.length > 1).slice(0, 4);
  if (!words.length) return { total: 0, rows: [] };
  // Every word must be in the product's name. The word index answers in a few milliseconds, where reading all 400,000 rows would not.
  const match = `{product} : (${words.map((w) => `"${w.replace(/"/g, "")}"`).join(" ")})`;
  const got = plain<KnownCve & { total: number }>(db().prepare(`SELECT i.id, i.title, i.cvss, i.product, i.fixed, i.kev, i.published, COUNT(*) OVER () AS total
    FROM cve_info_fts f JOIN cve_info i ON i.rowid = f.rowid WHERE cve_info_fts MATCH ? ORDER BY i.kev DESC, (i.cvss IS NULL), i.cvss DESC, i.published DESC LIMIT ?`).all(match, limit + skip.length));
  const total = got[0]?.total ?? 0, rows: KnownCve[] = got.map((r) => ({ id: r.id, title: r.title, cvss: r.cvss, product: r.product, fixed: r.fixed, kev: r.kev, published: r.published }));
  return { total, rows: rows.filter((r) => !skip.includes(r.id)).slice(0, limit) };
}

/** CVEs for one technology name: exact product or vendor matches first, then anything that mentions it. */
export function cvesFor(name: string, limit: number): CveRow[] {
  const words = name.toLowerCase().split(/[^a-z0-9.+#]+/).filter((w) => w.length > 1).slice(0, 5);
  if (!words.length) return [];
  const alias = ALIASES[name.toLowerCase().trim()];
  const under = alias || words.join("_"), spaced = words.join(" ");
  const exact = plain<CveRow>(db().prepare(`SELECT ${LIST} FROM cves WHERE product IN (?, ?, ?) OR vendor IN (?, ?, ?) ORDER BY kev DESC, epss DESC LIMIT ?`).all(under, spaced, words.join("-"), under, spaced, words.join("-"), limit));
  if (exact.length >= limit) return exact;
  const seen = new Set(exact.map((r) => r.id));
  const fts = `{name vendor product tags} : (${words.map((w) => `"${w.replace(/"/g, "")}"`).join(" ")})`;
  const more = plain<CveRow>(db().prepare(`SELECT ${LIST.replace(/\b(id|name|severity|description|vendor|product|cpe|cvss|tags|verified|protocol|check_summary|template_path|kev|kev_added|kev_ransomware|epss|epss_pct|template)\b/g, "c.$1")} FROM cves_fts JOIN cves c ON c.rowid = cves_fts.rowid WHERE cves_fts MATCH ? ORDER BY c.kev DESC, c.epss DESC LIMIT ?`).all(fts, limit * 3));
  return [...exact, ...more.filter((r) => !seen.has(r.id))].slice(0, limit * 3);
}

/** CVEs for the search box: by id when the text looks like one, otherwise by the words in its headline or product. Exploited first, then the most severe. */
export function findCves(text: string, limit = 6): { id: string; title: string | null; cvss: number | null; product: string | null; kev: number }[] {
  const q = text.trim().slice(0, 80), cols = "i.id, i.title, i.cvss, i.product, i.kev";
  if (/^cve-\d{4}-\d*$/i.test(q)) // an id, or the start of one
    return plain(db().prepare(`SELECT ${cols} FROM cve_info i WHERE i.id >= ? AND i.id < ? ORDER BY length(i.id), i.id LIMIT ?`).all(q.toUpperCase(), q.toUpperCase() + "\uffff", limit));
  const words = q.toLowerCase().split(/[^\p{L}\p{N}_.+#]+/u).map((w) => w.replace(/^[.+#]+|[.+#]+$/g, "")).filter((w) => w.length > 1).slice(0, 6);
  if (!words.length) return [];
  const match = words.map((w, i) => `"${w.replace(/"/g, "")}"${i === words.length - 1 ? "*" : ""}`).join(" ");
  return plain(db().prepare(`SELECT ${cols} FROM cve_info_fts f JOIN cve_info i ON i.rowid = f.rowid WHERE cve_info_fts MATCH ? ORDER BY i.kev DESC, round(bm25(cve_info_fts, 8.0, 1.0), 1), (i.cvss IS NULL), i.cvss DESC LIMIT ?`).all(match, limit)); // a match in the product's name counts for more than one in the headline
}
