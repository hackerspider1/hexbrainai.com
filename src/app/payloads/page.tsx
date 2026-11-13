import Link from "next/link";
import Sheet from "@/components/Sheet";
import { n } from "@/lib/browse";
import { techniqueTopics } from "@/lib/db";
import s from "../plain.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Payloads and techniques by vulnerability",
  description: "Payloads, techniques and filter bypasses for SQL injection, XSS, SSRF, SSTI, XXE, deserialization, JWT, OAuth and 50 more topics, from the open PayloadsAllTheThings collection.",
  alternates: { canonical: "/payloads" },
};

export default function Payloads() {
  const topics = techniqueTopics();
  return (
    <Sheet here="payloads" className={`${s.page} ${s.wide}`}>
      <p className={s.crumbs}><Link href="/browse">Browse</Link> / Payloads</p>
      <h1>Payloads and techniques</h1>
      <p className={s.lede}>What to send for each kind of bug, including variants that get past filters. {n(topics.reduce((t, x) => t + x.n, 0))} passages across {topics.length} topics. For how researchers got past protections in real reports, see the <Link href="/bypasses">bypass library</Link>.</p>
      {topics.length === 0 && <p>This collection has not been imported on this server yet.</p>}
      <ul className={s.cols}>
        {topics.map((t) => <li key={t.topic}><Link href={`/payloads/${encodeURIComponent(t.topic)}`}>{t.topic}</Link> <small>{n(t.n)}</small></li>)}
      </ul>
      <p className={s.small}>This section is <a href="https://github.com/swisskyrepo/PayloadsAllTheThings" target="_blank" rel="noopener noreferrer">PayloadsAllTheThings</a> by Swissky and contributors, used under the MIT licence. Use it only on systems you are authorised to test.</p>
    </Sheet>
  );
}
