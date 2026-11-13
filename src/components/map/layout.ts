// Geometry of the map. Everything here is in "world" units, fixed once per data load; the renderer only
// rotates, scales and pans it.
//
// The vulnerability map is a dial:
//   centre        the web of links between classes (reports that involve two classes at once)
//   inner ring    one node per vulnerability class
//   branches      from each class out to its weaknesses
//   strips        beyond that, every report as a dot, in a strip per weakness
//   bezel         an arc outside each class's strips, which its name hangs off
import type { Graph, Leaf } from "@/lib/db";

export const GOLD = 2.39996323;
export const TAU = Math.PI * 2;
export const R1 = 285;            // radius of the ring of class nodes
export const R0 = 400;            // radius where the weakness strips start
export const PITCH = 3.6;         // distance between neighbouring report dots in a strip
export const DOT0 = R0 + 10;      // radius of the first row of dots
// The Programs dial: every program is a strip, the biggest at the top and smaller ones down both sides. Logos sit on inner rings.
export const R0P = 560, DOT0P = R0P + 10;
const CLASS_GAP = 5, WEAK_GAP = 0.5; // empty space between classes and between strips, in dot columns

/** The measurements of a dial: radius of the node ring, radius where strips start, first row of dots, and the gap between dots. */
export type Geo = { R1: number; R0: number; DOT0: number; PITCH: number };
export const GEO_V: Geo = { R1, R0, DOT0, PITCH };
// The CVE dial holds far more dots, so it is larger and its dots sit closer together.
export const GEO_C: Geo = { R1: 520, R0: 760, DOT0: 772, PITCH: 1.6 };
export const BANDS = ["Exploited in the wild", "Ready check, not yet exploited", "Likely to be exploited (10% or more)", "Possible (1 to 10%)", "Unlikely (under 1%)"];
/** A strip with more dots than this stays a strip when opened: a disc of that many dots would not fit or draw smoothly. */
export const FLAT_OVER = 3000;
export type Lens = "classes" | "programs" | "cves";
export type CNode = {
  k: "cls"; id: string; name: string; count: number; bounty: number; tag: string;
  dial: "v" | "c";                                 // which dial it is on: vulnerabilities, or CVEs (where a "class" is a year)
  a: number; span: number; r: number; tip: number; weaks: WNode[]; shared: Map<CNode, number>;
  bz: number;                                      // radius its arc of the bezel is drawn at (it closes in when the class is opened)
};
export type WNode = {
  k: "weak"; name: string; count: number; bounty: number; tag: string; cls: CNode;
  band: number; flat: boolean;                    // on the CVE dial: which band of the year this is; and whether it is too big to open into a disc
  a: number; cols: number; rows: number; tip: number;
  branch: number[]; blen: number;                 // the curve from the class node to this strip, and its length
  discR: number; discAt: number; bloom: number;   // when opened, the strip's dots regroup into a disc
  // Every report is drawn from `n` and `sev` alone; `leaves` (ids, titles) arrive when the weakness is first opened.
  n: number; sev: string; leaves: LNode[]; loaded: boolean; loading: boolean;
};
export type LNode = { k: "leaf"; d: Leaf; i: number; w: WNode };
export type PNode = {
  k: "prog"; name: string; logo: string | null; count: number; bounty: number; tag: string; all: [string, number][];
  a: number; cols: number; rows: number; tip: number; // its strip on the Programs dial
  lr: number; la: number; ls: number;                 // its logo inside the ring: radius and angle it sits at, and its size
};
export type RNode = { k: "ring"; id: string; name: string };       // an id on the ring round the main dial
export type Node = CNode | WNode | LNode | PNode | RNode;
export type Link = { a: CNode; b: CNode; n: number; p: number[]; len: number };
export type Focus = { cls: CNode | null; weak: WNode | null; leaf: LNode | null; prog: PNode | null };
export const NONE: Focus = { cls: null, weak: null, leaf: null, prog: null };
/** One dial: its classes and their strips, the links between classes, and its measurements. */
export type Dial = { classes: CNode[]; weaks: WNode[]; links: Link[]; rb: number; gap: number; geo: Geo; cve: boolean };
export type Model = {
  classes: CNode[]; weaks: WNode[]; links: Link[]; progs: PNode[];
  rb: number;                                      // radius of the bezel
  rbp: number;                                     // radius of the bezel on the Programs dial
  cve: Dial; ring: RNode[];                         // the CVE dial, and the CVE ids that circle the main dial
  gap: number;                                     // half the angular gap between two classes
};

