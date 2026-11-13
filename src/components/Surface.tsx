"use client";

import { useEffect, useMemo, useState } from "react";
import s from "./Surface.module.css";

type Branch = { name: string; suffix: string; count: number };
type Props = { program: string; logo: string | null; total: number; rootCount: number; branches: Branch[] };

const R1 = 96, R0 = 122, REACH = 132, num = (v: number) => v.toLocaleString("en-US");

/** A program's subdomains drawn the way the map draws reports: a dial of strips, one per domain, that turns to whatever is picked. */
export default function Surface({ program, logo, total, rootCount, branches }: Props) {
  const [sel, setSel] = useState(-1), [hover, setHover] = useState(-1);
  const [q, setQ] = useState(""), [typed, setTyped] = useState("");
  const [list, setList] = useState<{ key: string; total: number; rows: string[] } | null>(null);
  const [rot, setRot] = useState(0);

  // Each branch gets a slice of the circle: an equal share plus a share by size, so small ones stay visible.
  const spokes = useMemo(() => {
    const sum = branches.reduce((t, b) => t + Math.sqrt(b.count), 0) || 1, max = Math.max(1, ...branches.map((b) => b.count));
    const widths = branches.map((b) => 360 * (0.45 / branches.length + 0.55 * (Math.sqrt(b.count) / sum)));
    return branches.map((b, i) => {
      const w = widths[i], mid = -90 + widths.slice(0, i).reduce((t, x) => t + x, 0) + w / 2;
      const lines = Math.max(1, Math.min(60, Math.round((w - 1.4) / 1.15)));
      return { ...b, mid, w, lines, len: 26 + (REACH - 26) * Math.sqrt(b.count / max) };
    });
  }, [branches]);

  // Turn the dial by the shortest way so the picked branch points left, where its names open beside it on wide screens.
  const choose = (i: number) => {
    setSel(i);
    if (i >= 0) setRot((r) => r + (((180 - spokes[i].mid - r) % 360 + 540) % 360 - 180));
  };

  const suffix = sel >= 0 ? branches[sel].suffix : "";
  const key = `program=${encodeURIComponent(program)}&suffix=${encodeURIComponent(suffix)}&q=${encodeURIComponent(q)}`;
  useEffect(() => {
    let live = true;
    fetch(`/api/subdomains?${key}`).then((r) => r.json()).then((j) => { if (live) setList({ key, ...j }); }).catch(() => {});
    return () => { live = false; };
  }, [key]);
  useEffect(() => { const t = setTimeout(() => setQ(typed.trim()), 220); return () => clearTimeout(t); }, [typed]);
  const more = () => {
    if (!list) return;
    fetch(`/api/subdomains?${key}&offset=${list.rows.length}`).then((r) => r.json())
      .then((j) => setList((p) => (p && p.key === key ? { ...p, rows: [...p.rows, ...j.rows] } : p))).catch(() => {});
  };

  const shown = hover >= 0 ? hover : sel, focus = shown >= 0 ? spokes[shown] : null;
  const ready = list?.key === key;
  const download = (sfx: string) => `/api/subdomains/download?program=${encodeURIComponent(program)}${sfx ? `&suffix=${encodeURIComponent(sfx)}` : ""}`;

  return (
    <div className={s.surface}>
      <div className={s.dialBox}>
        <svg viewBox="-350 -350 700 700" className={s.dial} role="img" aria-label={`${num(total)} subdomains of ${program}, drawn by domain`}>
          <circle r="262" className={s.bezel} /><circle r={R0 - 8} className={s.ringLine} />
          <g style={{ transform: `rotate(${rot}deg)` }} className={s.turn}>
            {spokes.map((b, i) => {
              const on = i === shown, flip = Math.cos(((b.mid + rot) * Math.PI) / 180) < 0, tip = 270;
              return (
                <g key={b.suffix} transform={`rotate(${b.mid})`} className={`${s.spoke} ${on ? s.on : ""} ${shown >= 0 && !on ? s.dim : ""}`} style={{ "--i": i } as React.CSSProperties}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)} onClick={() => choose(sel === i ? -1 : i)}>
                  <path d={`M0 0 C ${R1 * 0.45} 0 ${R1 * 0.55} 0 ${R1} 0`} className={s.link} pathLength={1} />
                  <circle r="1.9" className={s.signal} />
                  {Array.from({ length: b.lines }, (_, k) => {
                    const off = (k - (b.lines - 1) / 2) * 1.15;
                    return <line key={k} x1={R0} y1="0" x2={R0 + b.len} y2="0" transform={`rotate(${off})`} className={s.line} pathLength={1} />;
                  })}
                  <circle cx={R1} r={on ? 6.5 : 4.2} className={s.node} />
                  <path d={`M${R0 - 4} 0 L${R0 + b.len + 6} 0`} className={s.hit} style={{ strokeWidth: Math.max(10, (b.w / 360) * 2 * Math.PI * (R0 + b.len / 2)) }} />
                  {(on || (shown < 0 && b.w > 6.5)) && (
                    <text x={tip} y="0" className={s.label} transform={flip ? `rotate(180 ${tip} 0)` : undefined} textAnchor={flip ? "end" : "start"} dominantBaseline="central">
                      {b.name.length > 13 && !on ? b.name.slice(0, 12) + "…" : b.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
          <g className={s.hub} onClick={() => choose(-1)}>
            <circle r="50" className={s.hubRing} />
            {logo ? <><clipPath id="hub"><circle r="30" /></clipPath><circle r="30" className={s.hubBack} /><image href={logo} x="-30" y="-30" width="60" height="60" clipPath="url(#hub)" preserveAspectRatio="xMidYMid slice" /></> : <circle r="5" className={s.hubDot} />}
          </g>
        </svg>
        <p className={s.readout} aria-live="polite">
          {focus ? <><b>{focus.suffix}</b><span>{num(focus.count)} subdomains under it</span></>
            : <><b>{num(total)}</b><span>subdomains across {num(rootCount)} root {rootCount === 1 ? "domain" : "domains"}</span></>}
        </p>
      </div>

      <div className={s.side}>
        <div className={s.head}>
          <div>
            <b>{sel >= 0 ? branches[sel].suffix : "All subdomains"}</b>
            <small>{ready ? `${num(list.total)} ${q ? "match" : "names"}` : "Loading…"}</small>
          </div>
          {sel >= 0 && <button onClick={() => choose(-1)}>Show all</button>}
        </div>
        <input className={s.find} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Filter, for example: api, staging, admin" aria-label="Filter subdomains" maxLength={80} spellCheck={false} />
        <ol className={s.hosts}>
          {ready && list.rows.map((h) => <li key={h}>{h}</li>)}
          {ready && list.rows.length === 0 && <li className={s.none}>Nothing matches.</li>}
        </ol>
        {ready && list.rows.length < list.total && <button className={s.more} onClick={more}>Show more ({num(list.total - list.rows.length)} left)</button>}
        <div className={s.get}>
          <a href={download("")} download>Download all {num(total)}</a>
          {sel >= 0 && <a href={download(branches[sel].suffix)} download>Download {branches[sel].suffix} ({num(branches[sel].count)})</a>}
        </div>
      </div>
    </div>
  );
}
