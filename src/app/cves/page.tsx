import Link from "next/link";
import Bars, { Sev } from "@/components/Bars";
import Sheet from "@/components/Sheet";
import { n } from "@/lib/browse";
import { cveProducts, cveStats, topCves } from "@/lib/cves";
import s from "../plain.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "CVE library: known vulnerabilities with a check to confirm each",
  description: "Thousands of CVEs that can be checked for remotely, each with the request that confirms it, whether it is exploited in the wild, and how likely exploitation is.",
  alternates: { canonical: "/cves" },
};

export default function Cves() {
  const st = cveStats(), recent = topCves(40), products = cveProducts(90);
  return (
    <Sheet here="cves" className={`${s.page} ${s.wide}`}>
      <p className={s.crumbs}><Link href="/browse">Browse</Link> / CVEs</p>
      <h1>The CVE library</h1>
      <p className={s.lede}>Known vulnerabilities in real products, each with the request that confirms it. Match them to the technologies a target runs, then check before you report.</p>
      <p className={s.acts}><Link href="/?view=cves">See every CVE on the map</Link></p>
      {st.total === 0 ? <p>This library has not been imported on this server yet.</p> : (<>
        <div className={s.facts}>
          <div><b>{n(st.registered)}</b><span>registered CVEs</span></div>
          <div><b>{n(st.with_check)}</b><span>with a ready check</span></div>
          <div><b data-hot="">{n(st.exploited)}</b><span>known to be exploited in the wild</span></div>
          <div><b>{n(st.exploited_with_check)}</b><span>exploited, with a check</span></div>
        </div>
        <h2>Recently listed as exploited, with a check</h2>
        <ol className={s.reports}>
          {recent.map((c) => (
            <li key={c.id}>
              <Sev level={c.severity} />
              <div>
                <Link href={`/cve/${c.id}`}>{c.name || c.id}</Link>
                <small>{[c.id, c.kev_added && `listed ${c.kev_added}`, c.kev_ransomware ? "used by ransomware" : null].filter(Boolean).join(" · ")}</small>
              </div>
              <span className={s.num}>{c.cvss ? <><i>CVSS</i> {c.cvss}</> : null}</span>
              <span className={s.num} data-hot="">{c.epss != null ? <>{Math.round(c.epss * 1000) / 10}% <i>likely</i></> : null}</span>
            </li>
          ))}
        </ol>
        <h2>Products with the most checks</h2>
        <Bars rows={products.slice(0, 30).map((p) => ({ name: p.product.replace(/_/g, " "), count: p.n }))} />
      </>)}
      <p className={s.small}>Use these checks only on systems you are authorised to test. <Link href="/about">Where the data comes from</Link></p>
    </Sheet>
  );
}
