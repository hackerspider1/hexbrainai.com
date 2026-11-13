// Draws the map and handles the pointer. One canvas for shapes, one SVG layer for text (so labels can use
// the semi-mono cut of the typeface and stay crisp).
//
// The vulnerability view is a dial that turns: opening a class rotates it to the top and zooms into its fan;
// opening a weakness lets that strip's dots regroup into a disc with report names listed either side.
import { SEVERITIES } from "@/lib/taxonomy";
import { clip, money, num, plural } from "./format";
import { DISC, DOT0P, GEO_V, PITCH, R0P, TAU, angDiff, cubicAt, quadAt } from "./layout";
import type { CNode, Dial, Focus, Geo, Lens, Model, Node, PNode, RNode, WNode } from "./layout";

export type MapRefs = {
  focus: { current: Focus }; lens: { current: Lens };
  colPage: { current: number };   // which page of report names is shown beside an open weakness
  dataVer: { current: number };   // bumped whenever lazily loaded data arrives
  footprint: { current: Map<WNode, number[]> }; // when a program is shown on the dial: which dots of each weakness are its reports
};
export type MapHooks = { setFocus: (n: Node | null) => void; stepOut: () => void; open: (path: string) => void };

const INK = "239,230,208", HOT = "255,106,61", RED = "255,59,48", BG = "#13120e";
const PANEL = 430;   // width of the side panel
const SPEED = 120;   // how fast a signal travels, in map units per second
const ROW = 31;      // height of one entry in a name column

const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (i: number) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
/** How many report names fit in the two columns beside an open weakness, for a given window height. */
export const namesPerPage = (h: number) => Math.max(4, Math.min(13, Math.floor((h - 210) / ROW))) * 2;

