"use client";

import { useEffect, useState } from "react";
import s from "./MapView.module.css";

const num = (v: number) => v.toLocaleString("en-US");

/** The subdomains under one domain of a program, with a filter and paging: the list beside the map. */
export default function HostList({ program, suffix }: { program: string; suffix: string }) {
  const [typed, setTyped] = useState(""), [q, setQ] = useState("");
  const [list, setList] = useState<{ key: string; total: number; rows: string[] } | null>(null);
  const key = `program=${encodeURIComponent(program)}&suffix=${encodeURIComponent(suffix)}&q=${encodeURIComponent(q)}`;
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 220); return () => clearTimeout(t); }, [typed]);
  useEffect(() => {
    let live = true;
    fetch(`/api/subdomains?${key}`).then((r) => r.json()).then((j) => { if (live) setList({ key, ...j }); }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  const more = () => {
    if (!list) return;
    fetch(`/api/subdomains?${key}&offset=${list.rows.length}`).then((r) => r.json())
      .then((j) => setList((p) => (p && p.key === key ? { ...p, rows: [...p.rows, ...j.rows] } : p))).catch(() => {});
  };
  const ready = list?.key === key;
  return (
    <>
      <input className={s.filter} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Filter, for example: api, staging, admin" aria-label="Filter subdomains" maxLength={80} spellCheck={false} />
      {!ready ? <p className={s.note}>Loading…</p> : (<>
        {q && <p className={s.note}>{num(list.total)} match</p>}
        <ol className={s.hosts}>{list.rows.map((h) => <li key={h}>{h}</li>)}</ol>
        {list.rows.length === 0 && <p className={s.note}>Nothing matches.</p>}
        {list.rows.length < list.total && <button className={s.more} onClick={more}>Show more ({num(list.total - list.rows.length)} left)</button>}
      </>)}
    </>
  );
}
