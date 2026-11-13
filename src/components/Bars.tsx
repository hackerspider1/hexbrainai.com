import Link from "next/link";
import s from "@/app/plain.module.css";

/** Counts drawn the way the map draws them: each row is a strip of fine lines, as long as its share of the largest. */
export default function Bars({ rows }: { rows: { name: string; count: number; href?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className={s.bars}>
      {rows.map((r) => (
        <li key={r.name}>
          {r.href ? <Link href={r.href}>{r.name}</Link> : <span>{r.name}</span>}
          <i style={{ "--v": Math.max(0.006, r.count / max) } as React.CSSProperties} aria-hidden="true" />
          <b>{r.count.toLocaleString("en-US")}</b>
        </li>
      ))}
    </ul>
  );
}

const LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
/** Severity as four pips, filled as far as the level reaches. */
export function Sev({ level }: { level: string | null | undefined }) {
  const k = LEVEL[(level || "").toLowerCase()] || 0;
  return (
    <span className={s.sev} data-k={k} role="img" aria-label={k ? `${level} severity` : "severity not set"} title={k ? `${level} severity` : "Severity not set"}>
      {[1, 2, 3, 4].map((i) => <i key={i} data-on={i <= k ? "" : undefined} />)}
    </span>
  );
}

/** A reading from 0 to 1 drawn as a strip of lines, lit as far as the value. */
export function Meter({ value, hot = false }: { value: number; hot?: boolean }) {
  return <i className={s.meter} data-hot={hot ? "" : undefined} style={{ "--v": Math.min(1, Math.max(0, value)) } as React.CSSProperties} aria-hidden="true" />;
}
