"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Graph, Leaf } from "@/lib/db";
import { SEVERITIES, STATUSES, statusLabel } from "@/lib/taxonomy";
import { money, num, plural } from "./map/format";
import { CVE_DOTS, NONE, SURFACE_DOTS, build, ensureDisc, placeCore } from "./map/layout";
import type { Focus, Lens, Model, Node, WNode } from "./map/layout";
import { namesPerPage, startMap } from "./map/renderer";
import { SITE } from "@/lib/site";
import Find from "./Find";
import Mark from "./Mark";
import CveList from "./CveList";
import HostList from "./HostList";
import s from "./MapView.module.css";

type Row = { id: number; title: string; program: string | null; severity: string | null; bounty: number | null; votes: number; weakness: string | null; substate: string | null };
type Listing = { key: string; total: number; rows: Row[] };

function syncUrl(f: Focus, lens: Lens) {
  const q = new URLSearchParams();
  if (lens !== "classes") q.set("view", lens);
  if (f.prog) q.set("program", f.prog.name);
  if (f.cls?.prog) q.set("program", f.cls.id); // in the Programs view a hub is a program
  else if (f.cls) q.set("class", f.cls.id);
  else if (f.group) q.set(lens === "cves" ? "year" : "letter", f.group.id);
  if (f.weak) q.set("weakness", f.weak.name);
  window.history.replaceState(null, "", q.size ? `?${q}` : window.location.pathname);
}

// Laying out every dial takes real work, and on the server the page is rendered for every visitor with the same data.
// There the layout is kept until the data changes (the page only reads counts and names from it); a browser builds its own.
let served: { stamp: number; model: Model } | null = null;
function layoutOf(graph: Graph): Model {
  if (typeof window !== "undefined") return build(graph);
  if (served?.stamp !== graph.stamp) served = { stamp: graph.stamp, model: build(graph) };
  return served.model;
}

export type Viewer = { name: string | null; picture: string | null } | null;