export function startMap(cv: HTMLCanvasElement, svg: SVGSVGElement, model: Model, refs: MapRefs, hooks: MapHooks): () => void {
  const g = cv.getContext("2d")!;
  const { progs, rbp, ring } = model;
  // Two dials share all of the drawing below: vulnerabilities, and CVEs (where a class is a year and a strip is a band).
  const vuln: Dial = { classes: model.classes, weaks: model.weaks, links: model.links, rb: model.rb, gap: model.gap, geo: GEO_V, cve: false };
  let { classes, weaks, links, rb, gap } = vuln, G: Geo = GEO_V, isCve = false, noun = "report";
  let maxLink = Math.max(1, ...links.map((l) => l.n));
  const setDial = () => {
    const d = refs.lens.current === "cves" ? model.cve : vuln;
    if (d.classes === classes) return;
    ({ classes, weaks, links, rb, gap } = d); G = d.geo; isCve = d.cve; noun = isCve ? "CVE" : "report";
    maxLink = Math.max(1, ...links.map((l) => l.n));
  };
  let ringSpin = 0, ringNow: { c: RNode; x: number; y: number }[] = [];
  const cveTotal = model.cve.classes.reduce((t, c) => t + c.count, 0), cveExploited = model.cve.weaks.reduce((t, w) => t + (w.band === 0 ? w.count : 0), 0);
  const orbiters = progs.filter((p) => p.logo).slice(0, 36); // programs that drift along the two arcs beside the dial
  let orbit = 0, dtNow = 0, orbitNow: { p: PNode; x: number; y: number }[] = [];
  const ORBIT = 214, WIN = 0.5; // how far outside the bezel the arcs sit (px), and half their angular length
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const family = getComputedStyle(document.body).fontFamily;

  // ---------- camera ----------
  // A point of the map is turned by `rot`, then (x, y) of the turned map is put at screen point (ax, ay), scaled by s.
  type Cam = { x: number; y: number; s: number; rot: number; ax: number; ay: number };
  const cam: Cam = { x: 0, y: 0, s: 1, rot: 0, ax: 0, ay: 0 }, tgt: Cam = { ...cam };
  let W = 0, H = 0, dpr = 1, s0 = 1, rotNow = 0, cosR = 1, sinR = 0;
  let hover: Node | null = null, mouse = { x: -1, y: -1 };
  let drag: { x: number; y: number; cx: number; cy: number } | null = null, moved = false;
  let lastFocus: Focus | null = null, lastLens: Lens | null = null, raf = 0, last = 0, born = 0, now = 0;

  let introTop = 0;
  const wide = () => W > 900;
  const panelOpen = () => { const f = refs.focus.current; return !!(f.cls || f.prog); };
  const S = (x: number, y: number): [number, number] => {
    const xr = x * cosR - y * sinR, yr = x * sinR + y * cosR;
    return [(xr - cam.x) * cam.s + cam.ax, (yr - cam.y) * cam.s + cam.ay];
  };
  const P = (r: number, a: number) => S(Math.cos(a) * r, Math.sin(a) * r);
  const unS = (mx: number, my: number): [number, number] => {
    const xr = (mx - cam.ax) / cam.s + cam.x, yr = (my - cam.ay) / cam.s + cam.y;
    return [xr * cosR + yr * sinR, -xr * sinR + yr * cosR];
  };
  // The part of the window the map may use: clear of the header, the footer text and the side panel.
  const stage = () => {
    const open = panelOpen();
    if (wide()) return { x0: 0, x1: open ? W - PANEL : W, y0: 78, y1: H - (open ? 24 : 92) };
    return { x0: 0, x1: W, y0: 96, y1: open ? H * 0.47 : introTop };
  };
  const dialScale = (st: { x0: number; x1: number; y0: number; y1: number }, radius = rb, extra = 0) => {
    const padX = wide() ? 178 + extra : 8, padY = wide() ? 42 : 10; // room for the names round the dial (and the arcs beside it)
    return Math.max(0.05, Math.min((st.x1 - st.x0 - 2 * padX) / (2 * radius), (st.y1 - st.y0 - 2 * padY) / (2 * radius)));
  };
  const near = (rot: number) => rot + TAU * Math.round((cam.rot - rot) / TAU); // the same angle, reached the short way round

  const retarget = () => {
    setDial();
    const f = refs.focus.current, st = stage(), cx = (st.x0 + st.x1) / 2, cy = (st.y0 + st.y1) / 2;
    if (refs.lens.current === "programs") {
      if (f.prog) {
        // Turn the program to the left (up on a narrow screen) and fit its strip, from its logo out to its tip.
        const p = f.prog, w = wide(), rot = near((w ? Math.PI : -Math.PI / 2) - p.a), r0 = (p.lr || R0P) - p.ls - 14, r1 = p.tip + 14;
        const box = w ? { x0: st.x0 + 250, x1: st.x1 - 90, y0: st.y0 + 30, y1: st.y1 - 30 } : { x0: st.x0 + 16, x1: st.x1 - 16, y0: st.y0 + 26, y1: st.y1 - 30 };
        const sc = Math.min(((w ? box.x1 - box.x0 : box.y1 - box.y0)) / (r1 - r0), 1.5), mid = -(r0 + r1) / 2;
        Object.assign(tgt, { x: w ? mid : 0, y: w ? 0 : mid, s: sc, rot, ax: (box.x0 + box.x1) / 2, ay: (box.y0 + box.y1) / 2 });
      } else Object.assign(tgt, { x: 0, y: 0, s: dialScale(st, rbp), rot: near(0), ax: cx, ay: cy });
      return;
    }
    if (f.weak && !f.weak.flat) {
      // The class is turned to the top; the camera sits on the disc the weakness opens into.
      const w = f.weak, rot = near(-Math.PI / 2 - w.cls.a), a = w.a + rot;
      const room = wide() ? Math.min(205, Math.max(105, (st.x1 - st.x0) / 2 - 335), (st.y1 - st.y0 - 120) / 2) : Math.min((W - 50) / 2, (st.y1 - st.y0 - 70) / 2);
      Object.assign(tgt, { x: Math.cos(a) * w.discAt, y: Math.sin(a) * w.discAt, s: Math.min(5.5, room / w.discR), rot, ax: cx, ay: cy + 16 });
    } else if (f.cls) {
      // Turn the class so its fan points left (up on a narrow screen) and fit the whole fan, node included.
      // Pointing left leaves room for one column of weakness names, each a short straight leader from its strip's tip.
      const c = f.cls, rot = near((wide() ? Math.PI : -Math.PI / 2) - c.a);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      const grow = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
      for (const w of c.weaks) {
        const a = w.a + rot, ux = Math.cos(a), uy = Math.sin(a), half = (w.cols * G.PITCH) / 2;
        for (const r of [G.R0 - 4, w.tip + 4]) for (const sg of [-1, 1]) grow(ux * r - uy * half * sg, uy * r + ux * half * sg);
      }
      const na = c.a + rot, nx = Math.cos(na) * G.R1, ny = Math.sin(na) * G.R1;
      grow(nx - c.r - 4, ny - c.r - 4); grow(nx + c.r + 4, ny + c.r + 4);
      for (const da of [-c.span / 2, 0, c.span / 2]) grow(Math.cos(na + da) * (c.tip + 16), Math.sin(na + da) * (c.tip + 16)); // and its arc of the bezel
      // The rectangle the fan may fill: clear of the name column on the left and of the title under the node.
      const box = wide() ? { x0: st.x0 + 306, x1: st.x1 - 104, y0: st.y0 + 30, y1: st.y1 - 58 } : { x0: st.x0 + 16, x1: st.x1 - 16, y0: st.y0 + 26, y1: st.y1 - 40 };
      const sc = Math.min((box.x1 - box.x0) / (x1 - x0), (box.y1 - box.y0) / (y1 - y0), 3.6);
      Object.assign(tgt, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: sc, rot, ax: (box.x0 + box.x1) / 2, ay: (box.y0 + box.y1) / 2 });
    } else {
      Object.assign(tgt, { x: 0, y: 0, s: dialScale(st, rb, isCve ? -80 : W >= 1280 && !panelOpen() ? 66 : 0), rot: near(0), ax: cx, ay: cy });
    }
  };
  const size = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    introTop = (document.querySelector("section")?.getBoundingClientRect().top || H - 194) - 6; // on a narrow screen the map stops where the intro text starts
    s0 = dialScale(wide() ? { x0: 0, x1: W, y0: 78, y1: H - 92 } : { x0: 0, x1: W, y0: 96, y1: introTop });
    retarget(); labKey = "";
  };

  // ---------- text ----------
  const pool: SVGTextElement[] = [];
  let used = 0, shown = 0;
  // `turn` rotates the text about a point: [degrees, x, y]. Used for the ids that run round the dial.
  const text = (str: string, x: number, y: number, alpha: number, px: number, align: CanvasTextAlign = "left", col = INK, turn?: [number, number, number]) => {
    if (alpha < 0.02 || !str) return;
    let el = pool[used];
    if (!el) { el = document.createElementNS("http://www.w3.org/2000/svg", "text"); svg.appendChild(el); pool.push(el); }
    used++;
    const sig = `${str}|${px}|${align}|${col}`;
    if (el.dataset.sig !== sig) {
      el.dataset.sig = sig; el.textContent = str; el.setAttribute("font-size", String(px));
      el.setAttribute("text-anchor", align === "center" ? "middle" : align === "right" ? "end" : "start"); el.setAttribute("fill", `rgb(${col})`);
    }
    el.setAttribute("x", x.toFixed(1)); el.setAttribute("y", y.toFixed(1)); el.setAttribute("opacity", Math.min(1, alpha).toFixed(2));
    if (turn) { el.setAttribute("transform", `rotate(${turn[0].toFixed(2)} ${turn[1].toFixed(1)} ${turn[2].toFixed(1)})`); el.dataset.turned = "1"; }
    else if (el.dataset.turned) { el.removeAttribute("transform"); delete el.dataset.turned; }
  };
  const widths = new Map<string, number>();
  const mw = (str: string, px: number) => {
    const key = px + "|" + str; let w = widths.get(key);
    if (w === undefined) { g.font = `400 ${px}px ${family}`; w = g.measureText(str).width * 1.07 + str.length * px * 0.02; if (widths.size < 8000) widths.set(key, w); }
    return w;
  };

  // ---------- labels ----------
  // A label is up to three lines (small id line, name, small sub line) joined to its part by a dashed leader.
  // `fix` pins it to a row of an aligned column; otherwise it is placed outward from its part where it fits.
  type Lab = {
    n: Node | null; ax: number; ay: number; id?: string; name: string; sub?: string; subHot?: boolean; nameHot?: boolean;
    al: number; hot: boolean; px: number; pr: number; dir: number; reach: number; lead?: boolean;
    fix?: { x: number; y: number; side: CanvasTextAlign };
  };
  type Laid = { L: Lab; ex: number; ey: number; rect: number[]; side: CanvasTextAlign; tx: number; y0: number };
  let labs: Lab[] = [], occ: number[][] = [], placed: { r: number[]; n: Node }[] = [], laid: Laid[] = [], labKey = "";
  const spot = new Map<string, number>(); // which candidate position each label last used, so it does not jump when hovered
  const nodeKey = (n: Node | null) => (!n ? "" : n.k === "leaf" ? "r" + n.d[0] : n.k === "weak" ? "w" + n.cls.id + n.name : n.k === "cls" ? "c" + n.id : n.k === "ring" ? "g" + n.id : "p" + n.name);
  const hits = (b: number[]) => occ.some((r) => b[0] < r[2] && b[2] > r[0] && b[1] < r[3] && b[3] > r[1]);

  const place = (L: Lab): Laid | null => {
    const w = Math.max(mw(L.name, L.px), L.id ? mw(L.id, 9) : 0, L.sub ? mw(L.sub, 9.5) : 0) + 2;
    const h = (L.id ? 11 : 0) + L.px + 3 + (L.sub ? 12 : 0);
    if (L.fix) {
      const side = L.fix.side, x0 = side === "left" ? L.fix.x : side === "right" ? L.fix.x - w : L.fix.x - w / 2, y0 = L.fix.y - h / 2;
      const rect = [x0 - 4, y0 - 2, x0 + w + 4, y0 + h + 2]; occ.push(rect);
      return { L, ex: L.fix.x + (side === "left" ? -7 : side === "right" ? 7 : 0), ey: L.fix.y, rect, side, tx: L.fix.x, y0 };
    }
    const key = nodeKey(L.n), right = W - (panelOpen() && wide() ? PANEL + 6 : 4);
    const first = L.hot ? spot.get(key) ?? 0 : 0, end = L.hot ? first + 1 : 12;
    for (let i = first; i < end; i++) {
      const len = L.reach + [0, 20, 40, 62][Math.floor(i / 3)], a = L.dir + [0, 0.45, -0.45][i % 3];
      const cs = Math.cos(a), sn = Math.sin(a), ex = L.ax + cs * len, ey = L.ay + sn * len;
      const side: CanvasTextAlign = cs > 0.3 ? "left" : cs < -0.3 ? "right" : "center";
      const x0 = side === "left" ? ex + 5 : side === "right" ? ex - 5 - w : ex - w / 2, y0 = side === "center" ? (sn > 0 ? ey + 4 : ey - 4 - h) : ey - h / 2;
      const rect = [x0 - 4, y0 - 3, x0 + w + 4, y0 + h + 3];
      if (!L.hot && (x0 < 4 || x0 + w > right || y0 < (wide() ? 58 : 94) || y0 + h > (wide() ? H - 4 : panelOpen() ? H * 0.47 : introTop - 2) || hits(rect))) continue;
      occ.push(rect); spot.set(key, i);
      return { L, ex, ey, rect, side, tx: side === "left" ? x0 : side === "right" ? x0 + w : x0 + w / 2, y0 };
    }
    return null;
  };
  const drawLab = ({ L, ex, ey, rect, side, tx, y0 }: Laid) => {
    if (L.lead !== false) {
      g.strokeStyle = L.hot ? `rgb(${HOT})` : `rgba(${INK},${0.26 * L.al})`; g.setLineDash([3, 2]);
      g.beginPath(); g.moveTo(L.ax, L.ay); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
    }
    if (L.hot && !L.fix) { g.fillStyle = BG; g.fillRect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]); }
    let y = y0;
    if (L.id) { text(L.id, tx, y + 8, L.al * (L.hot ? 0.9 : 0.5), 9, side, L.hot && L.fix ? HOT : INK); y += 11; }
    text(L.name, tx, y + L.px - 1, L.al * (L.hot ? 1 : 0.86), L.px, side, L.nameHot ? HOT : INK);
    if (L.sub) text(L.sub, tx, y + L.px + 11, L.al * (L.subHot || L.hot ? 0.9 : 0.5), 9.5, side, L.subHot ? HOT : INK);
  };

  // ---------- shapes ----------
  const circle = (x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, TAU); };
  const ease = (t: number) => t * t * (3 - 2 * t);
  // Screen positions of the dots of any weakness that is opening, open, or closing.
  const buffers = new Map<WNode, Float32Array>();
  const bufFor = (w: WNode) => { let b = buffers.get(w); if (!b || b.length < w.n * 2) { b = new Float32Array(w.n * 2); buffers.set(w, b); } return b; };
  const logos = new Map<string, HTMLImageElement>();
  const getLogo = (p: PNode) => { // loaded the first time a program is drawn large enough to show one
    if (!p.logo) return null;
    let im = logos.get(p.name);
    if (!im) { im = new Image(); im.src = p.logo; logos.set(p.name, im); }
    return im;
  };
  const classOf = (n: Node | null): CNode | null => (!n ? null : n.k === "cls" ? n : n.k === "weak" ? n.cls : n.k === "leaf" ? n.w.cls : null);

  const drawDial = (intro: number, f: Focus) => {
    const k = cam.s, [ox, oy] = S(0, 0), pitch = G.PITCH * k, fine = pitch >= 2.4, st = stage();
    const hc = classOf(hover), lead = f.cls || hc, foot = f.prog;
    // How strongly each class is drawn: the open class in full, the one under the cursor next, the rest stepped back.
    const shade = (c: CNode) => intro * (f.cls ? (c === f.cls ? 1 : c === hc ? 0.62 : f.weak ? 0.08 : 0.24) : hc ? (c === hc ? 1 : hc.shared.has(c) ? 0.85 : 0.45) : 1);

    if (isCve && !f.cls && G.R1 * k > 90) {
      text(num(cveTotal), ox, oy - 4, intro, 30, "center");
      text("registered CVEs", ox, oy + 16, intro * 0.55, 11, "center");
      text(`${num(cveExploited)} exploited in the wild`, ox, oy + 36, intro, 11.5, "center", RED);
    }
    // Guide rings and the centre mark.
    g.lineWidth = 1; g.setLineDash([1, 5]); g.strokeStyle = `rgba(${INK},${0.14 * intro})`;
    circle(ox, oy, G.R1 * k); g.stroke(); circle(ox, oy, G.R0 * k); g.stroke(); g.setLineDash([]);
    g.strokeStyle = `rgba(${INK},${0.3 * intro})`; g.beginPath();
    g.moveTo(ox - 5, oy); g.lineTo(ox + 5, oy); g.moveTo(ox, oy - 5); g.lineTo(ox, oy + 5); g.stroke();

    // Bezel: one arc per class, outside its strips.
    for (const c of classes) {
      const hot = c === lead && !f.weak, a0 = c.a - c.span / 2 - gap * 0.3 + rotNow, a1 = c.a + c.span / 2 + gap * 0.3 + rotNow;
      g.strokeStyle = hot ? `rgba(${HOT},${intro})` : `rgba(${INK},${0.42 * shade(c)})`; g.lineWidth = hot ? 1.6 : 1;
      g.beginPath(); g.arc(ox, oy, c.bz * k, a0, a1); g.stroke();
      g.beginPath();
      for (const a of [a0, a1]) { g.moveTo(ox + Math.cos(a) * c.bz * k, oy + Math.sin(a) * c.bz * k); g.lineTo(ox + Math.cos(a) * (c.bz - 6) * k, oy + Math.sin(a) * (c.bz - 6) * k); }
      g.stroke();
    }
    g.lineWidth = 1;

    // Links between classes: reports filed under one that involve the other.
    for (const l of links) {
      const on = !!lead && (l.a === lead || l.b === lead), wgt = l.n / maxLink;
      const al = intro * (foot ? 0.07 : lead ? (on ? 0.5 + 0.45 * wgt : 0.035) : 0.09 + 0.4 * wgt) * (f.weak ? 0.5 : 1);
      const a = S(l.p[0], l.p[1]), c = S(l.p[2], l.p[3]), b = S(l.p[4], l.p[5]);
      g.strokeStyle = `rgba(${INK},${al})`; g.lineWidth = 1 + (on ? wgt * 1.4 : !lead ? wgt * 0.8 : 0);
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(c[0], c[1], b[0], b[1]); g.stroke();
    }
    g.lineWidth = 1;

    const trace = (w: WNode) => {
      const p = w.branch, a = S(p[0], p[1]), c1 = S(p[2], p[3]), c2 = S(p[4], p[5]), b = S(p[6], p[7]);
      g.moveTo(a[0], a[1]); g.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b[0], b[1]);
    };

    const strip = (w: WNode, sh: number) => {
      const a = w.a + rotNow, ux = Math.cos(a), uy = Math.sin(a), [sx, sy] = P(G.DOT0, w.a);
      const dux = ux * pitch, duy = uy * pitch, dtx = -uy * pitch, dty = ux * pitch;
      const ex = sx + dux * w.rows, ey = sy + duy * w.rows, m = w.cols * pitch + 40 + (w.bloom > 0 ? w.discR * 2.2 * k : 0);
      if (Math.max(sx, ex) < -m || Math.min(sx, ex) > W + m || Math.max(sy, ey) < -m || Math.min(sy, ey) > H + m) return;
      const on = f.weak === w, hov = hover === w;
      const al = sh * (f.weak && f.cls === w.cls && !on ? 0.18 : 1) * (foot ? 0.45 : 1), h0 = (w.cols - 1) / 2;
      const bl = w.bloom > 0.001 ? ease(w.bloom) : 0;
      const band = isCve ? w.sev.charCodeAt(0) - 48 : -1, tone = band === 4 ? RED : INK, level = [0.26, 0.4, 0.62, 0.96, 1][band] ?? 0;

      if (bl > 0) {
        // Opening: every dot travels from its place in the strip to its place in a disc.
        const [dcx, dcy] = P(w.discAt, w.a), buf = bufFor(w), root = P(G.R0 + 2, w.a);
        g.fillStyle = `rgba(19,18,14,${0.94 * bl})`; circle(dcx, dcy, w.discR * k + 12); g.fill();
        g.strokeStyle = `rgba(${INK},${0.4 * bl * al})`; g.beginPath(); g.moveTo(root[0], root[1]); g.lineTo(dcx, dcy); g.stroke();
        for (let i = 0; i < w.n; i++) {
          const row = (i / w.cols) | 0, lx = i - row * w.cols - h0, gx = sx + dux * row + dtx * lx, gy = sy + duy * row + dty * lx;
          const px = dcx + (DISC.x[i] * cosR - DISC.y[i] * sinR) * k, py = dcy + (DISC.x[i] * sinR + DISC.y[i] * cosR) * k;
          buf[i * 2] = gx + (px - gx) * bl; buf[i * 2 + 1] = gy + (py - gy) * bl;
        }
        if (bl > 0.4) {
          g.strokeStyle = `rgba(${INK},${0.13 * ((bl - 0.4) / 0.6) * al})`; g.beginPath();
          for (let i = 0; i < w.n; i++) { g.moveTo(dcx, dcy); g.lineTo(buf[i * 2], buf[i * 2 + 1]); }
          g.stroke();
        }
        const from = Math.max(1.3, pitch * 0.46), zoom = Math.min(k, 3.2);
        for (const strong of [false, true]) {
          g.fillStyle = isCve ? `rgba(${tone},${Math.max(level, 0.7) * al})` : `rgba(${INK},${(strong ? 0.96 : 0.6) * al})`;
          for (let i = 0; i < w.n; i++) {
            const sev = w.sev.charCodeAt(i) - 48;
            if ((sev >= 3) !== strong) continue;
            const z = from + ((1.7 + sev * 0.34) * zoom - from) * bl;
            g.fillRect(buf[i * 2] - z / 2, buf[i * 2 + 1] - z / 2, z, z);
          }
        }
        for (const l of [hover?.k === "leaf" && hover.w === w ? hover : null, f.leaf && f.leaf.w === w ? f.leaf : null]) if (l && l.i < w.n) {
          const z = Math.max(1.4, 2.7 * zoom) + 3; g.fillStyle = `rgb(${HOT})`; g.fillRect(buf[l.i * 2] - z / 2, buf[l.i * 2 + 1] - z / 2, z, z);
        }
        g.fillStyle = BG; g.strokeStyle = `rgba(${HOT},${bl})`; g.lineWidth = 1.6; circle(dcx, dcy, 6); g.fill(); g.stroke();
        g.fillStyle = `rgba(${HOT},${bl})`; circle(dcx, dcy, 1.7); g.fill(); g.lineWidth = 1;
        return;
      }
      buffers.delete(w);

      if (!fine) {
        // From far away a strip is ruled lines, one per row of reports: crisp at any angle.
        g.strokeStyle = isCve ? `rgba(${tone},${Math.min(1, level + (hov || on ? 0.25 : 0)) * al})` : `rgba(${INK},${(hov ? 0.95 : 0.55) * al})`; g.lineWidth = Math.max(0.6, pitch * 0.5); g.beginPath();
        for (let i = 0; i < w.rows; i++) {
          const cnt = i < w.rows - 1 ? w.cols : w.n - w.cols * (w.rows - 1), x = sx + dux * i - dtx * (w.cols / 2), y = sy + duy * i - dty * (w.cols / 2);
          g.moveTo(x, y); g.lineTo(x + dtx * cnt, y + dty * cnt);
        }
        g.stroke(); g.lineWidth = 1;
      } else {
        // Close enough to tell reports apart: one square each, brighter and larger for high and critical.
        const z0 = Math.max(1.3, pitch * 0.46);
        if (isCve) { // one tone for the whole strip; only the rows and dots on screen are drawn, as a strip can hold tens of thousands
          g.fillStyle = `rgba(${tone},${Math.min(1, level + (hov || on ? 0.25 : 0)) * al})`;
          const reach = (w.cols * pitch) / 2 + 4;
          for (let row = 0; row < w.rows; row++) {
            const mx = sx + dux * row, my = sy + duy * row;
            if (mx < -reach || mx > W + reach || my < -reach || my > H + reach) continue;
            const last = Math.min(w.cols, w.n - row * w.cols);
            for (let col = 0; col < last; col++) { const px = mx + dtx * (col - h0), py = my + dty * (col - h0); if (px > -2 && px < W + 2 && py > -2 && py < H + 2) g.fillRect(px - z0 / 2, py - z0 / 2, z0, z0); }
          }
        } else for (const strong of [false, true]) {
          g.fillStyle = `rgba(${INK},${(strong ? 0.96 : hov ? 0.82 : 0.58) * al})`;
          for (let i = 0; i < w.n; i++) {
            const sev = w.sev.charCodeAt(i) - 48;
            if ((sev >= 3) !== strong) continue;
            const row = (i / w.cols) | 0, lx = i - row * w.cols - h0, z = z0 * (1 + sev * 0.1);
            g.fillRect(sx + dux * row + dtx * lx - z / 2, sy + duy * row + dty * lx - z / 2, z, z);
          }
        }
      }
      if (hov && !on) { // outline the strip under the cursor
        const a0 = -0.8, a1 = w.rows - 0.2, b0 = -w.cols / 2 - 0.5, b1 = w.cols / 2 + 0.5;
        g.strokeStyle = `rgb(${HOT})`; g.beginPath();
        g.moveTo(sx + dux * a0 + dtx * b0, sy + duy * a0 + dty * b0); g.lineTo(sx + dux * a1 + dtx * b0, sy + duy * a1 + dty * b0);
        g.lineTo(sx + dux * a1 + dtx * b1, sy + duy * a1 + dty * b1); g.lineTo(sx + dux * a0 + dtx * b1, sy + duy * a0 + dty * b1);
        g.closePath(); g.stroke();
      }
      const mine = foot ? refs.footprint.current.get(w) : undefined;
      if (mine) { // this program's reports, picked out
        const z = Math.max(2.4, pitch * 0.9); g.fillStyle = `rgba(${HOT},${intro})`;
        for (const i of mine) { const row = (i / w.cols) | 0, lx = i - row * w.cols - h0; g.fillRect(sx + dux * row + dtx * lx - z / 2, sy + duy * row + dty * lx - z / 2, z, z); }
      }
    };

    // Branches and strips, class by class; the open or hovered weakness's branch is redrawn in orange.
    for (const c of classes) {
      const sh = shade(c);
      g.strokeStyle = `rgba(${INK},${0.32 * sh * (foot ? 0.5 : 1)})`; g.beginPath();
      for (const w of c.weaks) trace(w);
      g.stroke();
      for (const w of c.weaks) strip(w, sh);
    }
    const hw = f.weak || (hover?.k === "weak" ? hover : null);
    if (hw) { g.strokeStyle = `rgba(${HOT},${intro})`; g.lineWidth = 1.5; g.beginPath(); trace(hw); g.stroke(); g.lineWidth = 1; }

    // Class nodes.
    for (const c of classes) {
      const [x, y] = P(G.R1, c.a), R = Math.max(4, c.r * k), hot = c === lead, al = shade(c);
      g.fillStyle = BG; g.strokeStyle = `rgba(${hot ? HOT : INK},${al})`; g.lineWidth = hot ? 1.9 : 1.3; circle(x, y, R); g.fill(); g.stroke(); g.lineWidth = 1;
      g.strokeStyle = `rgba(${INK},${0.5 * al})`; circle(x, y, R * 0.58); g.stroke();
      if (R >= 14) text(c.id, x, y + 3.5, al, Math.min(11, R * 0.6), "center", hot ? HOT : INK);
      else { g.fillStyle = `rgba(${hot ? HOT : INK},${al})`; circle(x, y, 1.6); g.fill(); }
    }

    // Signals. Each one rides a drawn line from one node's edge to the other's at a steady speed, then the
    // line rests. Links carry them between classes; branches carry them inward from the weaknesses.
    if (!reduce && !foot) {
      const ts = now / 1000;
      links.forEach((l, i) => {
        const on = !!lead && (l.a === lead || l.b === lead);
        if (lead && !on) return;
        const T = l.len / SPEED, C = T + (on ? 0.35 : 3 + 8 * hash(i)), u = (ts + hash(i + 50) * C) % C, fromA = on ? l.a === lead : hash(i + 9) > 0.5;
        if (u < T) {
          const q = u / T, w = quadAt(l.p, fromA ? q : 1 - q), [x, y] = S(w[0], w[1]);
          g.fillStyle = `rgba(${HOT},${intro * Math.min(1, Math.sin(Math.PI * q) * 5)})`; circle(x, y, 2.2); g.fill();
        } else if (u < T + 0.45) { // arrival: the receiving node answers with a ring
          const to = fromA ? l.b : l.a, [x, y] = P(G.R1, to.a), q = (u - T) / 0.45;
          g.strokeStyle = `rgba(${HOT},${intro * (1 - q) * 0.9})`; circle(x, y, Math.max(4, to.r * k) + 2 + q * 9); g.stroke();
        }
      });
      weaks.forEach((w, i) => {
        const sh = shade(w.cls);
        if (sh < 0.4 || w.bloom > 0.01) return;
        const T = w.blen / SPEED, C = T + (w.cls === lead ? 0.8 + 2.6 * hash(i) : 8 + 14 * hash(i)), u = (ts + hash(i + 200) * C) % C;
        if (u >= T) return;
        const q = 1 - u / T, p = cubicAt(w.branch, q), [x, y] = S(p[0], p[1]);
        g.fillStyle = `rgba(${HOT},${sh * 0.9 * Math.min(1, Math.sin(Math.PI * q) * 5)})`; circle(x, y, 1.6); g.fill();
      });
      const ow = f.weak, buf = ow && buffers.get(ow);
      if (ow && buf && ow.bloom > 0.9) { // inside an open weakness: from its centre out to its reports
        const [dcx, dcy] = P(ow.discAt, ow.a);
        for (let i = 0; i < ow.n; i += Math.max(5, Math.ceil(ow.n / 60))) {
          const q = (ts / 1.9 + hash(i)) % 1;
          g.fillStyle = `rgba(${HOT},${0.9 * Math.min(1, Math.sin(Math.PI * q) * 4)})`; circle(dcx + (buf[i * 2] - dcx) * q, dcy + (buf[i * 2 + 1] - dcy) * q, 1.6); g.fill();
        }
      }
    }

    // ---- labels ----
    if (!f.cls) {
      // Overview: class names round the bezel. They step clear of the corner text.
      if (!foot && !panelOpen() && wide()) occ.push([20, H - 176, 352, H - 22], [W - 548, H - 112, W - 26, H - 20]);
      let fp: Map<CNode, number> | null = null;
      if (foot) { fp = new Map(); for (const [w, dots] of refs.footprint.current) fp.set(w.cls, (fp.get(w.cls) || 0) + dots.length); }
      for (const c of classes) {
        const [bx, by] = P(rb, c.a), hot = c === hc, got = fp?.get(c) || 0, shares = !fp && !!hc && hc !== c && hc.shared.has(c);
        labs.push({
          n: c, ax: bx, ay: by, name: c.name, nameHot: hot, px: 12.5, pr: c.count, dir: c.a + rotNow, reach: ringOn(f) ? 38 : 13,
          sub: fp ? (got ? `${num(got)} from ${clip(foot!.name, 20)}` : "none from this program") : shares ? `${num(hc!.shared.get(c)!)} shared with ${hc!.name}` : plural(c.count, noun) + (isCve && c.weaks[0]?.band === 0 ? `, ${num(c.weaks[0].count)} exploited` : ""),
          subHot: fp ? got > 0 : shares, al: shade(c) * (fp && !got ? 0.5 : 1), hot,
        });
      }
    } else {
      const c = f.cls, [nx, ny] = P(G.R1, c.a), nr = Math.max(4, c.r * k);
      if (!f.weak || f.weak.flat) {
        if (wide()) labs.push({ n: null, ax: nx, ay: ny, id: c.tag, name: c.name, sub: plural(c.count, noun) + (c.bounty ? `  ${money(c.bounty)}` : ""), subHot: true,
          al: intro, hot: false, px: 13, pr: 3e9, dir: 0, reach: 0, lead: false, fix: { x: nx, y: ny + nr + 28, side: "center" } });
        const tips = c.weaks.map((w) => ({ w, p: P(w.tip + 5, w.a) }));
        const entry = (w: WNode) => `${w.tag}  ${plural(w.count, noun)}${w.bounty ? "  " + money(w.bounty) : ""}`;
        if (wide()) {
          // Its weaknesses, named in one column level with the tips of their strips, biggest first when room runs out.
          const per = Math.max(4, Math.floor((st.y1 - st.y0 - 30) / ROW)), colX = Math.min(P(c.bz, c.a)[0], ...tips.map((q) => q.p[0])) - 16; // just outside the bezel
          const rows = [...tips].sort((a, b) => b.w.count - a.w.count).slice(0, per).sort((a, b) => a.p[1] - b.p[1]), ys = rows.map((q) => q.p[1]);
          // Give every name its own line while moving each as little as possible from its strip: runs of names
          // that would collide are merged into a block and the block is centred on where its names wanted to be.
          const blocks: { at: number; n: number; top: number }[] = [];
          ys.forEach((y, i) => {
            blocks.push({ at: i, n: 1, top: y });
            while (blocks.length > 1) {
              const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
              if (a.top + a.n * ROW <= b.top) break;
              blocks.pop(); a.n += b.n;
              let sum = 0; for (let j = 0; j < a.n; j++) sum += ys[a.at + j] - j * ROW;
              a.top = sum / a.n;
            }
          });
          for (const b of blocks) for (let j = 0; j < b.n; j++) ys[b.at + j] = b.top + j * ROW;
          const shift = ys.length ? Math.max(0, st.y0 + 22 - ys[0]) - Math.max(0, ys[ys.length - 1] - (st.y1 - 16)) : 0;
          rows.forEach(({ w, p }, i) => labs.push({ n: w, ax: p[0], ay: p[1], id: entry(w), name: clip(w.name, 38), al: intro, hot: hover === w || f.weak === w, px: 11.5, pr: 2e9 - i,
            dir: 0, reach: 0, fix: { x: colX, y: ys[i] + shift, side: "right" } }));
        } // on a narrow screen the panel below the map lists them instead
      } else {
        // An open weakness: its title above the disc, its reports named in two columns either side.
        const w = f.weak, [dcx, dcy] = P(w.discAt, w.a), R = w.discR * k, buf = buffers.get(w);
        if (wide()) labs.push({ n: null, ax: dcx, ay: dcy, id: w.tag, name: clip(w.name, 48), sub: plural(w.count, noun) + (w.bounty ? `  ${money(w.bounty)}` : ""), subHot: true,
          al: intro, hot: false, px: 13, pr: 3e9, dir: 0, reach: 0, lead: false, fix: { x: dcx, y: dcy - R - 36, side: "center" } });
        if (buf && w.bloom > 0.85 && w.loaded && wide()) {
          const per = namesPerPage(H), from = Math.min(refs.colPage.current * per, Math.max(0, w.leaves.length - 1));
          const top = w.leaves.slice(from, from + per).filter((l) => l.i < w.n).map((l) => ({ l, x: buf[l.i * 2], y: buf[l.i * 2 + 1] })).sort((a, b) => a.x - b.x), half = Math.ceil(top.length / 2);
          [top.slice(0, half), top.slice(half)].forEach((col, si) => {
            col.sort((a, b) => a.y - b.y);
            const y0 = dcy - ((col.length - 1) * ROW) / 2;
            col.forEach(({ l, x, y }, i) => labs.push({ n: l, ax: x, ay: y, id: isCve ? `${l.d[0]}  ${l.d[4]}% likely` : [`#${l.d[0]}`, l.d[5], money(l.d[3])].filter(Boolean).join("  "), name: clip(l.d[1] || "No details stored", 42), al: 1,
              hot: hover === l || f.leaf === l, px: 11, pr: 1e8 - i, dir: 0, reach: 0, fix: { x: si ? dcx + R + 44 : dcx - R - 44, y: y0 + i * ROW, side: si ? "left" : "right" } }));
          });
        }
        const hl = hover?.k === "leaf" && hover.w === w ? hover : f.leaf && f.leaf.w === w ? f.leaf : null;
        if (hl && buf && hl.i < w.n && !labs.some((q) => q.n === hl)) {
          const d = hl.d, x = buf[hl.i * 2], y = buf[hl.i * 2 + 1];
          labs.push({ n: hl, ax: x, ay: y, id: isCve ? String(d[0]) : `#${d[0]}`, name: clip(d[1] || "No details stored for this one", 64),
            sub: isCve ? `${d[4]}% likely to be exploited` : [d[5], d[2] ? SEVERITIES[d[2]] : "", money(d[3]), d[4] ? `${d[4]} votes` : ""].filter(Boolean).join("   "),
            subHot: true, al: 1, hot: true, px: 11.5, pr: 0, dir: Math.atan2(y - dcy, x - dcx), reach: 13 });
        }
      }
    }
    drawOrbit(intro, f);
    drawRing(intro, f);
    // A strip under the cursor that has no name on screen yet gets one.
    if (hover?.k === "weak" && hover !== f.weak && !labs.some((q) => q.n === hover)) {
      const w = hover, p = P(w.tip + 5, w.a);
      labs.push({ n: w, ax: p[0], ay: p[1], id: `${w.tag}  ${plural(w.count, noun)}`, name: clip(w.name, 44), al: 1, hot: true, px: 11.5, pr: 0, dir: w.a + rotNow, reach: 14 });
    }
  };

  const drawLogo = (p: PNode, x: number, y: number, R: number, al: number, hi: boolean) => {
    const im = getLogo(p), ready = !!im && im.complete && im.naturalWidth > 0;
    g.globalAlpha = al;
    g.fillStyle = ready ? `rgb(${INK})` : BG; circle(x, y, R); g.fill();
    if (ready) { g.save(); circle(x, y, Math.max(1, R - 0.5)); g.clip(); g.drawImage(im!, x - R, y - R, R * 2, R * 2); g.restore(); }
    g.globalAlpha = 1;
    g.strokeStyle = `rgba(${hi ? HOT : INK},${al * (hi ? 1 : 0.6)})`; g.lineWidth = hi ? 1.8 : 1; circle(x, y, R + (hi ? 2 : 0)); g.stroke(); g.lineWidth = 1;
    if (!ready && R >= 7) text(p.name.slice(0, 1).toUpperCase(), x, y + R * 0.36, al * 0.8, Math.min(R * 0.95, 22), "center");
  };

  // Round the vulnerability dial: the ids of the exploited CVEs listed most recently, turning slowly like a bezel.
  // Hovering stops them and names the one under the cursor; clicking opens it.
  const ringOn = (f: Focus) => !isCve && wide() && !f.cls && !f.prog && ring.length > 0;
  const drawRing = (intro: number, f: Focus) => {
    ringNow = [];
    if (!ringOn(f)) return;
    const [ox, oy] = S(0, 0), Rr = rb * cam.s + 15;
    const on = mouse.x > 0 && Math.abs(Math.hypot(mouse.x - ox, mouse.y - oy) - Rr) < 13;
    if (!on && !reduce) ringSpin = (ringSpin + (dtNow * TAU) / 300000) % TAU;
    ring.forEach((c, i) => {
      const a = -Math.PI / 2 + (i * TAU) / ring.length + ringSpin + rotNow, x = ox + Math.cos(a) * Rr, y = oy + Math.sin(a) * Rr, hi = hover === c;
      const deg = (a * 180) / Math.PI + (Math.sin(a) > 0 ? -90 : 90); // along the circle, the right way up in the lower half
      text(c.id, x, y + 3, intro * (hi ? 1 : 0.46), 8.5, "center", hi ? RED : INK, [deg, x, y]);
      ringNow.push({ c, x, y });
      if (hi) labs.push({ n: c, ax: x, ay: y, name: clip(c.name || c.id, 48), sub: "Exploited in the wild. Click for how to check it.", subHot: true, al: 1, hot: true, px: 11.5, pr: 5e9, dir: a, reach: 30 });
    });
  };

  // Beside the vulnerability dial: two arcs along which the biggest programs' logos drift clockwise.
  // Clicking one marks that program's reports on the dial. The drift pauses while the cursor is on an arc.
  const drawOrbit = (intro: number, f: Focus) => {
    orbitNow = [];
    if (isCve || W < 1280 || f.cls || f.prog || !orbiters.length) return;
    const [ox, oy] = S(0, 0), Ro = rb * cam.s + ORBIT;
    g.strokeStyle = `rgba(${INK},${0.22 * intro})`; g.setLineDash([1, 5]);
    for (const mid of [0, Math.PI]) { g.beginPath(); g.arc(ox, oy, Ro, mid - WIN - 0.05, mid + WIN + 0.05); g.stroke(); }
    g.setLineDash([]);
    const on = mouse.x > 0 && Math.abs(Math.hypot(mouse.x - ox, mouse.y - oy) - Ro) < 34;
    if (!on && !reduce) orbit = (orbit + (dtNow * TAU) / 210000) % TAU;
    orbiters.forEach((p, i) => {
      let a = ((i * TAU) / orbiters.length + orbit) % TAU; if (a > Math.PI) a -= TAU;
      const d = Math.min(Math.abs(a), Math.PI - Math.abs(a));
      if (d > WIN) return;
      const x = ox + Math.cos(a) * Ro, y = oy + Math.sin(a) * Ro, hi = hover === p;
      drawLogo(p, x, y, hi ? 15 : 12, intro * Math.min(1, (WIN - d) / 0.1), hi);
      orbitNow.push({ p, x, y });
      if (hi) labs.push({ n: p, ax: x, ay: y - 15, name: clip(p.name, 28), nameHot: true, sub: `${plural(p.count, "report")}, click to mark them`, subHot: true, al: 1, hot: true, px: 11.5, pr: 4e9, dir: -Math.PI / 2, reach: 8 });
    });
  };

  // The Programs dial: every program is a strip of its reports, the biggest at the top and smaller ones down both sides.
  const drawProgs = (intro: number, f: Focus) => {
    const k = cam.s, [ox, oy] = S(0, 0), pitch = PITCH * k, fine = pitch >= 2.4, ts = now / 1000;
    g.lineWidth = 1; g.setLineDash([1, 5]); g.strokeStyle = `rgba(${INK},${0.14 * intro})`;
    circle(ox, oy, R0P * k); g.stroke(); circle(ox, oy, (R0P - 64) * k); g.stroke(); g.setLineDash([]);
    g.strokeStyle = `rgba(${INK},${0.3 * intro})`; g.beginPath();
    g.moveTo(ox - 5, oy); g.lineTo(ox + 5, oy); g.moveTo(ox, oy - 5); g.lineTo(ox, oy + 5); g.stroke();
    g.strokeStyle = `rgba(${INK},${0.34 * intro})`; circle(ox, oy, rbp * k); g.stroke();

    progs.forEach((p) => {
      const on = f.prog === p, hi = on || hover === p, al = intro * (f.prog && !on ? 0.16 : 1);
      const a = p.a + rotNow, ux = Math.cos(a), uy = Math.sin(a), [sx, sy] = P(DOT0P, p.a);
      const dux = ux * pitch, duy = uy * pitch, dtx = -uy * pitch, dty = ux * pitch, ex = sx + dux * p.rows, ey = sy + duy * p.rows;
      const m = p.cols * pitch + 60;
      if (Math.max(sx, ex) < -m || Math.min(sx, ex) > W + m || Math.max(sy, ey) < -m || Math.min(sy, ey) > H + m) return;
      const col = hi ? HOT : INK;
      if (!fine) {
        g.strokeStyle = `rgba(${col},${(hi ? 1 : 0.55) * al})`; g.lineWidth = Math.max(0.6, pitch * 0.5); g.beginPath();
        for (let r = 0; r < p.rows; r++) {
          const cnt = r < p.rows - 1 ? p.cols : p.count - p.cols * (p.rows - 1), x = sx + dux * r - dtx * (p.cols / 2), y = sy + duy * r - dty * (p.cols / 2);
          g.moveTo(x, y); g.lineTo(x + dtx * cnt, y + dty * cnt);
        }
        g.stroke(); g.lineWidth = 1;
      } else {
        const z = Math.max(1.3, pitch * 0.5), h0 = (p.cols - 1) / 2; g.fillStyle = `rgba(${col},${(hi ? 1 : 0.62) * al})`;
        for (let n = 0; n < p.count; n++) { const row = (n / p.cols) | 0, lx = n - row * p.cols - h0; g.fillRect(sx + dux * row + dtx * lx - z / 2, sy + duy * row + dty * lx - z / 2, z, z); }
      }
    });
    // Lines from the bigger programs' logos to their strips, and from whichever one is under the cursor or open.
    progs.forEach((p, i) => {
      const on = f.prog === p, hi = on || hover === p, al = intro * (f.prog && !on ? 0.16 : 1);
      if (!p.lr || !(hi || p.count >= 100)) return;
      const b0 = P(p.lr, p.la), b1 = P(R0P + 3, p.a);
      g.strokeStyle = `rgba(${hi ? HOT : INK},${(hi ? 1 : 0.3) * al})`; g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.stroke();
      if (!reduce && al > 0.5) { // a signal runs in along the line, from the strip to the logo
        const T = Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) / k / SPEED, C = T + 3 + 9 * hash(i), u = (ts + hash(i + 70) * C) % C;
        if (u < T) { const q = u / T; g.fillStyle = `rgba(${HOT},${al * Math.min(1, Math.sin(Math.PI * q) * 5)})`; circle(b1[0] + (b0[0] - b1[0]) * q, b1[1] + (b0[1] - b1[1]) * q, 1.7); g.fill(); }
      }
    });
    // Every program's logo, inside the ring.
    for (const p of progs) {
      if (!p.lr) continue;
      const on = f.prog === p, hi = on || hover === p, al = intro * (f.prog && !on ? 0.16 : 1), [lx, ly] = P(p.lr, p.la), R = Math.max(3, p.ls * k);
      if (lx < -R || lx > W + R || ly < -R || ly > H + R) continue;
      drawLogo(p, lx, ly, R, al, hi);
      if (on) { // what gets reported here, as a ring of arcs round the logo, biggest class first from the top
        const tot = p.all.reduce((sum, c) => sum + c[1], 0) || 1; let a0 = -Math.PI / 2;
        g.lineWidth = 3;
        p.all.forEach(([, n], j) => { const a1 = a0 + (n / tot) * TAU; g.strokeStyle = `rgba(${INK},${j % 2 ? 0.4 : 0.95})`; g.beginPath(); g.arc(lx, ly, R + 9, a0 + 0.03, Math.max(a0 + 0.04, a1 - 0.03)); g.stroke(); a0 = a1; });
        g.lineWidth = 1;
      }
    }

    // Names round the bezel for as many of the bigger programs as fit, clear of the corner text.
    if (!panelOpen() && wide()) occ.push([20, H - 176, 352, H - 22], [W - 548, H - 112, W - 26, H - 20]);
    const name = (p: PNode, i: number, hot: boolean) => {
      const [x, y] = P(p.tip + 5, p.a);
      labs.push({ n: p, ax: x, ay: y, id: hot ? p.tag : undefined, name: clip(p.name, hot ? 34 : 22), nameHot: hot, sub: hot || i < 12 ? plural(p.count, "report") + (hot && p.bounty ? `  ${money(p.bounty)}` : "") : undefined,
        subHot: hot, al: intro, hot, px: 11.5, pr: hot ? 4e9 : p.count, dir: p.a + rotNow, reach: 12 });
    };
    if (f.prog) name(f.prog, 0, true);
    else progs.slice(0, 80).forEach((p, i) => name(p, i, hover === p));
    if (hover?.k === "prog" && hover !== f.prog && !labs.some((q) => q.n === hover)) name(hover, 99, true);
  };

  // ---------- pointer ----------
  const pick = (mx: number, my: number): Node | null => {
    setDial();
    for (const q of placed) if (mx > q.r[0] && mx < q.r[2] && my > q.r[1] && my < q.r[3]) return q.n;
    if (refs.lens.current === "programs") {
      let hit: PNode | null = null, hd = 1e9;
      for (const p of progs) if (p.lr) { const [x, y] = P(p.lr, p.la), d = Math.hypot(x - mx, y - my); if (d < Math.max(8, p.ls * cam.s + 2) && d < hd) { hd = d; hit = p; } }
      if (hit) return hit;
      const [wx, wy] = unS(mx, my), r = Math.hypot(wx, wy), a = Math.atan2(wy, wx);
      if (r < R0P - 6 || r > rbp + 6) return null;
      // The strip whose slice of the dial the cursor is in, as long as the cursor is not far beyond its tip.
      let best: PNode | null = null, bd = 1e9;
      for (const p of progs) { const d = Math.abs(angDiff(a, p.a)) * R0P - (p.cols * PITCH) / 2; if (d < bd) { bd = d; best = p; } }
      return best && bd < Math.max(1.5, 5 / cam.s) && r < best.tip + 40 ? best : null;
    }
    for (const o of orbitNow) if (Math.hypot(o.x - mx, o.y - my) < 16) return o.p;
    for (const o of ringNow) if (Math.hypot(o.x - mx, o.y - my) < 20) return o.c;
    const f = refs.focus.current, k = cam.s;
    // Inside an open weakness: the nearest report, if its names have arrived.
    const ow = f.weak, buf = ow && buffers.get(ow);
    if (ow && buf && ow.bloom > 0.5) {
      const [dcx, dcy] = P(ow.discAt, ow.a);
      if (Math.hypot(mx - dcx, my - dcy) < ow.discR * k + 10) {
        let bi = -1, bd = Math.max(7, 2.6 * k);
        for (let i = 0; i < ow.n; i++) { const d = Math.hypot(buf[i * 2] - mx, buf[i * 2 + 1] - my); if (d < bd) { bd = d; bi = i; } }
        return bi >= 0 && ow.leaves[bi] ? ow.leaves[bi] : ow;
      }
    }
    for (const c of classes) { const [x, y] = P(G.R1, c.a); if (Math.hypot(x - mx, y - my) < Math.max(12, c.r * k + 4)) return c; }
    const [wx, wy] = unS(mx, my), r = Math.hypot(wx, wy), a = Math.atan2(wy, wx);
    if (r < G.R1 - 26 || r > rb + 8) return null;
    const c = classes.find((x) => Math.abs(angDiff(a, x.a)) <= x.span / 2 + gap);
    if (!c) return null;
    // Strips become targets once a class is open, or once you have zoomed in far enough to aim at them.
    if ((f.cls === c || (!f.cls && k > s0 * 1.7)) && r > G.R0 - 8) {
      let best: WNode | null = null, bd = 1e9;
      for (const w of c.weaks) {
        const d = angDiff(a, w.a), along = r * Math.cos(d), lat = Math.abs(r * Math.sin(d)), half = (w.cols * G.PITCH) / 2 + Math.max(1.2, 5 / k);
        if (along >= G.R0 - 6 && along <= w.tip + 6 && lat <= half && lat / half < bd) { bd = lat / half; best = w; }
      }
      if (best) return best;
    }
    return c;
  };

  // ---------- frame ----------
  const finish = () => {
    // Crosshair with the cursor's map coordinates, then retire text elements this frame did not use.
    if (mouse.x > 0 && !drag) {
      g.fillStyle = `rgba(${INK},0.07)`; g.fillRect(mouse.x, 0, 1, H); g.fillRect(0, mouse.y, W, 1);
      const [wx, wy] = unS(mouse.x, mouse.y), pad = (v: number) => (v < 0 ? "-" : "") + String(Math.abs(Math.round(v))).padStart(4, "0");
      if (!hover) text(`x ${pad(wx)} y ${pad(wy)}`, Math.min(mouse.x + 6, W - 90), Math.min(mouse.y + 13, H - 6), 0.3, 10);
    }
    for (let i = used; i < shown; i++) pool[i].setAttribute("opacity", "0");
    shown = used;
  };

  const frame = (t: number) => {
    if (!born) born = t;
    now = t; setDial();
    const dt = Math.min(64, t - last); last = t;
    const e = reduce ? 1 : 1 - Math.exp(-dt / 190), lens = refs.lens.current, f = refs.focus.current;
    if (lastLens !== lens) { // switching views is a cut with a fade-in, not a flight
      const first = lastLens === null; lastLens = lens; retarget(); hover = null; labKey = "";
      if (!first) { Object.assign(cam, tgt); born = t; }
    }
    if (lastFocus !== f) { lastFocus = f; retarget(); }
    cam.x += (tgt.x - cam.x) * e; cam.y += (tgt.y - cam.y) * e; cam.s += (tgt.s - cam.s) * e;
    cam.rot += (tgt.rot - cam.rot) * e; cam.ax += (tgt.ax - cam.ax) * e; cam.ay += (tgt.ay - cam.ay) * e;
    for (const c of classes) { const to = f.cls === c ? c.tip + 16 : rb; c.bz += (to - c.bz) * e; } // the open class's bezel arc closes in on its strips
    for (const w of weaks) { const to = f.weak === w && !w.flat ? 1 : 0; if (w.bloom !== to) { w.bloom += (to - w.bloom) * (reduce ? 1 : 1 - Math.exp(-dt / 230)); if (Math.abs(to - w.bloom) < 0.002) w.bloom = to; } }
    const intro = reduce ? 1 : ss(0, 1400, t - born);
    dtNow = dt;
    rotNow = cam.rot - (1 - ease(intro)) * 0.45; // the dial turns into place as it appears
    cosR = Math.cos(rotNow); sinR = Math.sin(rotNow);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    used = 0; labs = []; occ = [];

    {
      if (lens === "programs") drawProgs(intro, f); else drawDial(intro, f);
      // Laying labels out is the costly part, so it is only redone when the view, the cursor target or the data changes.
      const key = `${cam.x.toFixed(2)}|${cam.y.toFixed(2)}|${cam.s.toFixed(4)}|${rotNow.toFixed(4)}|${cam.ax.toFixed(1)}|${cam.ay.toFixed(1)}|${W}x${H}|${labs.length}|${nodeKey(hover)}|${nodeKey(f.leaf || f.weak || f.cls || f.prog)}|${intro.toFixed(2)}|${refs.colPage.current}|${refs.dataVer.current}|${f.weak ? f.weak.bloom.toFixed(3) : ""}|${lens}`;
      if (key !== labKey) {
        labKey = key; laid = [];
        const fixed = occ.length; // areas reserved before any label is placed
        labs.sort((a, b) => Number(b.hot) - Number(a.hot) || b.pr - a.pr);
        for (let i = 0; i < labs.length && i < 420; i++) { const q = place(labs[i]); if (q) laid.push(q); }
        placed = laid.filter((q) => q.L.n).map((q) => ({ r: q.rect, n: q.L.n! }));
        occ.length = fixed;
      }
      for (const q of laid) drawLab(q);
    }
    finish();
    raf = requestAnimationFrame(frame);
  };

  const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y }; moved = false; cv.setPointerCapture(e.pointerId); };
  const move = (e: PointerEvent) => {
    mouse = { x: e.clientX, y: e.clientY };
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) moved = true;
      if (moved) { tgt.x = cam.x = drag.cx - dx / cam.s; tgt.y = cam.y = drag.cy - dy / cam.s; cv.style.cursor = "grabbing"; }
    } else { hover = pick(e.clientX, e.clientY); cv.style.cursor = hover ? "pointer" : "grab"; }
  };
  const up = (e: PointerEvent) => {
    if (drag && !moved) {
      const n = pick(e.clientX, e.clientY), f = refs.focus.current;
      if (n?.k === "ring") hooks.open(`/cve/${n.id}`);
      else if (n && !(n.k === "weak" && f.weak === n && !f.leaf)) hooks.setFocus(n);
      else if (!n && panelOpen()) hooks.stepOut();
    }
    drag = null; cv.style.cursor = "grab";
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const ns = Math.max(tgt.s * 0.2, Math.min(9, tgt.s * Math.exp(-e.deltaY * 0.0016)));
    const px = (e.clientX - cam.ax) / cam.s + cam.x, py = (e.clientY - cam.ay) / cam.s + cam.y; // the map point under the cursor stays put
    tgt.x = px - (e.clientX - tgt.ax) / ns; tgt.y = py - (e.clientY - tgt.ay) / ns; tgt.s = ns;
  };
  const leave = () => { mouse = { x: -1, y: -1 }; hover = null; };

  size();
  Object.assign(cam, tgt, { s: reduce ? tgt.s : tgt.s * 0.9 });
  window.addEventListener("resize", size);
  cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move); cv.addEventListener("pointerup", up);
  cv.addEventListener("pointerleave", leave); cv.addEventListener("wheel", wheel, { passive: false });
  raf = requestAnimationFrame(frame);

  // Lets the automated test ask where things are on screen instead of guessing from label positions.
  const settled = () => Math.abs(tgt.s - cam.s) < 0.003 * cam.s && Math.abs(tgt.rot - cam.rot) < 0.003 && Math.hypot(tgt.x - cam.x, tgt.y - cam.y) * cam.s < 0.6;
  (window as unknown as { __vg?: unknown }).__vg = {
    cls: (id: string) => { const c = classes.find((x) => x.id === id); return c ? P(G.R1, c.a) : null; },
    weak: (name: string) => { const w = weaks.find((x) => x.name === name); return w ? (w.bloom > 0.5 ? P(w.discAt, w.a) : P((G.DOT0 + w.tip) / 2, w.a)) : null; },
    leaf: (name: string, i: number) => { const w = weaks.find((x) => x.name === name), b = w && buffers.get(w); return b ? [b[i * 2], b[i * 2 + 1]] : null; },
    prog: (name: string) => { const p = progs.find((x) => x.name === name); return p ? (p.lr ? P(p.lr, p.la) : P((DOT0P + p.tip) / 2, p.a)) : null; },
    orbit: () => orbitNow.map((o) => [o.p.name, o.x, o.y]),
    ring: () => ringNow.map((o) => [o.c.id, o.x, o.y]),
    weakOf: (cls: string, name: string) => { const w = weaks.find((x) => x.cls.id === cls && x.name === name); return w ? (w.bloom > 0.5 ? P(w.discAt, w.a) : P((G.DOT0 + w.tip) / 2, w.a)) : null; },
    state: () => ({ s: cam.s, rot: cam.rot, hover: nodeKey(hover), settled: settled() }),
  };

  return () => {
    cancelAnimationFrame(raf); window.removeEventListener("resize", size);
    cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerup", up);
    cv.removeEventListener("pointerleave", leave); cv.removeEventListener("wheel", wheel);
    for (const el of pool) el.remove();
  };
}
