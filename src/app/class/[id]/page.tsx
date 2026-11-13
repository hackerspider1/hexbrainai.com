import Link from "next/link";
import { notFound } from "next/navigation";
import Bars from "@/components/Bars";
import Sheet from "@/components/Sheet";
import ReportList, { StatusFilter } from "@/components/ReportList";
import { classPath, jsonLd, n, usd } from "@/lib/browse";
import { getGraph, listReports } from "@/lib/db";
import { SITE } from "@/lib/site";
import s from "../../plain.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> };
const find = async (params: Props["params"]) => { const id = (await params).id.toUpperCase(), g = getGraph(); return { g, c: g.classes.find((x) => x.id === id) }; };

export async function generateMetadata({ params }: Props) {
  const { c } = await find(params);
  if (!c) return { title: "Class not found" };
  return {
    title: `${c.name}: ${n(c.count)} disclosed bug bounty reports`,
    description: `${n(c.count)} publicly disclosed ${c.name} reports from bug bounty programs, with full write-ups of how each was found. Covers ${c.weaknesses.slice(0, 4).map((w) => w.name).join(", ")}.`,
    alternates: { canonical: classPath(c.id) },
  };
}

export default async function ClassPage({ params, searchParams }: Props) {
  const status = (await searchParams).status || "";
  const { g, c } = await find(params);
  if (!c) notFound();
  const top = listReports({ cls: c.id, status, limit: 100 }).rows as Parameters<typeof ReportList>[0]["rows"];
  const linked = g.links.filter(([a, b]) => a === c.id || b === c.id).map(([a, b, k]) => ({ o: g.classes.find((x) => x.id === (a === c.id ? b : a))!, k })).filter((l) => l.o);
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: SITE.name, item: SITE.url }, { "@type": "ListItem", position: 2, name: "Browse", item: `${SITE.url}/browse` },
    { "@type": "ListItem", position: 3, name: c.name, item: SITE.url + classPath(c.id) }] };
  return (
    <Sheet here="browse" className={`${s.page} ${s.wide}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(crumbs) }} />
      <p className={s.crumbs}><Link href="/browse">Browse</Link> / {c.name}</p>
      <h1>{c.name}</h1>
      <div className={s.facts}>
        <div><b>{n(c.count)}</b><span>disclosed reports</span></div>
        <div><b>{n(c.weaknesses.length)}</b><span>weaknesses</span></div>
        {c.bounty > 0 && <div><b>{usd(c.bounty)}</b><span>paid in bounties</span></div>}
      </div>
      <p className={s.acts}><Link href={`/?class=${c.id}`}>See it on the map</Link><Link href="/bypasses">Bypass library</Link><Link href="/payloads">Payloads</Link></p>

      <h2>Weaknesses in this class</h2>
      <Bars rows={c.weaknesses.map((w) => ({ name: w.name, count: w.count }))} />

      {linked.length > 0 && (<>
        <h2>Often found together with</h2>
        <Bars rows={linked.sort((x, y) => y.k - x.k).map(({ o, k }) => ({ name: o.name, count: k, href: classPath(o.id) }))} />
      </>)}

      <h2>Most upvoted {c.name} reports</h2>
      <StatusFilter base={classPath(c.id)} current={status} />
      {top.length === 0 && <p>No reports with this status.</p>}
      <ReportList rows={top} />
    </Sheet>
  );
}
