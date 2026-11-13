import Link from "next/link";
import Bars from "@/components/Bars";
import Sheet from "@/components/Sheet";
import { classPath, n, programPath } from "@/lib/browse";
import { getGraph } from "@/lib/db";
import s from "../plain.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Browse bug bounty reports by vulnerability and program",
  description: "Every vulnerability class, weakness and bug bounty program in HexBrain, each with its publicly disclosed reports and full write-ups.",
  alternates: { canonical: "/browse" },
};

export default function Browse() {
  const g = getGraph();
  return (
    <Sheet here="browse" className={`${s.page} ${s.wide}`}>
      <h1>Browse {n(g.total)} disclosed bug bounty reports</h1>
      <p className={s.lede}>By vulnerability class and weakness, or by the program they were reported to. Stuck behind a filter or a fix? See the <Link href="/bypasses">bypass library</Link>, the <Link href="/payloads">payloads</Link> and the <Link href="/cves">CVE library</Link>.</p>

      <div className={s.facts}>
        <div><b>{n(g.total)}</b><span>disclosed reports</span></div>
        <div><b>{n(g.classes.length)}</b><span>vulnerability classes</span></div>
        <div><b>{n(g.classes.reduce((t, c) => t + c.weaknesses.length, 0))}</b><span>weaknesses</span></div>
        <div><b>{n(g.topPrograms.length)}</b><span>programs</span></div>
      </div>

      <h2>Vulnerability classes</h2>
      <Bars rows={g.classes.map((c) => ({ name: c.name, count: c.count, href: classPath(c.id) }))} />

      <h2>Weaknesses in each class</h2>
      {g.classes.map((c) => (
        <section key={c.id}>
          <h3><Link href={classPath(c.id)}>{c.name}</Link> <small>{n(c.count)} reports</small></h3>
          <ul className={s.cols}>
            {c.weaknesses.map((w) => <li key={w.name}>{w.name} <small>{n(w.count)}</small></li>)}
          </ul>
        </section>
      ))}

      <h2>Programs</h2>
      <ul className={s.cols}>
        {g.topPrograms.map((p) => <li key={p.name}><Link href={programPath(p.name)}>{p.name}</Link> <small>{n(p.count)}</small></li>)}
      </ul>
    </Sheet>
  );
}
