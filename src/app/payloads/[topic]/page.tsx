import Link from "next/link";
import { notFound } from "next/navigation";
import Sheet from "@/components/Sheet";
import { plainName } from "@/lib/browse";
import Writeup from "@/components/Writeup";
import { classPath } from "@/lib/browse";
import { getGraph, techniquesOf } from "@/lib/db";
import s from "../../plain.module.css";
import r from "../../report/[id]/report.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ topic: string }> };

export async function generateMetadata({ params }: Props) {
  const topic = plainName((await params).topic), rows = techniquesOf(topic);
  if (!rows.length) return { title: "Not found" };
  return {
    title: `${topic} payloads and techniques`,
    description: `Payloads, techniques and filter bypasses for ${topic}: ${[...new Set(rows.map((x) => x.path.split(" > ")[0]))].slice(0, 6).join(", ")}.`,
    alternates: { canonical: `/payloads/${encodeURIComponent(topic)}` },
  };
}

export default async function PayloadTopic({ params }: Props) {
  const topic = plainName((await params).topic), rows = techniquesOf(topic);
  if (!rows.length) notFound();
  const cls = rows[0].class_id ? getGraph().classes.find((c) => c.id === rows[0].class_id) : null;
  return (
    <Sheet here="payloads" className={`${s.page} ${s.wide}`}>
      <p className={s.crumbs}><Link href="/browse">Browse</Link> / <Link href="/payloads">Payloads</Link> / {topic}</p>
      <h1>{topic}</h1>
      <p className={s.lede}>{rows.length} passages of payloads and techniques.{cls ? <> See also the <Link href={classPath(cls.id)}>{cls.count.toLocaleString("en-US")} disclosed {cls.name} reports</Link>.</> : null}</p>
      {rows.map((t, i) => (
        <details key={t.id} className={s.fold} open={i < 2}>
          <summary>{t.path}</summary>
          <div className={r.body}><Writeup>{t.text}</Writeup></div>
          <p className={s.small}><a href={t.url} target="_blank" rel="noopener noreferrer">Source</a></p>
        </details>
      ))}
      <p className={s.small}>From <a href="https://github.com/swisskyrepo/PayloadsAllTheThings" target="_blank" rel="noopener noreferrer">PayloadsAllTheThings</a> by Swissky and contributors, used under the MIT licence. Use it only on systems you are authorised to test.</p>
    </Sheet>
  );
}
