import Link from "next/link";
import { notFound } from "next/navigation";
import Sheet from "@/components/Sheet";
import ReportList from "@/components/ReportList";
import { n } from "@/lib/browse";
import { defenceCounts, reportsByDefence } from "@/lib/db";
import { defenceById } from "@/lib/defences.mjs";
import s from "../../plain.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const d = defenceById((await params).id);
  if (!d) return { title: "Not found" };
  return {
    title: `${d.name}: bypasses from disclosed bug bounty reports`,
    description: `Real reports where researchers got past ${d.name.toLowerCase()}: ${d.about.toLowerCase()}. With the full write-up of each.`,
    alternates: { canonical: `/bypasses/${d.id}` },
  };
}

export default async function BypassPage({ params }: Props) {
  const d = defenceById((await params).id);
  if (!d) notFound();
  const count = defenceCounts()[d.id] || 0, rows = reportsByDefence(d.id, 100);
  if (!count) notFound();
  return (
    <Sheet here="bypasses" className={`${s.page} ${s.wide}`}>
      <p className={s.crumbs}><Link href="/browse">Browse</Link> / <Link href="/bypasses">Bypasses</Link> / {d.name}</p>
      <h1>Getting past {d.name.toLowerCase().replace(/^(csrf|csp|ssrf|url|cors)\b/, (m) => m.toUpperCase())}</h1>
      <p className={s.lede}>{d.about}. {n(count)} disclosed reports got past one{count > rows.length ? `; the ${rows.length} most upvoted are below` : ""}.</p>
      <ReportList rows={rows} />
    </Sheet>
  );
}
