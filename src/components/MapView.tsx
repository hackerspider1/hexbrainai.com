"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Graph, Leaf } from "@/lib/db";
import { SEVERITIES } from "@/lib/taxonomy";
import { money, num, plural } from "./map/format";
import { NONE, build, ensureDisc } from "./map/layout";
import type { Focus, Lens, Node, WNode } from "./map/layout";
import { namesPerPage, startMap } from "./map/renderer";
import { SITE } from "@/lib/site";
import Find from "./Find";
import Mark from "./Mark";
import s from "./MapView.module.css";

type Row = { id: number; title: string; program: string | null; severity: string | null; bounty: number | null; votes: number; weakness: string | null };
type Listing = { key: string; total: number; rows: Row[] };

function syncUrl(f: Focus, lens: Lens) {
  const q = new URLSearchParams();
  if (lens === "programs") q.set("view", "programs");
  if (f.prog) q.set("program", f.prog.name);
  if (f.cls) q.set("class", f.cls.id);
  if (f.weak) q.set("weakness", f.weak.name);
  window.history.replaceState(null, "", q.size ? `?${q}` : window.location.pathname);
}

export type Viewer = { name: string | null; picture: string | null } | null;

// `viewer` is the signed-in person, if any. Connecting an AI is offered only to them. `signIn` says whether sign-in is open yet.
export default function MapView({ graph, viewer = null, needsKey = false, signIn = false }: { graph: Graph; viewer?: Viewer; needsKey?: boolean; signIn?: boolean }) {
  const model = useMemo(() => build(graph), [graph]);
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
  const [list, setList] = useState<Listing | null>(null);

  // What is open. A program can be open in either view: as a bubble in Programs, or as its footprint on the dial.
  const show = useCallback((n: Node | null, view?: Lens) => {
    const f: Focus = !n ? NONE
      : n.k === "cls" ? { ...NONE, cls: n }
      : n.k === "weak" ? { ...NONE, cls: n.cls, weak: n }
      : n.k === "leaf" ? { ...NONE, cls: n.w.cls, weak: n.w, leaf: n }
      : { ...NONE, prog: n };
    if (f.weak !== focusRef.current.weak) { colPageRef.current = 0; setColPageState(0); }
    const l: Lens = view ?? (n && n.k !== "prog" ? "classes" : lensRef.current);
    lensRef.current = l; setLensState(l);
    focusRef.current = f; setFocusState(f); setIndex(null);
    syncUrl(f, l);
  }, []);
  const setFocus = useCallback((n: Node | null) => show(n), [show]);
  const setLens = useCallback((l: Lens) => show(null, l), [show]);
  const stepOut = useCallback(() => {
    const f = focusRef.current;
    show(f.leaf ? f.weak : f.weak ? f.cls : null);
  }, [show]);

  // Ids and titles behind a weakness's dots arrive the first time they are needed.
  const loadLeaves = useCallback(async (w: WNode) => {
    if (w.loaded || w.loading) return;
    w.loading = true;
    try {
      const rows: Leaf[] = await (await fetch(`/api/leaves?weakness=${encodeURIComponent(w.name)}`)).json();
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
      if (focus.weak) await loadLeaves(focus.weak);
      // Then the rest of the open class, so its other weaknesses open instantly.
      if (focus.cls) for (const w of focus.cls.weaks) { if (!live) return; await loadLeaves(w); }
    })();
    return () => { live = false; };
  }, [focus.cls, focus.weak, loadLeaves]);

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
  const filter = focus.weak ? `weakness=${encodeURIComponent(focus.weak.name)}` : focus.prog ? `program=${encodeURIComponent(focus.prog.name)}` : "";
  const listKey = filter ? `${filter}&sort=${sort}` : "";
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
    const stop = startMap(canvasRef.current!, svgRef.current!, model, { focus: focusRef, lens: lensRef, colPage: colPageRef, dataVer, footprint }, { setFocus, stepOut });
    // Restore what the link points at, once the first frame is out of the way.
    const q = new URLSearchParams(window.location.search), c = model.classes.find((x) => x.id === q.get("class"));
    const wk = c?.weaks.find((x) => x.name === q.get("weakness")), pr = model.progs.find((x) => x.name === q.get("program"));
    const view: Lens | undefined = q.get("view") === "programs" ? "programs" : undefined, start = wk || c || pr || null;
    if (view || start) queueMicrotask(() => show(start, start && start.k !== "prog" ? undefined : view));
    return stop;
  }, [model, setFocus, stepOut, show]);

  const { cls, weak, leaf, prog } = focus;
  const active = !!(cls || prog);
  const biggest = useMemo(() => [...model.classes].sort((a, b) => b.count - a.count)[0], [model]);
  const classById = useMemo(() => Object.fromEntries(model.classes.map((c) => [c.id, c])), [model]);
  const rowMeta = (r: Row, withProgram = true) =>
    [withProgram ? r.program : null, r.severity && r.severity !== "none" ? r.severity : null, money(r.bounty), r.votes ? `${r.votes} votes` : null].filter(Boolean).join("  ·  ");
  const reports = (withProgram: boolean) => (
    <>
      <div className={s.sorts} role="group" aria-label="Sort reports">
        {[["votes", "Most upvoted"], ["bounty", "Biggest bounty"], ["new", "Newest"]].map(([k, label]) => (
          <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{label}</button>
        ))}
      </div>
      {list?.key === listKey ? (<>
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
              <button aria-pressed={lens === "programs"} onClick={() => setLens("programs")}>Programs</button>
            </span>
          )}
          {active && <><button onClick={() => setFocus(null)}>{lens === "programs" ? "Programs" : "Map"}</button><i>/</i></>}
          {prog && <b>{prog.name}</b>}
          {cls && (weak ? <button onClick={() => setFocus(cls)}>{cls.name}</button> : <b>{cls.name}</b>)}
          {weak && (<><i>/</i>{leaf ? <button onClick={() => setFocus(weak)}>{weak.tag}</button> : <b>{weak.tag}</b>}</>)}
          {leaf && (<><i>/</i><b>#{leaf.d[0]}</b></>)}
        </nav>
        <div className={s.brand}><Mark size={24} />{SITE.name}</div>
        <div className={s.keys}>
          {(active || index) && <button className={s.key} onClick={() => (index ? setIndex(null) : stepOut())}>Back <kbd>Esc</kbd></button>}
          <button className={s.key} onClick={() => setFinding(true)}>Find <kbd>F</kbd></button>
          {viewer && <button className={`${s.key} ${s.primary}`} onClick={openConnect}>Connect AI <kbd>C</kbd></button>}
          <a className={`${s.key} ${s.acct}`} href="/account" aria-label={viewer ? "Your account" : signIn ? "Sign in" : "Sign in, coming soon"}>
            {viewer ? (viewer.picture ? <img src={viewer.picture} alt="" width={22} height={22} referrerPolicy="no-referrer" /> : (viewer.name || "Account").split(" ")[0])
              : <>Sign in{!signIn && <em>Soon</em>}</>}
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
          <h1>Every disclosed bug, mapped to how it was found.</h1>
          <p>{num(graph.total)} public HackerOne reports across {num(graph.programs)} programs. Open a class, pick a weakness, and read how each bug was found.</p>
          <p>
            <button className={s.link} tabIndex={active ? -1 : 0} onClick={() => setFocus(biggest)}>Explore the map</button> or{" "}
            <button className={s.link} tabIndex={active ? -1 : 0} onClick={() => setFinding(true)}>search the reports.</button>{" "}
            <a className={s.about} tabIndex={active ? -1 : 0} href="/browse">Browse as a list</a>
            <a className={s.about} tabIndex={active ? -1 : 0} href="/about">About</a>
          </p>
        </section>
      )}

      <div className={`${s.stats} ${active || index ? s.gone : ""}`}>
        <div className={s.stat}><b>{num(graph.total)}</b><span>reports</span></div>
        <button className={s.stat} onClick={() => { setIndexFilter(""); setIndex("weaknesses"); }}><b>{num(graph.weaknessCount)}</b><span>weaknesses</span></button>
        <button className={s.stat} onClick={() => { setIndexFilter(""); setIndex("programs"); }}><b>{num(graph.programs)}</b><span>programs</span></button>
        <div className={s.stat}><b>{money(graph.totalBounty) || "–"}</b><span>in bounties</span></div>
        <p>{lens === "programs"
          ? "Each strip is a program and each line in it a row of its reports. The biggest is at the top, smaller ones run down both sides."
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
        {prog && (<>
          <p className={s.tag}>{prog.tag} · program</p>
          <h2 className={s.withLogo}>{prog.logo && <img src={prog.logo} alt="" width={40} height={40} />}{prog.name}</h2>
          <p className={s.figure}>{plural(prog.count, "disclosed report")}{prog.bounty ? ` · ${money(prog.bounty)} paid` : ""}</p>
          {lens === "programs"
            ? <button className={s.jump} onClick={() => show(prog, "classes")}>See its {num(prog.count)} reports on the vulnerability map</button>
            : <p className={s.note}>The {num(marked || prog.count)} orange marks on the map are this program&apos;s reports. <button className={s.inline} onClick={() => show(prog, "programs")}>Open it in the Programs view</button></p>}
          <h3>What gets reported here</h3>
          {prog.all.slice(0, 6).map(([id, n]) => classById[id] && (
            <button key={id} className={s.row} onClick={() => setFocus(classById[id])}><span>{classById[id].name}</span><small>{num(n)}</small></button>
          ))}
          <h3>Reports</h3>
          {reports(false)}
        </>)}
        {cls && !weak && (<>
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
        {cls && weak && !leaf && (<>
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
        {cls && weak && leaf && (<>
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
