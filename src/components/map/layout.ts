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
const CLASS_GAP = 5, WEAK_GAP = 0.5; // empty space between classes and between strips, in dot columns

/** The measurements of a dial: radius of the node ring, radius where strips start, first row of dots, and the gap between dots. */
export type Geo = { R1: number; R0: number; DOT0: number; PITCH: number; grow?: number; classGap?: number; compact?: boolean };
// grow: how fast a strip widens with its count (0.8 unless given). classGap: empty columns between classes (5 unless given).
// compact: never let a strip grow much wider than it is tall. A dial with little in it then keeps neat strips and
// spreads its classes out, instead of stretching a few strips round the whole ring.
export const GEO_V: Geo = { R1, R0, DOT0, PITCH };
// The CVE index: a key per year and a strip per month, every CVE a dot. It holds far more dots than the other dials,
// so it is larger, its dots sit closer together, and its strips widen slowly so that the ring reads as a skyline.
const GEO_Y: Geo = { R1: 1000, R0: 1100, DOT0: 1110, PITCH: 1.3, grow: 0.55, classGap: 64 }; // the gap leaves room for every year's key, however few CVEs it has
const YEAR_R = 40;                // radius of a year's key
/** A band's strip on a year's dial draws at most this many of its CVEs, so it can still open into a disc. */
export const CVE_DOTS = 1500;
const MONTHS = ["No date", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON = ["n/d", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// The Programs dial is an index: a hub per letter, a strip per program, and every program's logo on rings inside.
// Strips widen slowly with size, so the big programs stand tall and the ring reads as a skyline.
const GEO_P: Geo = { R1: 700, R0: 800, DOT0: 810, PITCH: 3.6, grow: 0.55 };
const LETTER_R = 34;              // radius of a letter's hub
/** A domain's strip draws at most this many of its subdomains as dots, so it can still open into a disc. */
export const SURFACE_DOTS = 1500;
const DOMAIN_PK = 0.42;           // subdomain dots sit this much closer together than report dots: a finer texture, and room for many more
const BANDS = ["Exploited in the wild", "Ready check, not yet exploited", "Likely to be exploited (10% or more)", "Possible (1 to 10%)", "Unlikely (under 1%)"];
/** A strip with more dots than this stays a strip when opened: a disc of that many dots would not fit or draw smoothly. */
const FLAT_OVER = 3000;
export type Lens = "classes" | "programs" | "cves";
export type CNode = {
  k: "cls"; id: string; name: string; count: number; bounty: number; tag: string;
  // Which dial it is on: vulnerabilities; the Programs index (a "class" is a letter) or a letter's own dial (a program);
  // the CVE index (a year) or a year's own dial (a month).
  dial: "v" | "c" | "y" | "p" | "s";
  short?: string;                                  // what is written inside its node, when that is not its id ("24", "Mar")
  hot?: number;                                    // on the CVE dials: how many of its CVEs are exploited in the wild
  prog?: PNode;                                    // on a letter's dial: the program this hub stands for
  group?: CNode;                                   // on a letter's or a year's dial: the letter or year it belongs to
  sub?: Dial;                                      // on an index: the dial this letter or year opens into
  a: number; span: number; r: number; tip: number; weaks: WNode[]; shared: Map<CNode, number>;
  bz: number;                                      // radius its arc of the bezel is drawn at (it closes in when the class is opened)
};
export type WNode = {
  k: "weak"; name: string; count: number; bounty: number; tag: string; cls: CNode;
  band: number; flat: boolean;                    // on the CVE dial: which band of the year this is; and whether it is too big to open into a disc
  a: number; cols: number; rows: number; tip: number;
  branch: number[]; blen: number;                 // the curve from the class node to this strip, and its length
  discR: number; discAt: number; bloom: number;   // when opened, the strip's dots regroup into a disc
  pk: number;                                     // spacing of its dots, as a share of the dial's: under 1 for the finer subdomain strips
  plain: boolean;                                 // drawn in one tone, and only the dots on screen (CVE bands, subdomains)
  unit?: string;                                  // what one dot is, when it differs from the rest of the dial ("subdomain")
  runs?: [tone: number, dots: number][];          // on the CVE index: a month's dots by band, most serious first, each drawn in its own tone
  cid?: string;                                   // on a letter's dial: the vulnerability class this strip of a program's reports is
  hub?: CNode;                                    // on an index: the hub this strip stands for on the dial below (a program, a month), which a click goes to
  // Every report is drawn from `n` and `sev` alone; `leaves` (ids, titles) arrive when the weakness is first opened.
  n: number; sev: string; leaves: LNode[]; loaded: boolean; loading: boolean;
};
export type LNode = { k: "leaf"; d: Leaf; i: number; w: WNode };
export type PNode = {
  k: "prog"; name: string; logo: string | null; count: number; bounty: number; tag: string; all: [string, number][];
  hub?: CNode; strip?: WNode;                         // its hub on its letter's dial, and its strip on the Programs index
  orbit: number; oa: number; os: number;              // its logo inside the index: which ring it rides, its place on that ring, and its size
  surface: number;                                    // how many of its subdomains are known
};
export type RNode = { k: "ring"; id: string; name: string };       // an id on the ring round the main dial
/** A CVE known to be exploited, drawn as a dot in its year's bunch inside the CVE index. */
export type XNode = { k: "x"; id: string; name: string; year: number; month: number; check: boolean; likely: number; hub: CNode; x: number; y: number };
export type Node = CNode | WNode | LNode | PNode | RNode | XNode;
export type Link = { a: CNode; b: CNode; n: number; p: number[]; len: number };
// `group` is the letter whose dial is showing, in the Programs view. `prog` is a program marked on the vulnerability dial.
export type Focus = { group: CNode | null; cls: CNode | null; weak: WNode | null; leaf: LNode | null; prog: PNode | null };
export const NONE: Focus = { group: null, cls: null, weak: null, leaf: null, prog: null };
/** One dial: its classes and their strips, the links between classes, and its measurements. */
export type Dial = { classes: CNode[]; weaks: WNode[]; links: Link[]; rb: number; gap: number; geo: Geo; kind: CNode["dial"] };
export type Model = {
  classes: CNode[]; weaks: WNode[]; links: Link[]; progs: PNode[];
  rb: number;                                      // radius of the bezel
  cve: Dial; ring: RNode[];                         // the CVE index (each year carries its own dial in `sub`), and the CVE ids that circle the main dial
  cveTotal: number; cveHot: number;                // how many CVEs are registered, and how many are exploited in the wild
  core: XNode[]; bunches: Map<CNode, { at: number; r: number }>; // the exploited CVEs inside the CVE index (they arrive when that view first opens), and where each year's bunch hangs
  programs: Dial;                                  // the Programs index; each of its letters carries its own dial in `sub`
  orbits: { r: number; n: number }[];              // the rings of logos inside the index: radius, and how many logos ride each
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

type Strip = { name: string; count: number; bounty: number; sev: string; band?: number; pk?: number; plain?: boolean; unit?: string; cid?: string; gap?: number; runs?: [number, number][] };
type Group = { id: string; name: string; count: number; bounty: number; weaknesses: Strip[] };

/**
 * Places the classes of a dial round its ring and their strips beyond it.
 * A strip's width (in dot columns) grows with its count, but a little less than in proportion, so big strips also
 * grow outward and a one-dot strip still gets a column. With `leaf`, the biggest strip of a class sits in the
 * middle and the rest get smaller towards both edges; otherwise strips keep the order given.
 */
function placeDial(order: Group[], geo: Geo, dial: CNode["dial"], nodeRadius: (count: number) => number, leaf: boolean) {
  const { R0, R1, DOT0, PITCH } = geo, MID = (R1 + R0) / 2, grow = geo.grow ?? 0.8, GAP = geo.classGap ?? CLASS_GAP;
  const all = order.flatMap((c) => c.weaknesses);
  const total = Math.floor((TAU * R0) / PITCH);
  const room = Math.max(all.length, total - order.length * GAP - all.length * WEAK_GAP - all.reduce((t, w) => t + (w.gap || 0), 0));
  // Widths are in columns of the dial's own dot spacing; a finer strip packs more dots into the same width.
  const most = (w: Strip) => (geo.compact ? Math.max(1, Math.min(w.sev.length, Math.ceil(1.5 * Math.sqrt(w.sev.length * (w.pk ?? 1) ** 2)))) : Infinity);
  const widths = (k: number) => all.map((w) => Math.min(most(w), Math.max(1, Math.round(k * Math.pow(w.sev.length * (w.pk ?? 1) ** 2, grow)))));
  let lo = 0, hi = 4;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (widths(mid).reduce((t, v) => t + v, 0) > room) hi = mid; else lo = mid; }
  const chosen = widths(lo), colsOf = new Map(all.map((w, i) => [w, chosen[i]]));
  const used = [...colsOf.values()].reduce((t, v) => t + v, 0) + all.length * WEAK_GAP + all.reduce((t, w) => t + (w.gap || 0), 0);
  const classGap = order.length ? (total - used) / order.length : 0, unit = PITCH / R0;

  const classes: CNode[] = [], weaks: WNode[] = [];
  let cursor = 0;
  order.forEach((c, ci) => {
    const node: CNode = { k: "cls", id: c.id, name: c.name, count: c.count, bounty: c.bounty, tag: dial === "y" ? "Year" : dial === "c" ? "Month" : dial === "p" ? "Letter" : dial === "s" ? "Program" : "C-" + String(ci + 1).padStart(2, "0"), dial,
      a: 0, span: 0, r: nodeRadius(c.count), tip: 0, weaks: [], shared: new Map(), bz: 0 };
    let arranged = c.weaknesses;
    if (leaf) { arranged = []; [...c.weaknesses].sort((a, b) => b.count - a.count).forEach((w, i) => (i % 2 ? arranged.unshift(w) : arranged.push(w))); }
    const start = cursor;
    arranged.forEach((w) => {
      const width = colsOf.get(w)!, pk = w.pk ?? 1, cols = Math.max(1, Math.round(width / pk)), n = w.sev.length, rows = Math.max(1, Math.ceil(n / cols)), flat = n > FLAT_OVER;
      cursor += w.gap || 0;
      const wn: WNode = { k: "weak", name: w.name, count: w.count, bounty: w.bounty, tag: "", cls: node, band: w.band ?? 0, flat,
        pk, plain: w.plain ?? (dial === "c" || dial === "y"), unit: w.unit, cid: w.cid, runs: w.runs,
        a: (cursor + width / 2) * unit, cols, rows, tip: DOT0 + (rows - 0.5) * PITCH * pk, branch: [], blen: 0,
        discR: flat ? 0 : discRadius(n), discAt: 0, bloom: 0, n, sev: w.sev, leaves: [], loaded: false, loading: false };
      wn.discAt = DOT0 + wn.discR + 4;
      cursor += width + WEAK_GAP;
      node.weaks.push(wn); weaks.push(wn);
    });
    node.a = ((start + cursor - WEAK_GAP) / 2) * unit;
    node.span = (cursor - WEAK_GAP - start) * unit;
    node.tip = Math.max(DOT0, ...node.weaks.map((w) => w.tip));
    // Vulnerability strips are numbered by size; CVE bands by their order.
    if (dial === "c") node.weaks.forEach((w) => (w.tag = `Band ${w.band + 1}`));
    else if (dial === "v") [...node.weaks].sort((a, b) => b.count - a.count).forEach((w, i) => (w.tag = `W-${ci + 1}.${i + 1}`));
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

  // 5. Programs. Each one appears three times: as a strip on the index, as a logo on the rings inside it, and as a
  // hub on its letter's dial.
  const progs: PNode[] = graph.topPrograms.map((p, i) => ({
    k: "prog", name: p.name, logo: p.logo, count: p.count, bounty: p.bounty, tag: "P-" + String(i + 1).padStart(3, "0"), all: p.classes,
    orbit: 0, oa: 0, os: 0, surface: 0,
  }));
  const byName = new Map(progs.map((p) => [p.name, p]));

  const rb = Math.max(R0 + 60, ...classes.map((c) => c.tip)) + 20;
  for (const c of classes) c.bz = rb;
  // 6. The CVE index: a key per year, clockwise from the first, and a strip per month. A month's dots are its CVEs with
  // the most serious first, so each strip is red at its root, then bright, then fades.
  const sum = (v: number[]) => v.reduce((t, x) => t + x, 0);
  const years = [...graph.cveYears].sort((a, b) => a.year - b.year);
  const monthsOf = (y: Graph["cveYears"][number]) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0].filter((m) => sum(y.months[m]) > 0);
  const yd = placeDial(years.map((y) => ({
    id: String(y.year), name: String(y.year), count: sum(y.months.map(sum)), bounty: 0,
    weaknesses: monthsOf(y).map((m) => {
      const runs = y.months[m].map((n, band) => [4 - band, n] as [number, number]).filter((r) => r[1] > 0);
      return { name: `${MONTHS[m]} ${y.year}`, count: sum(y.months[m]), bounty: 0, band: m, runs, sev: runs.map(([tone, n]) => String(tone).repeat(n)).join("") };
    }),
  })), GEO_Y, "y", () => YEAR_R, false);
  const cve: Dial = { classes: yd.classes, weaks: yd.weaks, links: [], rb: Math.max(GEO_Y.R0 + 60, ...yd.classes.map((c) => c.tip)) + 22, gap: yd.gap, geo: GEO_Y, kind: "y" };
  for (const w of cve.weaks) w.tag = MON[w.band];
  // Each year opens into a dial of its own, read like a clock: a hub per month from January at the top, and for strips
  // the five bands. Exploited and ready-to-check CVEs are drawn large; the rest in a finer, dimmer texture.
  years.forEach((y, yi) => {
    const yearHub = cve.classes[yi];
    yearHub.bz = cve.rb; yearHub.short = String(y.year).slice(2); yearHub.hot = sum(y.months.map((m) => m[0]));
    const groups: Group[] = monthsOf(y).map((m) => {
      const strips: Strip[] = [4, 3, 2, 1, 0].filter((band) => y.months[m][band] > 0).map((band) => ({
        name: BANDS[band], count: y.months[m][band], bounty: 0, band, plain: true, pk: band <= 1 ? 1 : DOMAIN_PK, sev: String(4 - band).repeat(Math.min(y.months[m][band], CVE_DOTS)),
      }));
      const firstBig = strips.findIndex((x) => (x.band ?? 9) <= 1); // a clear step between the mass and the CVEs worth acting on
      if (firstBig > 0) strips[firstBig] = { ...strips[firstBig], gap: 7 };
      return { id: `${y.year}-${String(m).padStart(2, "0")}`, name: m ? MONTHS[m] : "No date", count: sum(y.months[m]), bounty: 0, weaknesses: strips };
    });
    const strips = groups.flatMap((x) => x.weaknesses), weight = strips.reduce((t, w) => t + Math.pow(w.sev.length * (w.pk ?? 1) ** 2, 0.8), 0), GAP = 13;
    const cols = groups.length * GAP + strips.length * WEAK_GAP + strips.reduce((t, w) => t + (w.gap || 0), 0) + Math.max(strips.length * 1.6, weight * 0.3);
    const r0 = Math.min(980, Math.max(320, (cols * PITCH) / TAU)), geo: Geo = { R1: r0 - 118, R0: r0, DOT0: r0 + 10, PITCH, classGap: GAP, compact: true };
    const md = placeDial(groups, geo, "c", () => 24, false);
    const sub: Dial = { classes: md.classes, weaks: md.weaks, links: [], rb: Math.max(geo.R0 + 60, ...md.classes.map((c) => c.tip)) + 22, gap: md.gap, geo, kind: "c" };
    sub.classes.forEach((hub) => {
      const m = Number(hub.id.slice(5));
      hub.bz = sub.rb; hub.group = yearHub; hub.short = MON[m]; hub.hot = y.months[m][0];
      const strip = yearHub.weaks.find((w) => w.band === m);
      if (strip) strip.hub = hub;
    });
    yearHub.sub = sub;
  });
  const ring: RNode[] = graph.cveRing.map((c) => ({ k: "ring", id: c.id, name: c.name }));

  // 7. The Programs index: a hub per letter, clockwise from A at the top, and a strip per program in name order.
  const surfOf = new Map(graph.surfaces.map((x) => [x.program, x]));
  const className = new Map(graph.classes.map((c) => [c.id, c.name]));
  const letterOf = (name: string) => { const ch = name.trim().charAt(0).toUpperCase(); return ch >= "A" && ch <= "Z" ? ch : "#"; };
  const byLetter = new Map<string, Graph["topPrograms"]>();
  for (const p of [...graph.topPrograms].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))) {
    const l = letterOf(p.name);
    byLetter.set(l, [...(byLetter.get(l) || []), p]);
  }
  const lettersInOrder = [...byLetter.keys()].sort((a, b) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)));
  // A program's strip on the index shows its reports brightest first, so each strip glows at its root.
  const sevOf = (p: Graph["topPrograms"][number]) => p.byClass.map((x) => x[1]).join("").split("").sort().reverse().join("");
  const pd = placeDial(lettersInOrder.map((l) => {
    const list = byLetter.get(l)!;
    return { id: l, name: l, count: list.reduce((t, p) => t + p.count, 0), bounty: list.reduce((t, p) => t + p.bounty, 0),
      weaknesses: list.map((p) => ({ name: p.name, count: p.count, bounty: p.bounty, sev: sevOf(p) })) };
  }), GEO_P, "p", () => LETTER_R, false);
  const programs: Dial = { classes: pd.classes, weaks: pd.weaks, links: [], rb: Math.max(GEO_P.R0 + 60, ...pd.classes.map((c) => c.tip)) + 22, gap: pd.gap, geo: GEO_P, kind: "p" };
  for (const c of programs.classes) c.bz = programs.rb;
  for (const w of programs.weaks) { const p = byName.get(w.name)!; w.tag = p.tag; p.strip = w; }

  // 8. Each letter opens into a dial of its own, built like the vulnerability dial: a hub per program, and for strips
  // what was reported to it (one per class) followed by where to look (one per domain, in a finer, dimmer texture).
  const peaked = <T extends { count: number }>(list: T[]) => { const out: T[] = []; [...list].sort((a, b) => b.count - a.count).forEach((w, i) => (i % 2 ? out.unshift(w) : out.push(w))); return out; };
  for (const letter of programs.classes) {
    const groups: Group[] = byLetter.get(letter.id)!.map((p) => {
      const found: Strip[] = peaked(p.byClass.map(([cid, sev]) => ({ name: className.get(cid) ?? cid, count: sev.length, bounty: 0, sev, cid })));
      const where: Strip[] = peaked((surfOf.get(p.name)?.branches || []).map(([, domain, n]) => ({ name: domain, count: n, bounty: 0, sev: "2".repeat(Math.min(n, SURFACE_DOTS)), pk: DOMAIN_PK, plain: true, unit: "subdomain" })));
      // Domains come first round the ring, so that in an open fan (which points left) the reports sit above them,
      // with a clear step between the two.
      const both = where.length && found.length ? [...where, { ...found[0], gap: 9 }, ...found.slice(1)] : [...where, ...found];
      return { id: p.name, name: p.name, count: p.count, bounty: p.bounty, weaknesses: both };
    });
    // The ring is as large as its contents need, within the range where a fan still reads as a fan.
    const strips = groups.flatMap((x) => x.weaknesses), weight = strips.reduce((t, w) => t + Math.pow(w.sev.length * (w.pk ?? 1) ** 2, 0.8), 0);
    const HUB_GAP = 13; // hubs carry logos, so they need more room between them than a class's small node does
    const cols = groups.length * HUB_GAP + strips.length * WEAK_GAP + strips.reduce((t, w) => t + (w.gap || 0), 0) + Math.max(strips.length * 1.6, weight * 0.3);
    const r0 = Math.min(980, Math.max(300, (cols * PITCH) / TAU)), geo: Geo = { R1: r0 - 118, R0: r0, DOT0: r0 + 10, PITCH, classGap: HUB_GAP, compact: true };
    const ld = placeDial(groups, geo, "s", (n) => 17 + Math.min(9, Math.sqrt(n) * 0.45), false);
    const sub: Dial = { classes: ld.classes, weaks: ld.weaks, links: [], rb: Math.max(geo.R0 + 60, ...ld.classes.map((c) => c.tip)) + 22, gap: ld.gap, geo, kind: "s" };
    for (const hub of sub.classes) {
      const p = byName.get(hub.id)!;
      hub.bz = sub.rb; hub.prog = p; hub.group = letter; hub.tag = p.tag; p.hub = hub; p.surface = surfOf.get(p.name)?.total || 0;
      if (p.strip) p.strip.hub = hub;
      hub.weaks.filter((w) => w.cid).forEach((w) => (w.tag = w.cid!));
      hub.weaks.filter((w) => !w.cid).sort((a, b) => b.count - a.count).forEach((w, i) => (w.tag = `Domain ${i + 1}`));
    }
    letter.sub = sub;
  }

  // 9. Every program's logo, inside the index: on rings, the biggest programs outermost and largest. Within a size
  // the rings share their logos in proportion to their length, so all of them are evenly filled.
  const orbits: Model["orbits"] = [];
  let edge = GEO_P.R1 - LETTER_R - 14, at = 0;
  for (const [min, size, air] of [[100, 44, 10], [20, 27, 8], [5, 19, 7], [0, 14.5, 6]]) {
    const end = progs.findIndex((p, i) => i >= at && p.count < min), members = progs.slice(at, end < 0 ? progs.length : end);
    at += members.length;
    if (!members.length) continue;
    const rings: { r: number; cap: number }[] = [];
    for (let need = members.length; need > 0 && edge - size > 40;) {
      const r = edge - size, cap = Math.floor((TAU * r) / (2 * size + air));
      rings.push({ r, cap }); need -= cap; edge = r - size - air;
    }
    const room = rings.reduce((t, x) => t + x.cap, 0);
    let given = 0;
    rings.forEach((ringOf, j) => {
      const n = j === rings.length - 1 ? members.length - given : Math.min(ringOf.cap, Math.round((members.length * ringOf.cap) / room));
      members.slice(given, given + n).forEach((p, m) => { p.orbit = orbits.length; p.os = size; p.oa = -Math.PI / 2 + ((m + (orbits.length % 2) / 2) / n) * TAU; });
      given += n; orbits.push({ r: ringOf.r, n });
    });
    edge -= 3;
  }

  const cveTotal = sum(cve.classes.map((c) => c.count)), cveHot = sum(cve.classes.map((c) => c.hot || 0));
  return { classes, weaks, links, progs, rb, gap, cve, ring, cveTotal, cveHot, core: [], bunches: new Map(), programs, orbits };
}

