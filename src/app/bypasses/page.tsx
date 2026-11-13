import Link from "next/link";
import Mark from "@/components/Mark";
import { n } from "@/lib/browse";
import { defenceCounts } from "@/lib/db";
import { DEFENCES } from "@/lib/defences.mjs";
import { SITE } from "@/lib/site";
import s from "../plain.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Bypass library: how researchers got past WAFs, filters, 2FA and fixes",
  description: "Disclosed bug bounty reports grouped by the protection they got past: WAFs, sanitisers, CSP, SSRF allow-lists, 2FA, rate limits, earlier fixes and more.",
  alternates: { canonical: "/bypasses" },
};

export default function Bypasses() {
  const counts = defenceCounts(), list = DEFENCES.map((d) => ({ ...d, count: counts[d.id] || 0 })).filter((d) => d.count).sort((a, b) => b.count - a.count);
  const total = list.reduce((t, d) => t + d.count, 0);
  return (
    <main className={`${s.page} ${s.wide}`}>
      <Link href="/" className={s.brand}><Mark />{SITE.name}</Link>
      <p className={s.crumbs}><Link href="/browse">Browse</Link> / Bypasses</p>
      <h1>The bypass library</h1>
      <p className={s.lede}>Reports where a researcher got past a protection, grouped by what they got past. {n(total)} cases across {list.length} kinds of protection, drawn from the write-ups on this site.</p>
      <ul className={s.cards}>
        {list.map((d) => (
          <li key={d.id}>
            <Link href={`/bypasses/${d.id}`}>{d.name}</Link>
            <small>{n(d.count)} reports</small>
            <span>{d.about}</span>
          </li>
        ))}
      </ul>
      <p className={s.small}>Reports are sorted into these groups automatically, from their titles and from the sentences that describe a bypass, so a few will be misfiled.</p>
    </main>
  );
}
