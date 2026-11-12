import Link from "next/link";
import { programPath, usd } from "@/lib/browse";
import s from "@/app/plain.module.css";

type Row = { id: number; title: string; program: string | null; severity: string | null; weakness: string | null; bounty: number | null; votes: number };

/** A plain list of reports, each linking to its write-up. */
export default function ReportList({ rows, showProgram = true }: { rows: Row[]; showProgram?: boolean }) {
  return (
    <ol className={s.reports}>
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/report/${r.id}`}>{r.title}</Link>
          <small>
            {[r.weakness, r.severity && r.severity !== "none" ? r.severity : null, usd(r.bounty), r.votes ? `${r.votes} votes` : null].filter(Boolean).join(" · ")}
            {showProgram && r.program ? <> · <Link href={programPath(r.program)}>{r.program}</Link></> : null}
          </small>
        </li>
      ))}
    </ol>
  );
}
