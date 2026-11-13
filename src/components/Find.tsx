"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { money, plural } from "./map/format";
import type { Model, Node } from "./map/layout";
import s from "./Find.module.css";

type Row = { id: number; title: string; program: string | null; severity: string | null; bounty: number | null; votes: number; weakness: string | null };
type Place = { node: Node; title: string; kind: string; meta: string };
const TRY = ["ssrf metadata", "oauth redirect_uri", "graphql introspection", "account takeover", "race condition"];

/** Search: places on the map (classes, weaknesses, programs) first, then reports by full text. */
export default function Find({ model, onPick, onClose }: { model: Model; onPick: (n: Node) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; total: number; rows: Row[] } | null>(null);
  const [at, setAt] = useState(0);
  const [cves, setCves] = useState<{ q: string; rows: { id: string; title: string | null; cvss: number | null; product: string | null; kev: number }[] } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const q = query.trim(), ready = q.length >= 2;

  const places = useMemo<Place[]>(() => {
    if (!ready) return [];
    const t = q.toLowerCase(), hit = (name: string, id = "") => name.toLowerCase().includes(t) || id.toLowerCase() === t;
    return [
      ...model.classes.filter((c) => hit(c.name, c.id)).slice(0, 2).map((c) => ({ node: c, title: c.name, kind: "Class", meta: plural(c.count, "report") })),
      ...model.weaks.filter((w) => hit(w.name)).sort((a, b) => b.count - a.count).slice(0, 3).map((w) => ({ node: w, title: w.name, kind: "Weakness", meta: `${plural(w.count, "report")} in ${w.cls.name}` })),
      ...model.progs.filter((p) => hit(p.name)).slice(0, 3).map((p) => ({ node: p, title: p.name, kind: "Program", meta: plural(p.count, "report") })),
    ];
  }, [q, ready, model]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      fetch(`/api/reports?q=${encodeURIComponent(q)}&limit=20`).then((r) => r.json()).then((j) => setFound({ q, ...j })).catch(() => {});
      fetch(`/api/cve-find?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((j) => setCves({ q, rows: Array.isArray(j) ? j : [] })).catch(() => {});
    }, 160);
    return () => clearTimeout(t);
  }, [q, ready]);

  const rows = ready && found ? found.rows : [], count = places.length + rows.length, active = Math.min(at, Math.max(0, count - 1));
  const open = (i: number) => {
    if (i < places.length) { onPick(places[i].node); onClose(); }
    else if (rows[i - places.length]) window.open(`/report/${rows[i - places.length].id}`, "_blank", "noopener");
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = count ? (active + (e.key === "ArrowDown" ? 1 : count - 1)) % count : 0;
      setAt(next);
      list.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && count) { e.preventDefault(); open(active); }
  };
  const meta = (r: Row) => [r.program, r.weakness, r.severity && r.severity !== "none" ? r.severity : null, money(r.bounty), r.votes ? `${r.votes} votes` : null].filter(Boolean).join("  ·  ");

  return (
    <div className={s.backdrop} role="dialog" aria-label="Search" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.box}>
        <div className={s.bar}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" /></svg>
          <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setAt(0); }} onKeyDown={onKey} placeholder="Search reports, weaknesses, programs and CVEs" aria-label="Search reports, weaknesses, programs and CVEs" />
          <button className={s.esc} onClick={onClose}>Esc</button>
        </div>
        <div className={s.list} ref={list}>
          {!ready && (
            <div className={s.hint}>
              <p>Search every report by its title and write-up, or jump to a class, weakness or program on the map.</p>
              <div>{TRY.map((t) => <button key={t} onClick={() => setQuery(t)}>{t}</button>)}</div>
            </div>
          )}
          {places.length > 0 && <h3>On the map</h3>}
          {places.map((p, i) => (
            <button key={p.kind + p.title} data-i={i} className={`${s.item} ${i === active ? s.on : ""}`} onMouseMove={() => { if (i !== active) setAt(i); }} onClick={() => open(i)}>
              <span><i>{p.kind}</i>{p.title}</span><small>{p.meta}</small>
            </button>
          ))}
          {ready && found?.q === q && <h3>{found.total ? `${plural(found.total, "report")}${found.total > rows.length ? `, best ${rows.length} shown` : ""}` : "Reports"}</h3>}
          {rows.map((r, n) => { const i = places.length + n; return (
            <a key={r.id} data-i={i} className={`${s.item} ${i === active ? s.on : ""}`} href={`/report/${r.id}`} target="_blank" rel="noreferrer" onMouseMove={() => { if (i !== active) setAt(i); }}>
              <span>{r.title}</span><small>{meta(r)}</small>
            </a>
          ); })}
          {ready && cves?.q === q && cves.rows.length > 0 && <h3>CVEs</h3>}
          {ready && cves?.q === q && cves.rows.map((c) => (
            <a key={c.id} className={s.item} href={`/cve/${c.id}`} target="_blank" rel="noreferrer">
              <span>{c.title || c.id}</span><small>{[c.title ? c.id : null, c.kev ? "exploited in the wild" : null, c.cvss != null ? `CVSS ${c.cvss}` : null, c.product].filter(Boolean).join("  ·  ")}</small>
            </a>
          ))}
          {ready && found?.q === q && !count && !(cves?.q === q && cves.rows.length) && <p className={s.none}>Nothing matches “{q}”. Try fewer words, a program name, or a weakness such as SSRF.</p>}
        </div>
        <div className={s.foot}><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span>Reports and CVEs open in a new tab</span></div>
      </div>
    </div>
  );
}
