import Link from "next/link";
import { notFound } from "next/navigation";
import { Meter, Sev } from "@/components/Bars";
import Sheet from "@/components/Sheet";
import { getCve, getCveStub } from "@/lib/cves";
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
      <Sheet here="cves" className={`${s.page} ${s.wide}`}>
        <p className={s.crumbs}><Link href="/browse">Browse</Link> / <Link href="/cves">CVEs</Link> / {stub.id}</p>
        <h1>{stub.id}</h1>
        <p className={s.lede}>A registered CVE. It is not on the list of vulnerabilities known to be exploited, and we hold no ready check for it.</p>
        <div className={s.facts}>
          <div><b>Not known</b><span>exploited in the wild</span></div>
          {stub.epss != null && <div className={s.wide}><Meter value={stub.epss} /><b>{Math.round(stub.epss * 1000) / 10}%</b><span>likelihood of exploitation in the next 30 days</span></div>}
        </div>
        <p className={s.acts}><a href={`https://nvd.nist.gov/vuln/detail/${stub.id}`} target="_blank" rel="noopener noreferrer">Read its record on the National Vulnerability Database</a><Link href="/?view=cves">See it on the map</Link></p>
      </Sheet>
    );
  }
  let refs: string[] = []; try { refs = JSON.parse(c.refs || "[]"); } catch { /* none */ }
  const product = [c.vendor, c.product].filter(Boolean).join(" / ").replace(/_/g, " ");
  return (
    <Sheet here="cves" className={`${s.page} ${s.wide}`}>
      <p className={s.crumbs}><Link href="/browse">Browse</Link> / <Link href="/cves">CVEs</Link> / {c.id}</p>
      <p className={s.crumbs}><span>{c.id}</span>{product && <span>· {product}</span>}{c.cwe && <span>· {c.cwe.replace(/,/g, ", ")}</span>}</p>
      <h1>{c.name || c.id}</h1>
      {c.kev ? <div className={s.plate} data-hot=""><p><b>Exploited in the wild.</b> Listed by CISA on {c.kev_added}{c.kev_ransomware ? "; known to be used by ransomware" : ""}.</p></div> : null}
      <div className={s.facts}>
        {c.severity && <div><b><Sev level={c.severity} /> {c.severity}</b><span>severity</span></div>}
        {c.cvss ? <div><b>{c.cvss}</b><span>CVSS score</span></div> : null}
        {c.epss != null && <div className={s.wide}><Meter value={c.epss} hot={c.epss >= 0.1} /><b>{Math.round(c.epss * 1000) / 10}%</b><span>likelihood of exploitation, next 30 days</span></div>}
        {c.epss != null && c.epss_pct != null && <div><b>{Math.round(c.epss_pct * 100)}%</b><span>of all CVEs are less likely</span></div>}
        <div><b>{c.template ? "Ready" : "None"}</b><span>check to confirm it</span></div>
      </div>
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
    </Sheet>
  );
}
