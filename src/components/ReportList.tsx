import Link from "next/link";
import { Sev } from "@/components/Bars";
import { programPath, usd } from "@/lib/browse";
import s from "@/app/plain.module.css";

type Row = { id: number; title: string; program: string | null; severity: string | null; weakness: string | null; bounty: number | null; votes: number };

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
