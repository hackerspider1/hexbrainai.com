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
export function getCveStub(id: string): { id: string; epss: number | null } | undefined {
  const r = db().prepare("SELECT id, epss FROM cve_map WHERE id = ?").get(id.toUpperCase());
  return r ? ({ ...r } as { id: string; epss: number | null }) : undefined;
}
/** The CVEs in one band of one year for the CVE map, most likely to be exploited first: [id, name, band digit, 0, likelihood %, ""]. */
export function cveBand(year: number, band: number, limit = 3000): [string, string, number, number, number, string][] {
  const rows = db().prepare(
    "SELECT m.id, c.name, m.epss FROM cve_map m LEFT JOIN cves c ON c.id = m.id WHERE m.year = ? AND m.band = ? ORDER BY m.pos LIMIT ?"
  ).all(year, band, limit) as { id: string; name: string | null; epss: number | null }[];
  return rows.map((r) => [r.id, r.name || "", 4 - band, 0, Math.round((r.epss || 0) * 1000) / 10, ""]);
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
export function parseTech(t: string): { name: string; version: string | null } {
  const m = t.trim().match(/^(.*?)[\s/@:v-]*?(\d+(?:\.\d+)+[\w.-]*)\s*$/);
  return m && m[1].trim() ? { name: m[1].trim(), version: m[2] } : { name: t.trim(), version: null };
}
const parts = (v: string) => v.split(/[.\-_]/).map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));
export function compareVersions(a: string, b: string): number {
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
export function sameProduct(name: string, c: { product: string | null }): boolean {
  const n = name.toLowerCase().trim(), product = (c.product || "").toLowerCase();
  if (!product) return false;
  if (ALIASES[n]) return product === ALIASES[n];
  const flat = product.replace(/[_-]/g, " "), words = n.split(/[^a-z0-9.+#]+/).filter(Boolean);
  return flat === n || product === words.join("_") || (words.length > 1 && words.every((w) => flat.split(" ").includes(w)));
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
