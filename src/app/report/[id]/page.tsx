/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import Writeup from "@/components/Writeup";
import { getReport, relatedReports } from "@/lib/db";
import { Sev } from "@/components/Bars";
import Sheet from "@/components/Sheet";
import { classPath, jsonLd, programPath } from "@/lib/browse";
import { SITE } from "@/lib/site";
import { classOf, statusLabel } from "@/lib/taxonomy";
import s from "./report.module.css";

export const dynamic = "force-dynamic";

const money = (n: number | null) => (n ? "$" + Math.round(n).toLocaleString("en-US") : null);
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const r = await getReport(Number((await params).id));
  if (!r) return { title: "Report not found" };
  const program = r.program_name || r.program, weakness = r.weakness || r.weakness_guess;
  const text = (r.summary || r.body || "").replace(/[#*`>\[\]]/g, "").replace(/\s+/g, " ").trim();
  const description = [weakness && program ? `${weakness} reported to ${program}.` : weakness || program, text.slice(0, 150)].filter(Boolean).join(" ") || `Disclosed bug bounty report #${r.id}.`;
  return {
    title: r.title, description,
    alternates: { canonical: `/report/${r.id}` },
    openGraph: { type: "article", title: r.title, description, url: `/report/${r.id}`, publishedTime: r.disclosed_at || undefined },
  };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const r = await getReport(Number((await params).id));
  if (!r) notFound();
  const weakness = r.weakness || r.weakness_guess || null, guessed = !r.weakness && !!r.weakness_guess;
  const cls = classOf(weakness);
  let cves: string[] = [];
  try { const j = r.cve_ids ? JSON.parse(r.cve_ids) : []; if (Array.isArray(j)) cves = j; } catch { /* malformed list: show none */ }
  const related = relatedReports(r);
  const h1 = `https://hackerone.com/reports/${r.id}`;
  const facts: [string, string | null][] = [
    ["Program", r.program_name || r.program],
    ["Weakness", weakness ? weakness + (guessed ? " (our guess from the title; the program set none)" : "") : null],
    ["Class", cls.name],
    ["Asset", r.asset ? `${r.asset}${r.asset_type ? ` (${r.asset_type.toLowerCase().replace(/_/g, " ")})` : ""}` : null],
    ["Reported by", r.reporter],
    ["Submitted", day(r.submitted_at)],
    ["CVE", cves.length ? cves.join(", ") : null],
  ];
  return (
    <Sheet here="browse" className={s.page} actions={<a href={h1} target="_blank" rel="noreferrer">Open on HackerOne</a>}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        "@context": "https://schema.org", "@type": "TechArticle", headline: r.title.slice(0, 110), url: `${SITE.url}/report/${r.id}`,
        datePublished: r.disclosed_at || undefined, author: r.reporter ? { "@type": "Person", name: r.reporter } : undefined,
        about: [weakness, cls.name].filter(Boolean), isBasedOn: h1, publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
      }) }} />
      <article className={s.grid}>
        <div className={s.main}>
          <p className={s.tag}>
            {r.logo && <img src={r.logo} alt="" width={22} height={22} className={s.logo} />}
            {r.program_name || r.program ? `${r.program_name || r.program} · ` : ""}Report #{r.id}
          </p>
          <h1>{r.title}</h1>
          <div className={s.read}>
            {statusLabel(r.substate) && <div><b>{statusLabel(r.substate)}</b><span>status</span></div>}
            {r.severity && r.severity !== "none" && <div><b><Sev level={r.severity} /> {r.severity}</b><span>severity</span></div>}
            {r.bounty ? <div><b>{money(r.bounty)}</b><span>bounty</span></div> : null}
            {r.votes ? <div><b>{r.votes.toLocaleString("en-US")}</b><span>upvotes</span></div> : null}
            {r.disclosed_at && <div><b>{day(r.disclosed_at)}</b><span>disclosed</span></div>}
          </div>
          {r.summary && (
            <section className={s.summary}>
              <h2>Summary</h2>
              <Writeup>{r.summary}</Writeup>
            </section>
          )}
          <section className={s.body}>
            <h2>How it was found</h2>
            {r.body ? (
              <Writeup>{r.body}</Writeup>
            ) : (
              <p className={s.missing}>
                The write-up for this report has not been downloaded yet, or the program disclosed it without one.{" "}
                <a href={h1} target="_blank" rel="noreferrer">Read it on HackerOne.</a>
              </p>
            )}
          </section>
        </div>
        <aside className={s.side}>
          <p className={s.more}>
            More: <Link href={classPath(cls.id)}>{cls.name} reports</Link>
            {(r.program_name || r.program) && <> · <Link href={programPath(r.program_name || r.program!)}>{r.program_name || r.program} reports</Link></>}
          </p>
          <dl>
            {facts.filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          {related.length > 0 && (
            <section>
              <h2>More reports with this weakness</h2>
              {related.map((x) => (
                <Link key={x.id} href={`/report/${x.id}`} className={s.rel}>
                  <span>{x.title}</span>
                  <small>{[x.program, x.severity !== "none" ? x.severity : null, money(x.bounty)].filter(Boolean).join("  ·  ")}</small>
                </Link>
              ))}
            </section>
          )}
        </aside>
      </article>
      <p className={s.foot}>This report was disclosed publicly on HackerOne and belongs to its author and the program. <a href={h1} target="_blank" rel="noreferrer">See the original</a></p>
    </Sheet>
  );
}
