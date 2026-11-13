"use client";

import { useEffect, useState } from "react";
import s from "./MapView.module.css";

const num = (v: number) => v.toLocaleString("en-US");
type Row = [id: string, name: string, tone: number, zero: number, likely: number, blank: string];

/** The CVEs in one band of one month, with a filter and paging: the list beside the map. */
export default function CveList({ year, month, band }: { year: number; month: number; band: number }) {
  const [typed, setTyped] = useState(""), [q, setQ] = useState("");
  const [list, setList] = useState<{ key: string; total: number; rows: Row[] } | null>(null);
  const key = `year=${year}&month=${month}&band=${band}&q=${encodeURIComponent(q)}`;
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 220); return () => clearTimeout(t); }, [typed]);
  useEffect(() => {
    let live = true;
    fetch(`/api/cve-band?${key}`).then((r) => r.json()).then((j) => { if (live) setList({ key, ...j }); }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  const more = () => {
    if (!list) return;
    fetch(`/api/cve-band?${key}&offset=${list.rows.length}`).then((r) => r.json())
      .then((j) => setList((p) => (p && p.key === key ? { ...p, rows: [...p.rows, ...j.rows] } : p))).catch(() => {});
  };
  const ready = list?.key === key;
  return (
    <>
      <input className={s.filter} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Filter by product, name or id, for example: wordpress" aria-label="Filter these CVEs" maxLength={80} spellCheck={false} />
      {!ready ? <p className={s.note}>Loading…</p> : (<>
        {q && <p className={s.note}>{num(list.total)} match</p>}
        {list.rows.map((r) => (
          <a key={r[0]} className={s.report} href={`/cve/${r[0]}`} target="_blank" rel="noreferrer">
            <span>{r[1] || r[0]}</span><small>{r[1] ? `${r[0]}  ·  ` : ""}{r[4]}% likely to be exploited</small>
          </a>
        ))}
        {list.rows.length === 0 && <p className={s.note}>Nothing matches.</p>}
        {list.rows.length < list.total && <button className={s.more} onClick={more}>Show more ({num(list.total - list.rows.length)} left)</button>}
      </>)}
    </>
  );
}