const pol = (r: number, a: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
export const angDiff = (a: number, b: number) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// Where each report sits once its weakness is opened: a sunflower disc, the same pattern for every weakness.
export const DISC = { x: new Float32Array(0), y: new Float32Array(0) };
export function ensureDisc(n: number) {
  if (DISC.x.length >= n) return;
  const size = Math.max(n, 256), x = new Float32Array(size), y = new Float32Array(size);
  for (let j = 0; j < size; j++) { const rr = 9 + 4.6 * Math.sqrt(j + 0.5); x[j] = Math.cos(j * GOLD) * rr; y[j] = Math.sin(j * GOLD) * rr; }
  DISC.x = x; DISC.y = y;
}
export const discRadius = (n: number) => 14 + 4.6 * Math.sqrt(n);

export const quadAt = (p: number[], t: number): [number, number] => {
  const u = 1 - t;
  return [u * u * p[0] + 2 * u * t * p[2] + t * t * p[4], u * u * p[1] + 2 * u * t * p[3] + t * t * p[5]];
};
export const cubicAt = (p: number[], t: number): [number, number] => {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p[0] + b * p[2] + c * p[4] + d * p[6], a * p[1] + b * p[3] + c * p[5] + d * p[7]];
};
const lengthOf = (at: (t: number) => [number, number]) => {
  let len = 0, prev = at(0);
  for (let i = 1; i <= 14; i++) { const q = at(i / 14); len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  return len;
};

type Group = { id: string; name: string; count: number; bounty: number; weaknesses: { name: string; count: number; bounty: number; sev: string; band?: number }[] };

/**
 * Places the classes of a dial round its ring and their strips beyond it.
 * A strip's width (in dot columns) grows with its count, but a little less than in proportion, so big strips also
 * grow outward and a one-dot strip still gets a column. With `leaf`, the biggest strip of a class sits in the
 * middle and the rest get smaller towards both edges; otherwise strips keep the order given.
 */
function placeDial(order: Group[], geo: Geo, dial: "v" | "c", nodeRadius: (count: number) => number, leaf: boolean) {
  const { R0, R1, DOT0, PITCH } = geo, MID = (R1 + R0) / 2;
  const all = order.flatMap((c) => c.weaknesses);
  const total = Math.floor((TAU * R0) / PITCH);
  const room = Math.max(all.length, total - order.length * CLASS_GAP - all.length * WEAK_GAP);
  const widths = (k: number) => all.map((w) => Math.max(1, Math.round(k * Math.pow(w.sev.length, 0.8))));
  let lo = 0, hi = 4;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (widths(mid).reduce((t, v) => t + v, 0) > room) hi = mid; else lo = mid; }
  const chosen = widths(lo), colsOf = new Map(all.map((w, i) => [w, chosen[i]]));
  const used = [...colsOf.values()].reduce((t, v) => t + v, 0) + all.length * WEAK_GAP;
  const classGap = order.length ? (total - used) / order.length : 0, unit = PITCH / R0;

  const classes: CNode[] = [], weaks: WNode[] = [];
  let cursor = 0;
  order.forEach((c, ci) => {
    const node: CNode = { k: "cls", id: c.id, name: c.name, count: c.count, bounty: c.bounty, tag: dial === "c" ? "Year" : "C-" + String(ci + 1).padStart(2, "0"), dial,
      a: 0, span: 0, r: nodeRadius(c.count), tip: 0, weaks: [], shared: new Map(), bz: 0 };
    let arranged = c.weaknesses;
    if (leaf) { arranged = []; [...c.weaknesses].sort((a, b) => b.count - a.count).forEach((w, i) => (i % 2 ? arranged.unshift(w) : arranged.push(w))); }
    const start = cursor;
    arranged.forEach((w) => {
      const cols = colsOf.get(w)!, n = w.sev.length, rows = Math.max(1, Math.ceil(n / cols)), flat = n > FLAT_OVER;
      const wn: WNode = { k: "weak", name: w.name, count: w.count, bounty: w.bounty, tag: "", cls: node, band: w.band ?? 0, flat,
        a: (cursor + cols / 2) * unit, cols, rows, tip: DOT0 + (rows - 0.5) * PITCH, branch: [], blen: 0,
        discR: flat ? 0 : discRadius(n), discAt: 0, bloom: 0, n, sev: w.sev, leaves: [], loaded: false, loading: false };
      wn.discAt = DOT0 + wn.discR + 4;
      cursor += cols + WEAK_GAP;
      node.weaks.push(wn); weaks.push(wn);
    });
    node.a = ((start + cursor - WEAK_GAP) / 2) * unit;
    node.span = (cursor - WEAK_GAP - start) * unit;
    node.tip = Math.max(DOT0, ...node.weaks.map((w) => w.tip));
    // Vulnerability strips are numbered by size; CVE bands by their order.
    if (dial === "c") node.weaks.forEach((w) => (w.tag = `Band ${w.band + 1}`));
    else [...node.weaks].sort((a, b) => b.count - a.count).forEach((w, i) => (w.tag = `W-${ci + 1}.${i + 1}`));
    cursor += classGap;
    classes.push(node);
  });
  ensureDisc(Math.max(1, ...weaks.filter((w) => !w.flat).map((w) => w.n)));

  // Turn the dial so its biggest class (or, for years, the first) is at the top.
  const lead = leaf ? [...classes].sort((a, b) => b.count - a.count)[0] : classes[0];
  const turn = lead ? -Math.PI / 2 - (leaf ? lead.a : lead.a - lead.span / 2 - (classGap * unit) / 2) : 0;
  for (const c of classes) c.a += turn;
  for (const w of weaks) {
    w.a += turn;
    const c = w.cls;
    w.branch = [...pol(R1 + c.r + 3, c.a), ...pol(MID + 12, c.a), ...pol(MID - 6, w.a), ...pol(R0 + 2, w.a)];
    w.blen = lengthOf((t) => cubicAt(w.branch, t));
  }
  return { classes, weaks, gap: (classGap * unit) / 2 };
}

