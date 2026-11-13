/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import Bars from "@/components/Bars";
import Sheet from "@/components/Sheet";
import { plainName } from "@/lib/browse";
import Surface from "@/components/Surface";
import { surfaceOf } from "@/lib/subdomains";
import ReportList, { StatusFilter } from "@/components/ReportList";
import { classPath, jsonLd, n, programPath, usd } from "@/lib/browse";
import { getGraph, listReports } from "@/lib/db";
import { SITE } from "@/lib/site";
import s from "../../plain.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ name: string }>; searchParams: Promise<{ status?: string }> };
const find = async (params: Props["params"]) => { const name = plainName((await params).name), g = getGraph(); return { g, p: g.topPrograms.find((x) => x.name === name) }; };

export async function generateMetadata({ params }: Props) {
  const { p } = await find(params);
  if (!p) return { title: "Program not found" };
  return {
    title: `${p.name} bug bounty: ${n(p.count)} disclosed reports`,
    description: `${n(p.count)} publicly disclosed bug bounty reports for ${p.name}${p.bounty ? `, with ${usd(p.bounty)} paid` : ""}. See what was found, how, and which vulnerability classes come up most.`,
    alternates: { canonical: programPath(p.name) },
  };
}

export default async function ProgramPage({ params, searchParams }: Props) {
  const status = (await searchParams).status || "";
  const { g, p } = await find(params);
  if (!p) notFound();
  const surface = surfaceOf(p.name);
  const top = listReports({ program: p.name, status, limit: 100 }).rows as Parameters<typeof ReportList>[0]["rows"];
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: SITE.name, item: SITE.url }, { "@type": "ListItem", position: 2, name: "Browse", item: `${SITE.url}/browse` },
    { "@type": "ListItem", position: 3, name: p.name, item: SITE.url + programPath(p.name) }] };
  return (
    <Sheet here="browse" className={`${s.page} ${s.wide}`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(crumbs) }} />
      <p className={s.crumbs}><Link href="/browse">Browse</Link> / {p.name}</p>
      <h1>{p.logo && <img src={p.logo} alt="" width={48} height={48} />}{p.name}</h1>
      <div className={s.facts}>
        <div><b>{n(p.count)}</b><span>disclosed reports</span></div>
        {p.bounty > 0 && <div><b>{usd(p.bounty)}</b><span>paid in bounties</span></div>}
        {surface && <div><b>{n(surface.total)}</b><span>known subdomains</span></div>}
      </div>
      <p className={s.acts}><Link href={`/?program=${encodeURIComponent(p.name)}`}>See its reports on the map</Link></p>

      {surface && (<>
        <h2>Attack surface: {n(surface.total)} known subdomains</h2>
        <Surface program={p.name} logo={p.logo} total={surface.total} rootCount={surface.roots.length} branches={surface.branches} />
        <p className={s.small}>Not every host here is in scope. Check the program&apos;s policy before testing.{surface.updated ? ` Last updated ${surface.updated}.` : ""}</p>
      </>)}

      <h2>What gets reported to {p.name}</h2>
      <Bars rows={p.classes.flatMap(([id, k]) => { const c = g.classes.find((x) => x.id === id); return c ? [{ name: c.name, count: k, href: classPath(id) }] : []; })} />

      <h2>Most upvoted reports</h2>
      <StatusFilter base={programPath(p.name)} current={status} />
      {top.length === 0 && <p>No reports with this status.</p>}
      <ReportList rows={top} showProgram={false} />
    </Sheet>
  );
}