/**
 * Places the exploited CVEs inside the CVE index: each year's as a bunch (the same sunflower a strip opens into) hanging
 * inward from its key, sized so that it fits its year's slice of the ring. Rows are [id, headline, year, month, has a check, likelihood %].
 */
export function placeCore(model: Model, rows: [string, string, number, number, number, number][]) {
  const G = model.cve.geo, out: XNode[] = [];
  model.bunches.clear();
  for (const hub of model.cve.classes) {
    const mine = rows.filter((r) => String(r[2]) === hub.id);
    if (!mine.length) continue;
    ensureDisc(mine.length);
    const reach = 9 + 4.6 * Math.sqrt(mine.length); // radius of the bunch before scaling
    let scale = 2.7, at = 0;
    for (let i = 0; i < 24; i++) { // shrink until the bunch fits between its neighbours
      at = G.R1 - YEAR_R - 22 - reach * scale;
      if (2 * reach * scale <= (hub.span + model.cve.gap * 2) * at * 0.96 || scale <= 1.1) break;
      scale *= 0.93;
    }
    model.bunches.set(hub, { at, r: reach * scale });
    const cx = Math.cos(hub.a) * at, cy = Math.sin(hub.a) * at, ca = Math.cos(hub.a), sa = Math.sin(hub.a);
    mine.forEach((r, j) => {
      const dx = DISC.x[j] * scale, dy = DISC.y[j] * scale; // turned with the year, so every bunch looks the same from its key
      out.push({ k: "x", id: r[0], name: r[1], year: r[2], month: r[3], check: !!r[4], likely: r[5], hub, x: cx + dx * ca - dy * sa, y: cy + dx * sa + dy * ca });
    });
  }
  model.core = out;
}