// `viewer` is the signed-in person, if any. Connecting an AI is offered only to them.
export default function MapView({ graph, viewer = null, needsKey = false }: { graph: Graph; viewer?: Viewer; needsKey?: boolean }) {
  const model = useMemo(() => layoutOf(graph), [graph]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [focus, setFocusState] = useState<Focus>(NONE);
  const focusRef = useRef(focus);
  const [lens, setLensState] = useState<Lens>("classes");
  const lensRef = useRef<Lens>("classes");
  const dataVer = useRef(0);
  const footprint = useRef(new Map<WNode, number[]>());
  const [marked, setMarked] = useState(0);
  const [, setTick] = useState(0);
  const [index, setIndex] = useState<"programs" | "weaknesses" | null>(null);
  const [indexFilter, setIndexFilter] = useState("");
  const [colPage, setColPageState] = useState(0);
  const colPageRef = useRef(0);
  const setColPage = (n: number) => { colPageRef.current = n; setColPageState(n); };
  const [finding, setFinding] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState("");
  const [site, setSite] = useState("");
  const openConnect = useCallback(() => { setSite(window.location.origin); setFinding(false); setConnecting(true); }, []);
  const copy = (label: string, value: string) => {
    navigator.clipboard?.writeText(value).then(() => { setCopied(label); setTimeout(() => setCopied(""), 1600); }).catch(() => {});
  };
  const [sort, setSort] = useState("votes");
  const [status, setStatus] = useState("");
  const [list, setList] = useState<Listing | null>(null);

  // What is open. A program can be open in either view: as a bubble in Programs, or as its footprint on the dial.
  const wantLeaf = useRef(""); // a CVE to open as soon as the strip it is in has loaded
  const show = useCallback((target: Node | null, view?: Lens) => {
    let n = target;
    if (n?.k === "ring") return; // ids on the ring open their own page instead
    const here = lensRef.current;
    // On the Programs index a strip (or logo) stands for a program: opening it goes to that program's hub on its letter's dial.
    // An exploited CVE on the CVE index: open the band of the month it sits in, then the CVE itself once that band's names arrive.
    if (n?.k === "x") {
      const id = `${n.year}-${String(n.month).padStart(2, "0")}`, strip = n.hub.sub?.classes.find((c) => c.id === id)?.weaks.find((w) => w.band === 0);
      if (!strip) return;
      wantLeaf.current = n.id; n = strip;
    }
    // On an index a strip stands for a hub on the dial below (a program, a month): opening it goes there.
    if (n?.k === "weak" && n.hub) n = n.hub;
    // A program can be shown two ways: opened in the Programs view, or marked on the vulnerability dial.
    if (n?.k === "prog" && n.hub && (view ?? (here === "cves" ? "programs" : here)) === "programs") n = n.hub;
    const f: Focus = !n ? NONE
      : n.k === "cls" ? (n.dial === "p" || n.dial === "y" ? { ...NONE, group: n } : { ...NONE, group: n.group ?? null, cls: n })
      : n.k === "weak" ? { ...NONE, group: n.cls.group ?? null, cls: n.cls, weak: n }
      : n.k === "leaf" ? { ...NONE, group: n.w.cls.group ?? null, cls: n.w.cls, weak: n.w, leaf: n }
      : { ...NONE, prog: n };
    if (f.weak !== focusRef.current.weak) { colPageRef.current = 0; setColPageState(0); }
    // Each kind of thing lives in its own view.
    const home = !n || n.k === "prog" ? null : n.k === "cls" ? n : n.k === "weak" ? n.cls : n.w.cls;
    const l: Lens = view ?? (!n ? here : home ? (home.dial === "c" || home.dial === "y" ? "cves" : home.dial === "v" ? "classes" : "programs") : here === "cves" ? "programs" : here);
    lensRef.current = l; setLensState(l);
    focusRef.current = f; setFocusState(f); setIndex(null);
    syncUrl(f, l);
  }, []);
  const setFocus = useCallback((n: Node | null) => show(n), [show]);
  const setLens = useCallback((l: Lens) => show(null, l), [show]);
  const stepOut = useCallback(() => {
    const f = focusRef.current;
    show(f.leaf ? f.weak : f.weak ? f.cls : f.cls?.group ?? null); // out of a program is its letter's dial, and out of that the index
  }, [show]);

  // Ids and titles behind a weakness's dots arrive the first time they are needed.
  const loadLeaves = useCallback(async (w: WNode) => {
    if (w.loaded || w.loading) return;
    w.loading = true;
    try {
      // What a strip holds depends on its dial: a year's band of CVEs, a program's reports in one class or the hosts
      // under one of its domains, or a weakness's reports.
      const on = w.cls.dial, hosts = on === "s" && w.plain;
      const got = await (await fetch(on === "c" ? `/api/cve-band?year=${w.cls.id.slice(0, 4)}&month=${Number(w.cls.id.slice(5))}&band=${w.band}&limit=${CVE_DOTS}`
        : hosts ? `/api/subdomains?program=${encodeURIComponent(w.cls.id)}&suffix=${encodeURIComponent(w.name)}&limit=${SURFACE_DOTS}`
        : on === "s" ? `/api/leaves?program=${encodeURIComponent(w.cls.id)}&class=${encodeURIComponent(w.cid || "")}`
        : `/api/leaves?weakness=${encodeURIComponent(w.name)}`)).json();
      const rows: Leaf[] = hosts ? (got.rows as string[]).map((h) => [h, "", 2, 0, 0, ""]) : on === "c" ? got.rows : got;
      ensureDisc(rows.length);
      w.leaves = rows.map((d, i) => ({ k: "leaf", d, i, w }));
      if (rows.length === w.n) w.sev = rows.map((d) => d[2]).join(""); // same reports, fresher severities
      w.loaded = true;
      dataVer.current++; setTick((t) => t + 1);
    } catch { /* stays as dots; opening the weakness again retries */ } finally { w.loading = false; }
  }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      if (focus.weak) {
        await loadLeaves(focus.weak);
        const want = wantLeaf.current, found = want && live && focusRef.current.weak === focus.weak && !focusRef.current.leaf ? focus.weak.leaves.find((l) => l.d[0] === want) : null;
        if (want && focus.weak.loaded) wantLeaf.current = "";
        if (found) show(found);
      }
      // Then the rest of the open class, so its other weaknesses open instantly.
      if (focus.cls?.dial === "v" || focus.cls?.dial === "s") for (const w of focus.cls.weaks) { if (!live) return; if (!w.plain) await loadLeaves(w); }
    })();
    return () => { live = false; };
  }, [focus.cls, focus.weak, loadLeaves, show]);

  // The exploited CVEs drawn inside the CVE index arrive the first time that view opens.
  useEffect(() => {
    if (lens !== "cves" || model.core.length) return;
    let live = true;
    fetch("/api/cve-core").then((x) => x.json()).then((rows) => { if (live && Array.isArray(rows)) { placeCore(model, rows); dataVer.current++; setTick((t) => t + 1); } }).catch(() => {});
    return () => { live = false; };
  }, [lens, model]);

  // A program open on the dial: find which dots are its reports.
  useEffect(() => {
    footprint.current = new Map();
    dataVer.current++;
    const p = focus.prog;
    if (!p || lens !== "classes") return;
    let live = true;
    fetch(`/api/program-dots?program=${encodeURIComponent(p.name)}`).then((r) => r.json()).then((dots: Record<string, number[]>) => {
      if (!live) return;
      const next = new Map<WNode, number[]>(); let total = 0;
      for (const w of model.weaks) { const mine = dots[w.name]?.filter((i) => i < w.n); if (mine?.length) { next.set(w, mine); total += mine.length; } }
      footprint.current = next; dataVer.current++; setMarked(total);
    }).catch(() => {});
    return () => { live = false; };
  }, [focus.prog, lens, model]);

  // Reports for the weakness or program that is open.
  const hub = focus.cls?.prog ? focus.cls : null; // a program open in the Programs view
  const filter = focus.weak && focus.weak.cls.dial === "v" ? `weakness=${encodeURIComponent(focus.weak.name)}`
    : hub && focus.weak?.cid ? `program=${encodeURIComponent(hub.id)}&class=${focus.weak.cid}`
    : hub && !focus.weak ? `program=${encodeURIComponent(hub.id)}`
    : focus.prog ? `program=${encodeURIComponent(focus.prog.name)}` : "";
  const listKey = filter ? `${filter}&sort=${sort}${status ? `&status=${status}` : ""}` : "";
  useEffect(() => {
    if (!listKey) return;
    let live = true;
    fetch(`/api/reports?${listKey}&limit=40`).then((r) => r.json()).then((j) => { if (live) setList({ key: listKey, ...j }); }).catch(() => {});
    return () => { live = false; };
  }, [listKey]);
  const loadMore = () => {
    if (!list) return;
    fetch(`/api/reports?${listKey}&limit=40&offset=${list.rows.length}`).then((r) => r.json())
      .then((j) => setList((p) => (p && p.key === listKey ? { ...p, rows: [...p.rows, ...j.rows] } : p))).catch(() => {});
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "Escape") { if (finding) setFinding(false); else if (connecting) setConnecting(false); else if (index) setIndex(null); else stepOut(); }
      else if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      else if (e.key === "f" || e.key === "/") { e.preventDefault(); setConnecting(false); setFinding(true); }
      else if (e.key === "c" && viewer) openConnect();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finding, connecting, index, stepOut, openConnect, viewer]);

  // The map itself.
  useEffect(() => {
    const stop = startMap(canvasRef.current!, svgRef.current!, model, { focus: focusRef, lens: lensRef, colPage: colPageRef, dataVer, footprint }, { setFocus, stepOut, open: (path) => window.open(path, "_blank", "noopener") });
    // Restore what the link points at, once the first frame is out of the way.
    const q = new URLSearchParams(window.location.search), asked = q.get("view"), view: Lens | undefined = asked === "programs" || asked === "cves" ? asked : undefined;
    const pr = model.progs.find((x) => x.name === q.get("program"));
    // In the CVE view a month is "class=2024-03" and a year is "year=2024" (or, in older links, "class=2024").
    const year = view === "cves" ? model.cve.classes.find((x) => x.id === (q.get("year") || (q.get("class") || "").slice(0, 4))) : undefined;
    const c = view === "programs" ? pr?.hub : view === "cves" ? year?.sub?.classes.find((x) => x.id === q.get("class")) : model.classes.find((x) => x.id === q.get("class"));
    const wk = c?.weaks.find((x) => x.name === q.get("weakness")), letter = view === "programs" ? model.programs.classes.find((x) => x.id === q.get("letter")) : year;
    const start = wk || c || letter || pr || null;
    if (view || start) queueMicrotask(() => show(start, start && start.k !== "prog" ? undefined : view));
    return stop;
  }, [model, setFocus, stepOut, show]);

  const { group, cls, weak, leaf, prog } = focus;
  const active = !!(cls || prog || group);
  const onCves = lens === "cves", onProg = lens === "programs", onVuln = lens === "classes";
  // How many CVEs fall in each band, all years together.
  const cveBands = useMemo(() => [0, 1, 2, 3, 4].map((b) => graph.cveYears.reduce((t, y) => t + y.months.reduce((u, m) => u + m[b], 0), 0)), [graph]);
  const here = cls?.prog ?? null; // the program that is open, in the Programs view
  const biggest = useMemo(() => [...model.classes].sort((a, b) => b.count - a.count)[0], [model]);
  const classById = useMemo(() => Object.fromEntries(model.classes.map((c) => [c.id, c])), [model]);
  const rowMeta = (r: Row, withProgram = true) =>
    [r.substate && r.substate !== "resolved" ? statusLabel(r.substate) : null, withProgram ? r.program : null, r.severity && r.severity !== "none" ? r.severity : null, money(r.bounty), r.votes ? `${r.votes} votes` : null].filter(Boolean).join("  ·  ");
  const reports = (withProgram: boolean) => (
    <>
      <div className={s.sorts} role="group" aria-label="Sort reports">
        {[["votes", "Most upvoted"], ["bounty", "Biggest bounty"], ["new", "Newest"]].map(([k, label]) => (
          <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>
        ))}
      </div>
      <div className={`${s.sorts} ${s.statuses}`} role="group" aria-label="Filter by report status">
        {[["", "All"], ...STATUSES.slice(0, 4)].map(([k, label]) => (
          <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{label}</button>
        ))}
      </div>
      {list?.key === listKey ? (<>
        {list.rows.length === 0 && <p className={s.note}>No reports with this status here.</p>}
        {list.rows.map((r) => (
          <a key={r.id} className={s.report} href={`/report/${r.id}`} target="_blank" rel="noreferrer">
            <span>{r.title}</span><small>{[withProgram ? null : r.weakness, rowMeta(r, withProgram)].filter(Boolean).join("  ·  ")}</small>
          </a>
        ))}
        {list.rows.length < list.total && <button className={s.more} onClick={loadMore}>Show more ({num(list.total - list.rows.length)} left)</button>}
      </>) : <p className={s.note}>Loading reports…</p>}
    </>
  );

  return (
    <div className={s.root}>
      <canvas ref={canvasRef} className={s.canvas} aria-label="Map of disclosed vulnerability reports grouped by class, weakness and program" />
      <svg ref={svgRef} className={s.labels} aria-hidden="true" />
      <span className={`${s.corner} ${s.tl}`} /><span className={`${s.corner} ${s.tr}`} /><span className={`${s.corner} ${s.bl}`} /><span className={`${s.corner} ${s.br}`} />

      <header className={s.top}>
        <nav className={s.crumbs} aria-label="Position in the map">
          {!active && !index && graph.total > 0 && (
            <span className={s.lens} role="group" aria-label="What the map is organised by">
              <button aria-pressed={lens === "classes"} onClick={() => setLens("classes")}>Vulnerabilities</button>
              <button aria-pressed={onProg} onClick={() => setLens("programs")}>Programs</button>
              <button aria-pressed={lens === "cves"} onClick={() => setLens("cves")}>CVEs</button>
            </span>
          )}
          {active && <><button onClick={() => setFocus(null)}>{onProg ? "Programs" : lens === "cves" ? "CVEs" : "Map"}</button><i>/</i></>}
          {group && (<>{cls ? <button onClick={() => setFocus(group)}>{group.id}</button> : <b>{group.id}</b>}{cls && <i>/</i>}</>)}
          {prog && <b>{prog.name}</b>}
          {cls && (weak ? <button onClick={() => setFocus(cls)}>{cls.name}</button> : <b>{cls.name}</b>)}
          {weak && (<><i>/</i>{leaf ? <button onClick={() => setFocus(weak)}>{onVuln ? weak.tag : weak.name}</button> : <b>{onVuln ? weak.tag : weak.name}</b>}</>)}
          {leaf && !(onProg && weak?.plain) && (<><i>/</i><b>{typeof leaf.d[0] === "number" ? "#" : ""}{leaf.d[0]}</b></>)}
        </nav>
        <div className={s.brand}><Mark size={24} />{SITE.name}</div>
        <div className={s.keys}>
          {(active || index) && <button className={s.key} onClick={() => (index ? setIndex(null) : stepOut())}>Back <kbd>Esc</kbd></button>}
          <button className={s.key} onClick={() => setFinding(true)}>Find <kbd>F</kbd></button>
          {viewer && <button className={`${s.key} ${s.primary}`} onClick={openConnect}>Connect AI <kbd>C</kbd></button>}
          <a className={`${s.key} ${s.acct}`} href="/account" aria-label={viewer ? "Your account" : "Sign in"}>
            {viewer ? (viewer.picture ? <img src={viewer.picture} alt="" width={22} height={22} referrerPolicy="no-referrer" /> : (viewer.name || "Account").split(" ")[0])
              : "Sign in"}
          </a>
        </div>
      </header>

      {graph.total === 0 ? (
        <section className={s.empty}>
          <h1>No reports loaded yet.</h1>
          <p>In the <code>web</code> folder, run <code>node scripts/ingest.mjs import</code> to load the public report list, then <code>node scripts/ingest.mjs details</code> for the write-ups.</p>
        </section>
      ) : (
        <section className={`${s.hero} ${active ? s.gone : ""}`} aria-hidden={active}>
          {/* The words in the corner describe the view that is showing. */}
          <h1>{onProg ? "Every program, and everything reported to it." : onCves ? "Every CVE, with the exploited ones in red." : "Every disclosed bug, mapped to how it was found."}</h1>
          <p>{onProg ? `${num(graph.programs)} programs with disclosed reports, ${num(graph.surfaces.length)} of them with their subdomains mapped. Open a letter or a logo, then a program, to see what was found there and where to look.`
            : onCves ? `${num(model.cveTotal)} registered CVEs, ${num(model.cveHot)} of them exploited in the wild. Open a year, then a month, to see which ones can be checked today.`
            : `${num(graph.total)} public HackerOne reports across ${num(graph.programs)} programs. Open a class, pick a weakness, and read how each bug was found.`}</p>
          <p className={s.act}>
            <button className={s.link} tabIndex={active ? -1 : 0} onClick={() => setFocus(onProg ? model.progs[0] ?? null : onCves ? model.cve.classes[model.cve.classes.length - 1] ?? null : biggest)}>{onProg ? "Open the biggest program" : onCves ? "Open the latest year" : "Explore the map"}</button> or{" "}
            <button className={s.link} tabIndex={active ? -1 : 0} onClick={() => setFinding(true)}>search the reports.</button>
          </p>
          <p className={s.links}>
            <Link tabIndex={active ? -1 : 0} href="/browse">Browse</Link>
            <Link tabIndex={active ? -1 : 0} href="/bypasses">Bypasses</Link>
            <Link tabIndex={active ? -1 : 0} href="/payloads">Payloads</Link>
            <Link tabIndex={active ? -1 : 0} href="/cves">CVEs</Link>
            <Link tabIndex={active ? -1 : 0} href="/about">About</Link>
          </p>
        </section>
      )}

      <div className={`${s.stats} ${active || index ? s.gone : ""}`} style={{ "--n": onVuln ? 5 : 4 } as React.CSSProperties}>
        {/* The counters, too, belong to the view that is showing. */}
        {onProg ? (<>
          <button className={s.stat} onClick={() => { setIndexFilter(""); setIndex("programs"); }}><b>{num(graph.programs)}</b><span>programs</span></button>
          <div className={s.stat}><b>{num(graph.total)}</b><span>reports to them</span></div>
          <div className={s.stat}><b>{num(graph.surfaces.length)}</b><span>with subdomains</span></div>
          <div className={s.stat}><b>{num(graph.surfaces.reduce((t, x) => t + x.total, 0))}</b><span>subdomains</span></div>
        </>) : onCves ? (<>
          <div className={s.stat}><b>{num(model.cveTotal)}</b><span>registered CVEs</span></div>
          <div className={s.stat}><b className={s.red}>{num(model.cveHot)}</b><span>exploited in the wild</span></div>
          <div className={s.stat}><b>{num(cveBands[1])}</b><span>ready to check</span></div>
          <div className={s.stat}><b>{num(cveBands[2])}</b><span>likely to be exploited</span></div>
        </>) : (<>
          <div className={s.stat}><b>{num(graph.total)}</b><span>reports</span></div>
          <div className={s.stat}><b>{num(graph.classes.length)}</b><span>classes</span></div>
          <button className={s.stat} onClick={() => { setIndexFilter(""); setIndex("weaknesses"); }}><b>{num(graph.weaknessCount)}</b><span>weaknesses</span></button>
          <button className={s.stat} onClick={() => { setIndexFilter(""); setIndex("programs"); }}><b>{num(graph.programs)}</b><span>programs</span></button>
          <div className={s.stat}><b>{money(graph.totalBounty) || "–"}</b><span>in bounties</span></div>
        </>)}
        <p>{lens === "cves"
          ? "Each key is a year and each strip a month of CVEs, red at the root where they are exploited. The red dots inside are every exploited CVE: click one, or a year."
          : lens === "programs"
          ? "Each hub is a letter and each strip a program. Every logo inside is a program too: click a letter or a logo to open its own dial."
          : "Each strip is a weakness and each line in it a row of reports. Lines through the middle join classes that turn up in the same reports."}</p>
      </div>

      <aside className={`${s.panel} ${active || index ? s.open : ""}`} aria-hidden={!active && !index}>
        {index === "programs" && !active && (<>
          <p className={s.tag}>All programs</p>
          <h2>{num(model.progs.length)} programs</h2>
          <p className={s.figure}>Every program with a disclosed report, biggest first</p>
          <input className={s.filter} value={indexFilter} onChange={(e) => setIndexFilter(e.target.value)} placeholder="Filter by name" aria-label="Filter programs by name" />
          {model.progs.filter((p) => p.name.toLowerCase().includes(indexFilter.trim().toLowerCase())).map((p) => (
            <button key={p.name} className={s.row} onClick={() => setFocus(p)}>
              <span className={s.withIcon}>{p.logo ? <img src={p.logo} alt="" width={20} height={20} loading="lazy" /> : <i />}{p.name}</span><small>{num(p.count)}</small>
            </button>
          ))}
        </>)}
        {index === "weaknesses" && !active && (<>
          <p className={s.tag}>All weaknesses</p>
          <h2>{num(graph.weaknessCount)} weaknesses</h2>
          <p className={s.figure}>Grouped by vulnerability class</p>
          {model.classes.map((c) => (
            <div key={c.id}>
              <h3>{c.name} · {num(c.count)}</h3>
              {[...c.weaks].sort((a, b) => b.count - a.count).map((w) => (
                <button key={w.name} className={s.row} onClick={() => setFocus(w)}><span>{w.name}</span><small>{num(w.count)}</small></button>
              ))}
            </div>
          ))}
        </>)}
        {onCves && group && !cls && (<>
          <p className={s.tag}>CVEs published in</p>
          <h2>{group.id}</h2>
          <p className={s.figure}>{plural(group.count, "CVE")}{group.hot ? ` · ${num(group.hot)} exploited in the wild` : ""}</p>
          <p className={s.note}>The dial reads like a clock, January at the top. Each month fans into five bands: exploited in red, ready to check in bright, then likely, possible and unlikely.</p>
          <h3>Months</h3>
          {(group.sub?.classes ?? []).map((c) => (
            <button key={c.id} className={s.row} onClick={() => setFocus(c)}><span>{c.name}{c.hot ? <em className={s.hot}> · {num(c.hot)} exploited</em> : null}</span><small>{num(c.count)}</small></button>
          ))}
        </>)}
        {onCves && cls && !weak && (<>
          <p className={s.tag}>CVEs published in</p>
          <h2>{cls.name} {group?.id}</h2>
          <p className={s.figure}>{plural(cls.count, "CVE")}{cls.hot ? ` · ${num(cls.hot)} exploited in the wild` : ""}</p>
          <h3>How this month&apos;s CVEs sort</h3>
          {[...cls.weaks].sort((a, b) => a.band - b.band).map((w) => (
            <button key={w.name} className={s.row} onClick={() => setFocus(w)}><span>{w.name}</span><small>{num(w.count)}</small></button>
          ))}
          <p className={s.note}>Likelihood is the chance of exploitation in the next 30 days. Open a band to see its CVEs.</p>
        </>)}
        {onCves && cls && weak && !leaf && (<>
          <p className={s.tag}>{cls.name} {group?.id} · {weak.tag}</p>
          <h2>{weak.name}</h2>
          <p className={s.figure}>{plural(weak.count, "CVE")} published in {cls.name} {group?.id}</p>
          {weak.count > weak.n && <p className={s.note}>The map draws the {num(weak.n)} most likely to be exploited; the list holds all of them.</p>}
          {(() => {
            const per = namesPerPage(typeof window === "undefined" ? 900 : window.innerHeight), pages = Math.max(1, Math.ceil(weak.n / per)), page = Math.min(colPage, pages - 1);
            return pages > 1 ? (
              <div className={s.pager}><div>
                <button disabled={page === 0} onClick={() => setColPage(page - 1)}>Previous names</button>
                <button disabled={page >= pages - 1} onClick={() => setColPage(page + 1)}>Next names</button>
              </div></div>
            ) : null;
          })()}
          <CveList year={Number(cls.id.slice(0, 4))} month={Number(cls.id.slice(5))} band={weak.band} />
        </>)}
        {onCves && cls && weak && leaf && (<>
          <p className={s.tag}>{leaf.d[0]}</p>
          <h2 className={s.small}>{leaf.d[1] || "A registered CVE"}</h2>
          <p className={s.figure}>{weak.name} · {leaf.d[4]}% likely to be exploited</p>
          <p className={s.lead}>{weak.band <= 1 ? "Its page shows the request that confirms it, where we hold a ready check." : "We hold no ready check for this one. Its page has its score, the affected product and the fixed versions."}</p>
          <p className={s.actions}>
            <a href={`/cve/${leaf.d[0]}`} target="_blank" rel="noreferrer">Open this CVE</a>
            <a href={`https://nvd.nist.gov/vuln/detail/${leaf.d[0]}`} target="_blank" rel="noreferrer">National Vulnerability Database</a>
          </p>
        </>)}
        {prog && (<>
          <p className={s.tag}>{prog.tag} · program</p>
          <h2 className={s.withLogo}>{prog.logo && <img src={prog.logo} alt="" width={40} height={40} />}{prog.name}</h2>
          <p className={s.figure}>{plural(prog.count, "disclosed report")}{prog.bounty ? ` · ${money(prog.bounty)} paid` : ""}</p>
          <p className={s.note}>The {num(marked || prog.count)} orange marks on the map are this program&apos;s reports. <button className={s.inline} onClick={() => show(prog, "programs")}>Open it in the Programs view</button></p>
          <h3>What gets reported here</h3>
          {prog.all.slice(0, 6).map(([id, n]) => classById[id] && (
            <button key={id} className={s.row} onClick={() => setFocus(classById[id])}><span>{classById[id].name}</span><small>{num(n)}</small></button>
          ))}
          <h3>Reports</h3>
          {reports(false)}
        </>)}
        {onProg && group && !cls && (<>
          <p className={s.tag}>Programs · {group.id === "#" ? "names starting with a number" : `names starting with ${group.id}`}</p>
          <h2>{group.id}</h2>
          <p className={s.figure}>{plural(group.weaks.length, "program")} · {plural(group.count, "disclosed report")}{group.bounty ? ` · ${money(group.bounty)} paid` : ""}</p>
          <p className={s.note}>Each hub on the dial is a program. Its strips are what was reported to it, class by class, then the domains it runs.</p>
          <h3>Programs</h3>
          {(group.sub?.classes ?? []).map((c) => (
            <button key={c.id} className={s.row} onClick={() => setFocus(c)}>
              <span className={s.withIcon}>{c.prog?.logo ? <img src={c.prog.logo} alt="" width={20} height={20} loading="lazy" /> : <i />}{c.name}</span><small>{num(c.count)}</small>
            </button>
          ))}
        </>)}
        {onProg && cls && here && !weak && (<>
          <p className={s.tag}>{here.tag} · program</p>
          <h2 className={s.withLogo}>{here.logo && <img src={here.logo} alt="" width={40} height={40} />}{cls.name}</h2>
          <p className={s.figure}>{plural(here.count, "disclosed report")}{here.bounty ? ` · ${money(here.bounty)} paid` : ""}{here.surface ? ` · ${num(here.surface)} subdomains` : ""}</p>
          <button className={s.jump} onClick={() => show(here, "classes")}>See its {num(here.count)} reports on the vulnerability map</button>
          <h3>What gets reported here</h3>
          {cls.weaks.filter((w) => w.cid).sort((a, b) => b.count - a.count).map((w) => (
            <button key={w.name} className={s.row} onClick={() => setFocus(w)}><span>{w.name}</span><small>{num(w.count)}</small></button>
          ))}
          {here.surface > 0 && (<>
            <h3>Where to look</h3>
            {cls.weaks.filter((w) => !w.cid).sort((a, b) => b.count - a.count).map((w) => (
              <button key={w.name} className={s.row} onClick={() => setFocus(w)}><span>{w.name}</span><small>{num(w.count)}</small></button>
            ))}
            <a className={`${s.jump} ${s.quiet}`} href={`/api/subdomains/download?program=${encodeURIComponent(cls.id)}`} download>Download all {num(here.surface)} subdomains</a>
            <p className={s.note}>Not every host is in scope: check the program&apos;s policy before testing.</p>
          </>)}
          <h3>Reports</h3>
          {reports(false)}
        </>)}
        {onProg && cls && weak && weak.cid && !leaf && (<>
          <p className={s.tag}>{cls.name} · {weak.tag}</p>
          <h2>{weak.name}</h2>
          <p className={s.figure}>{plural(weak.count, "report")} to {cls.name}</p>
          {(() => {
            const per = namesPerPage(typeof window === "undefined" ? 900 : window.innerHeight), pages = Math.max(1, Math.ceil(weak.n / per)), page = Math.min(colPage, pages - 1);
            return pages > 1 ? (
              <div className={s.pager}><div>
                <button disabled={page === 0} onClick={() => setColPage(page - 1)}>Previous names</button>
                <button disabled={page >= pages - 1} onClick={() => setColPage(page + 1)}>Next names</button>
              </div></div>
            ) : null;
          })()}
          {classById[weak.cid] && <p className={s.note}><button className={s.inline} onClick={() => setFocus(classById[weak.cid!])}>See every {weak.name} report on the vulnerability map</button></p>}
          {reports(false)}
        </>)}
        {onProg && cls && weak && !weak.cid && (<>
          <p className={s.tag}>{cls.name} · {weak.tag}</p>
          <h2>{leaf ? String(leaf.d[0]) : weak.name}</h2>
          <p className={s.figure}>{leaf ? `one of ${num(weak.count)} hosts under ${weak.name}` : plural(weak.count, "known subdomain")}</p>
          {leaf && (
            <p className={s.note}>
              <button className={s.inline} onClick={() => navigator.clipboard?.writeText(String(leaf.d[0])).catch(() => {})}>Copy the name</button>{" · "}
              <a className={s.inline} href={`https://${leaf.d[0]}`} target="_blank" rel="noopener noreferrer nofollow">Open it in a new tab</a>
            </p>
          )}
          {weak.count > weak.n && <p className={s.note}>The map draws the first {num(weak.n)}; the list and the download hold all of them.</p>}
          {(() => {
            const per = namesPerPage(typeof window === "undefined" ? 900 : window.innerHeight), pages = Math.max(1, Math.ceil(weak.n / per)), page = Math.min(colPage, pages - 1);
            return pages > 1 ? (
              <div className={s.pager}><div>
                <button disabled={page === 0} onClick={() => setColPage(page - 1)}>Previous names</button>
                <button disabled={page >= pages - 1} onClick={() => setColPage(page + 1)}>Next names</button>
              </div></div>
            ) : null;
          })()}
          <a className={s.jump} href={`/api/subdomains/download?program=${encodeURIComponent(cls.id)}&suffix=${encodeURIComponent(weak.name)}`} download>Download these {num(weak.count)}</a>
          <HostList program={cls.id} suffix={weak.name} />
        </>)}
        {onVuln && cls && !weak && (<>
          <p className={s.tag}>{cls.tag} · vulnerability class</p>
          <h2>{cls.name}</h2>
          <p className={s.figure}>{plural(cls.count, "disclosed report")}{cls.bounty ? ` · ${money(cls.bounty)} paid` : ""}</p>
          <h3>Weaknesses in this class</h3>
          {[...cls.weaks].sort((a, b) => b.count - a.count).map((w) => (
            <button key={w.name} className={s.row} onClick={() => setFocus(w)}><span>{w.name}</span><small>{num(w.count)}</small></button>
          ))}
          {cls.shared.size > 0 && <h3>Shows up together with</h3>}
          {[...cls.shared.entries()].sort((a, b) => b[1] - a[1]).map(([o, n]) => (
            <button key={o.id} className={s.row} onClick={() => setFocus(o)}><span>{o.name}</span><small>{plural(n, "report")}</small></button>
          ))}
        </>)}
        {onVuln && cls && weak && !leaf && (<>
          <p className={s.tag}>{weak.tag} · weakness in {cls.name}</p>
          <h2>{weak.name}</h2>
          <p className={s.figure}>{plural(weak.count, "disclosed report")}{weak.bounty ? ` · ${money(weak.bounty)} paid` : ""}</p>
          {(() => {
            const per = namesPerPage(typeof window === "undefined" ? 900 : window.innerHeight), pages = Math.max(1, Math.ceil(weak.n / per));
            const page = Math.min(colPage, pages - 1), from = page * per + 1, to = Math.min(weak.n, from + per - 1);
            return (
              <div className={s.pager}>
                <p className={s.note}>
                  Every one of the {num(weak.n)} reports is a dot on the map. {weak.loaded ? `Named beside it now: ${num(from)} to ${num(to)}, most upvoted first.` : "Loading their names…"}
                </p>
                {pages > 1 && (<div>
                  <button disabled={page === 0} onClick={() => setColPage(page - 1)}>Previous names</button>
                  <button disabled={page >= pages - 1} onClick={() => setColPage(page + 1)}>Next names</button>
                </div>)}
              </div>
            );
          })()}
          {reports(true)}
        </>)}
        {(onVuln || (onProg && !!weak?.cid)) && cls && weak && leaf && (<>
          <p className={s.tag}>Report #{leaf.d[0]}{leaf.d[5] ? ` · ${leaf.d[5]}` : ""}</p>
          <h2 className={s.small}>{leaf.d[1]}</h2>
          <p className={s.figure}>{[leaf.d[2] ? SEVERITIES[leaf.d[2]] + " severity" : null, money(leaf.d[3]) && money(leaf.d[3]) + " bounty", leaf.d[4] ? leaf.d[4] + " votes" : null].filter(Boolean).join(" · ") || "No severity or bounty listed"}</p>
          <p className={s.lead}>Filed under {weak.name}. The full write-up shows where the researcher looked, what they sent, and what came back.</p>
          <p className={s.actions}>
            <a href={`/report/${leaf.d[0]}`} target="_blank" rel="noreferrer">Read the full report</a>
            <a href={`https://hackerone.com/reports/${leaf.d[0]}`} target="_blank" rel="noreferrer">Open on HackerOne</a>
          </p>
        </>)}
      </aside>

      {connecting && (
        <div className={s.find} role="dialog" aria-label="Connect an AI assistant" onClick={(e) => { if (e.target === e.currentTarget) setConnecting(false); }}>
          <div className={s.connect}>
            <h2>Connect your AI to {SITE.name}</h2>
            <p>Your assistant can search these reports, read any write-up, pull a playbook for a bug class and check what a program has already paid for. Read-only.</p>
            {([
              ["Claude Code", `claude mcp add --transport http hexbrain ${site}/api/mcp${needsKey ? ' --header "Authorization: Bearer YOUR_KEY"' : ""}`],
              ["Claude, ChatGPT and other MCP clients: add this server address", `${site}/api/mcp`],
              ["Custom GPT Action or any HTTP client: import this description", `${site}/api/v1/openapi.json`],
            ] as const).map(([label, value]) => (
              <div key={label} className={s.snippet}>
                <span>{label}</span>
                <code>{value}</code>
                <button onClick={() => copy(label, value)}>{copied === label ? "Copied" : "Copy"}</button>
              </div>
            ))}
            {needsKey && <p className={s.note}>The API needs a key. <a className={s.inline} href="/account">Create one on your account page</a>, then put it in place of YOUR_KEY.</p>}
            <dl className={s.tools}>
              <div><dt>get_program_history</dt><dd>What has been found on a program, what it paid, and what is rarely reported there</dd></div>
              <div><dt>get_attack_surface</dt><dd>The subdomains known for a program, filtered by domain or by words like admin and staging</dd></div>
              <div><dt>plan_tests</dt><dd>Describe a feature and get the bug classes real reports found in features like it</dd></div>
              <div><dt>find_cves</dt><dd>Known CVEs for the technologies a target runs, with the request that confirms each</dd></div>
              <div><dt>find_bypasses</dt><dd>How researchers got past a WAF, filter, 2FA or an earlier fix, with payloads</dd></div>
              <div><dt>find_payloads</dt><dd>Payloads and techniques for 60+ bug classes, with filter-bypass variants</dd></div>
              <div><dt>get_testing_playbook</dt><dd>How a bug class was found before, with real steps and requests</dd></div>
              <div><dt>search_reports</dt><dd>Full-text search across titles and write-ups</dd></div>
              <div><dt>get_report</dt><dd>One report in full</dd></div>
              <div><dt>list_classes</dt><dd>Every class and weakness with counts</dd></div>
            </dl>
            {site.includes("localhost") && <p className={s.note}>This address only works for assistants running on this computer. Hosted assistants need the site deployed at a public address.</p>}
            <button className={s.more} onClick={() => setConnecting(false)}>Close</button>
          </div>
        </div>
      )}

      {finding && <Find model={model} onPick={setFocus} onClose={() => setFinding(false)} />}
    </div>
  );
}
