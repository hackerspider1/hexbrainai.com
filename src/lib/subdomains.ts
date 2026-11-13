// Subdomains known for a program (from ProjectDiscovery's Chaos public dataset). Counts live in the database;
// the names are one compressed text file per program in data/subdomains, read when someone opens that program.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { db } from "@/lib/db";

const dir = join(dirname(process.env.HEXBRAIN_DB || join(process.cwd(), "data", "hexbrain.db")), "subdomains");
const fileOf = (handle: string) => join(dir, handle + ".txt.gz");

export type Surface = { handle: string; total: number; roots: [string, number][]; branches: Branch[]; updated: string | null };
/** One spoke of the dial: a root domain, or (for a program with a single root) the first label under it. */
export type Branch = { name: string; suffix: string; count: number };

export function surfaceOf(programName: string): Surface | null {
  const row = db().prepare(`SELECT a.handle, a.total, a.roots, a.branches, a.source_updated FROM program_assets a
    WHERE a.handle = (SELECT lower(program) FROM reports WHERE program_name = ? AND program IS NOT NULL LIMIT 1)`).get(programName) as
    { handle: string; total: number; roots: string; branches: string; source_updated: string | null } | undefined;
  if (!row || !/^[\w-]+$/.test(row.handle) || !existsSync(fileOf(row.handle))) return null;
  let roots: [string, number][] = [], branches: Branch[] = [];
  try { roots = JSON.parse(row.roots); branches = (JSON.parse(row.branches) as [string, string, number][]).map(([name, suffix, count]) => ({ name, suffix, count })); } catch { /* shown without a breakdown */ }
  return { handle: row.handle, total: row.total, roots, branches, updated: row.source_updated };
}

/** The compressed file as stored, for sending as a download without unpacking it. */
export const packed = (handle: string) => readFileSync(fileOf(handle));

// A few programs have hundreds of thousands of names, so only the most recently opened lists are kept in memory.
const lists = new Map<string, string[]>(), KEEP_NAMES = 1_500_000; // about as many names as all programs hold together
export function hosts(handle: string): string[] {
  let list = lists.get(handle);
  if (list) lists.delete(handle);
  else list = gunzipSync(packed(handle)).toString("utf8").split("\n").filter(Boolean);
  lists.set(handle, list);
  let held = 0; for (const l of lists.values()) held += l.length;
  for (const [k, l] of lists) { if (held <= KEEP_NAMES || k === handle) break; lists.delete(k); held -= l.length; }
  return list;
}

const under = (host: string, suffix: string) => host === suffix || host.endsWith("." + suffix);
/** Names under a domain (all of them when no domain is given), optionally only those containing some text. */
export function pick(handle: string, suffix: string, q: string): string[] {
  const all = hosts(handle), s = suffix.toLowerCase(), needle = q.toLowerCase();
  return s || needle ? all.filter((h) => (!s || under(h, s)) && (!needle || h.includes(needle))) : all;
}

