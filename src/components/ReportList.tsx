import Link from "next/link";
import { Sev } from "@/components/Bars";
import { programPath, usd } from "@/lib/browse";
import { STATUSES, statusLabel } from "@/lib/taxonomy";
import s from "@/app/plain.module.css";

type Row = { id: number; title: string; program: string | null; severity: string | null; weakness: string | null; bounty: number | null; votes: number; substate?: string | null };

/** A list of reports, each linking to its write-up: severity, title, then bounty and votes in columns. */
export default function ReportList({ rows, showProgram = true }: { rows: Row[]; showProgram?: boolean }) {
  return (
    <ol className={s.reports}>
      {rows.map((r) => (
        <li key={r.id}>
          <Sev level={r.severity} />
          <div>
            <Link href={`/report/${r.id}`}>{r.title}</Link>
            <small>
              {r.substate && r.substate !== "resolved" && <b className={s.flag}>{statusLabel(r.substate)}</b>}
              {[r.weakness, r.severity && r.severity !== "none" ? r.severity : null].filter(Boolean).join(" · ")}
              {showProgram && r.program ? <>{r.weakness || (r.severity && r.severity !== "none") ? " · " : ""}<Link href={programPath(r.program)}>{r.program}</Link></> : null}
            </small>
          </div>
          <span className={s.num}>{usd(r.bounty)}</span>
          <span className={s.num}>{r.votes ? <>{r.votes.toLocaleString("en-US")} <i>votes</i></> : null}</span>
        </li>
      ))}
    </ol>
  );
}

/** Links that narrow a report list to how the program closed each report. */
export function StatusFilter({ base, current }: { base: string; current: string }) {
  const href = (k: string) => (k ? `${base}?status=${k}` : base);
  return (
    <p className={s.pick} aria-label="Filter by report status">
      {[["", "All"], ...STATUSES.slice(0, 4)].map(([k, label]) => <Link key={k} href={href(k)} aria-current={k === current ? "true" : undefined} scroll={false}>{label}</Link>)}
    </p>
  );
}