export function build(graph: Graph): Model {
  // 1. Order the classes round the dial so that classes sharing many reports sit next to each other.
  const weight = new Map<string, number>();
  for (const [a, b, n] of graph.links) { weight.set(a + "|" + b, n); weight.set(b + "|" + a, n); }
  const pool = graph.classes.filter((c) => c.id !== "OTHER").sort((a, b) => b.count - a.count);
  const order = pool.splice(0, 1);
  while (pool.length) {
    const head = order[0], tail = order[order.length - 1];
    let best = 0, score = -1, atHead = false;
    pool.forEach((c, i) => {
      const t = weight.get(tail.id + "|" + c.id) || 0, h = weight.get(head.id + "|" + c.id) || 0;
      if (t > score) { score = t; best = i; atHead = false; }
      if (h > score) { score = h; best = i; atHead = true; }
    });
    const [c] = pool.splice(best, 1);
    if (atHead) order.unshift(c); else order.push(c);
  }
  const other = graph.classes.find((c) => c.id === "OTHER");
  if (other) order.push(other);

  const { classes, weaks, gap } = placeDial(order, GEO_V, "v", (n) => 8 + Math.sqrt(n) * 0.24, true);

  // 4. Links between classes run through the middle; the further apart two classes are, the closer to the centre.
  const by = Object.fromEntries(classes.map((c) => [c.id, c]));
  const links: Link[] = [];
  for (const [ia, ib, n] of graph.links) {
    const a = by[ia], b = by[ib];
    if (!a || !b) continue;
    const pa = pol(R1 - a.r - 3, a.a), pb = pol(R1 - b.r - 3, b.a), pull = 0.3 + 0.62 * (Math.abs(angDiff(a.a, b.a)) / Math.PI);
    const p = [...pa, ((pa[0] + pb[0]) / 2) * (1 - pull), ((pa[1] + pb[1]) / 2) * (1 - pull), ...pb];
    links.push({ a, b, n, p, len: lengthOf((t) => quadAt(p, t)) });
    a.shared.set(b, n); b.shared.set(a, n);
  }

  // 5. The Programs dial. Strip widths follow the same rule as weaknesses; the list arrives biggest first.
  const progs: PNode[] = graph.topPrograms.map((p, i) => ({
    k: "prog", name: p.name, logo: p.logo, count: p.count, bounty: p.bounty, tag: "P-" + String(i + 1).padStart(3, "0"), all: p.classes,
    a: 0, cols: 1, rows: 1, tip: 0, lr: 0, la: 0, ls: p.count >= 100 ? 27 : p.count >= 20 ? 21 : 16,
  }));
  const totalP = Math.floor((TAU * R0P) / PITCH), roomP = Math.max(progs.length, totalP - progs.length * 0.3);
  const pw = (k: number) => progs.map((p) => Math.max(1, Math.round(k * Math.pow(p.count, 0.9))));
  let plo = 0, phi = 4;
  for (let i = 0; i < 40; i++) { const mid = (plo + phi) / 2; if (pw(mid).reduce((t, v) => t + v, 0) > roomP) phi = mid; else plo = mid; }
  const pcols = pw(plo), gapP = progs.length ? (totalP - pcols.reduce((t, v) => t + v, 0)) / progs.length : 0, unitP = PITCH / R0P;
  // The biggest program sits at the top and the rest alternate down both sides, so the dial is balanced
  // and the long tail of one-report programs meets at the bottom.
  const round: PNode[] = [];
  progs.forEach((p, i) => { p.cols = pcols[i]; p.rows = Math.max(1, Math.ceil(p.count / p.cols)); p.tip = DOT0P + (p.rows - 0.5) * PITCH; if (i % 2) round.unshift(p); else round.push(p); });
  let at = 0;
  for (const p of round) { p.a = (at + p.cols / 2) * unitP; at += p.cols + gapP; }
  const turnP = progs.length ? -Math.PI / 2 - progs[0].a : 0;
  for (const p of progs) p.a += turnP;
  // Every program gets a logo inside the ring, as close to its own strip as there is room: bigger programs
  // choose first, and each takes the free spot nearest the point just inside its strip.
  const CELL = 64, grid = new Map<string, PNode[]>(), xy = new Map<PNode, [number, number]>();
  const free = (x: number, y: number, r: number) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++)
      for (const o of grid.get(i + "," + j) || []) { const q = xy.get(o)!; if (Math.hypot(q[0] - x, q[1] - y) < o.ls + r + 5) return false; }
    return true;
  };
  for (const p of progs) {
    let best: [number, number, number] | null = null, cost = Infinity;
    for (let r = R0P - 22 - p.ls; r > p.ls + 8 && R0P - r < cost; r -= 9) {
      const step = 9 / r;
      for (let n = 0; n * 9 < cost && n * step < 1.2; n++) for (const sg of n ? [1, -1] : [1]) {
        const a = p.a + sg * n * step, x = Math.cos(a) * r, y = Math.sin(a) * r, c = R0P - r + n * 9 * 1.6;
        if (c < cost && free(x, y, p.ls)) { cost = c; best = [r, a, 0]; }
      }
    }
    if (!best) continue; // no room left (does not happen at this size, but never loop for ever)
    p.lr = best[0]; p.la = best[1];
    const q = pol(p.lr, p.la); xy.set(p, q);
    const key = Math.floor(q[0] / CELL) + "," + Math.floor(q[1] / CELL);
    grid.set(key, [...(grid.get(key) || []), p]);
  }
  const rbp = Math.max(R0P + 60, ...progs.map((p) => p.tip)) + 20;

  const rb = Math.max(R0 + 60, ...classes.map((c) => c.tip)) + 20;
  for (const c of classes) c.bz = rb;
  // 6. The CVE dial: the same construction, where a "class" is a year and its strips are the five bands.
  const yearGroups = graph.cveYears.map((y) => ({
    id: String(y.year), name: String(y.year), count: y.bands.reduce((t, v) => t + v, 0), bounty: 0,
    weaknesses: y.bands.map((n, band) => ({ name: BANDS[band], count: n, bounty: 0, sev: String(4 - band).repeat(n), band })).filter((w) => w.count > 0),
  }));
  const cd = placeDial(yearGroups, GEO_C, "c", (n) => 9 + Math.sqrt(n) * 0.09, false);
  const cve: Dial = { classes: cd.classes, weaks: cd.weaks, links: [], rb: Math.max(GEO_C.R0 + 60, ...cd.classes.map((c) => c.tip)) + 22, gap: cd.gap, geo: GEO_C, cve: true };
  for (const c of cve.classes) c.bz = cve.rb;
  const ring: RNode[] = graph.cveRing.map((c) => ({ k: "ring", id: c.id, name: c.name }));

  return { classes, weaks, links, progs, rb, rbp, gap, cve, ring };
}
