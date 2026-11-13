import Link from "next/link";
import { notFound } from "next/navigation";
import Mark from "@/components/Mark";
import { getCve, getCveStub } from "@/lib/cves";
import { SITE } from "@/lib/site";
import s from "../../plain.module.css";
import r from "../../report/[id]/report.module.css";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const id = (await params).id, c = getCve(id);
  if (!c) { const stub = getCveStub(id); return stub ? { title: `${stub.id}: likelihood of exploitation`, alternates: { canonical: `/cve/${stub.id}` } } : { title: "CVE not found" }; }
  return {
    title: `${c.id}: ${c.name || "details and how to check"}`,
    description: `${(c.description || c.name || "").slice(0, 150)}${c.template ? " Includes the request that confirms it." : ""}`,
    alternates: { canonical: `/cve/${c.id}` },
  };
}

export default async function CvePage({ params }: Props) {
  const id = (await params).id, c = getCve(id);
  if (!c) {
    // Registered, but we hold no check or exploitation record for it.
    const stub = getCveStub(id);
    if (!stub) notFound();
    return (
      <main className={`${s.page} ${s.wide}`}>
        <Link href="/" className={s.brand}><Mark />{SITE.name}</Link>
        <p className={s.crumbs}><Link href="/browse">Browse</Link> / <Link href="/cves">CVEs</Link> / {stub.id}</p>
        <h1>{stub.id}</h1>
        <p className={s.lede}>A registered CVE. It is not on the list of vulnerabilities known to be exploited, and we hold no ready check for it.</p>
        {stub.epss != null && <p>Likelihood of exploitation in the next 30 days: {Math.round(stub.epss * 1000) / 10}%.</p>}
        <p><a href={`https://nvd.nist.gov/vuln/detail/${stub.id}`} target="_blank" rel="noopener noreferrer">Read its record on the National Vulnerability Database</a></p>
      </main>
    );
  }
  let refs: string[] = []; try { refs = JSON.parse(c.refs || "[]"); } catch { /* none */ }
  const facts = [c.severity, c.cvss && `CVSS ${c.cvss}`, [c.vendor, c.product].filter(Boolean).join(" / ").replace(/_/g, " "), c.cwe].filter(Boolean).join(" · ");
  return (
    <main className={`${s.page} ${s.wide}`}>
      <Link href="/" className={s.brand}><Mark />{SITE.name}</Link>
      <p className={s.crumbs}><Link href="/browse">Browse</Link> / <Link href="/cves">CVEs</Link> / {c.id}</p>
      <h1>{c.id}{c.name ? `: ${c.name}` : ""}</h1>
      <p className={s.lede}>{facts}</p>
      {c.kev ? <p><b>Exploited in the wild.</b> Listed by CISA on {c.kev_added}{c.kev_ransomware ? "; known to be used by ransomware" : ""}.</p> : null}
      {c.epss != null && <p>Likelihood of exploitation in the next 30 days: {Math.round(c.epss * 1000) / 10}% (higher than {Math.round((c.epss_pct || 0) * 100)}% of all CVEs).</p>}
      {c.description && <p>{c.description}</p>}
      {c.impact && <><h2>Impact</h2><p>{c.impact}</p></>}
      {c.remediation && <><h2>Fix</h2><p>{c.remediation}</p></>}
      {c.template ? (<>
        <h2>How to confirm it</h2>
        {c.check_summary && <div className={r.body}><pre><code>{c.check_summary}</code></pre></div>}
        <p>Run it with nuclei: <code>nuclei -id {c.id} -u &lt;target&gt;</code>{c.verified ? "" : ". This check is not marked as verified by its authors."}</p>
        <details className={s.fold}><summary>The full check</summary><div className={r.body}><pre><code>{c.template}</code></pre></div></details>
      </>) : <p>No ready check is stored for this CVE. Confirm it by hand from the references.</p>}
      {refs.length > 0 && (<><h2>References</h2><ul>{refs.map((u) => <li key={u}><a href={u} target="_blank" rel="noopener noreferrer nofollow">{u}</a></li>)}</ul></>)}
      <p className={s.small}>Use this check only on systems you are authorised to test. <Link href="/about">Where the data comes from</Link></p>
    </main>
  );
}
