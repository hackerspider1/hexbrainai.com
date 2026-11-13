import Link from "next/link";
import Mark from "@/components/Mark";
import { classPath, n, programPath } from "@/lib/browse";
import { getGraph } from "@/lib/db";
import { SITE } from "@/lib/site";
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
    <main className={`${s.page} ${s.wide}`}>
      <Link href="/" className={s.brand}><Mark />{SITE.name}</Link>
      <h1>Browse {n(g.total)} disclosed bug bounty reports</h1>
      <p className={s.lede}>By vulnerability class and weakness, or by the program they were reported to. Prefer the picture? <Link href="/">Open the map.</Link> Stuck behind a filter or a fix? <Link href="/bypasses">See the bypass library</Link> , the <Link href="/payloads">payloads</Link> and the <Link href="/cves">CVE library</Link>.</p>

      <h2>Vulnerability classes</h2>
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
    </main>
  );
}
