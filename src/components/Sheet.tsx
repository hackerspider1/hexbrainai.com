import Link from "next/link";
import Mark from "@/components/Mark";
import { currentUser, signInLive } from "@/lib/auth";
import { SITE } from "@/lib/site";
import s from "./Sheet.module.css";

const NAV: [string, string, string][] = [["map", "/", "Map"], ["browse", "/browse", "Browse"], ["bypasses", "/bypasses", "Bypasses"], ["payloads", "/payloads", "Payloads"], ["cves", "/cves", "CVEs"]];
export type Here = "browse" | "bypasses" | "payloads" | "cves" | "account" | "about" | "";

// Tick marks round the dial drawn behind every page: one every 3 degrees, a longer one every 15.
const TICKS = Array.from({ length: 120 }, (_, i) => {
  const a = (i * 3 * Math.PI) / 180, r0 = i % 5 ? 371 : 364, x = Math.cos(a), y = Math.sin(a);
  return `M${(400 + x * r0).toFixed(1)} ${(400 + y * r0).toFixed(1)}L${(400 + x * 380).toFixed(1)} ${(400 + y * 380).toFixed(1)}`;
}).join("");

/** The sheet every text page is drawn on: the same header, corner marks and dial as the map, so the pages read as one site. */
export default async function Sheet({ here = "", className, actions, children }: { here?: Here; className: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <div className={s.sheet}>
      <svg className={s.dial} viewBox="0 0 800 800" aria-hidden="true" focusable="false">
        <g className={s.turn}><path d={TICKS} /></g>
        <circle cx="400" cy="400" r="392" /><circle cx="400" cy="400" r="318" strokeDasharray="1 7" /><circle cx="400" cy="400" r="252" />
        <path d="M400 130V182M400 618V670M130 400H182M618 400H670M392 400H408M400 392V408" />
      </svg>
      {["tl", "tr", "bl", "br"].map((c) => <i key={c} className={`${s.corner} ${s[c]}`} aria-hidden="true" />)}
      <header className={s.top}>
        <nav className={s.nav} aria-label="Sections">
          {NAV.map(([id, href, label]) => <Link key={id} href={href} aria-current={id === here ? "page" : undefined}>{label}</Link>)}
        </nav>
        <Link href="/" className={s.brand} aria-label={`${SITE.name}: open the map`}><Mark />{SITE.name}</Link>
        <div className={s.right}>
          {actions && <span className={s.extra}>{actions}</span>}
          {user ? <Link href="/account" aria-current={here === "account" ? "page" : undefined}>Account</Link> : signInLive() ? <Link href="/account">Sign in</Link> : null}
        </div>
      </header>
      <main className={className}>{children}</main>
      <footer className={s.foot}>
        <span>{SITE.name}. Reports belong to their authors and the programs that disclosed them.</span>
        <span className={s.by}>Designed by <a href="https://github.com/hackerspider1" target="_blank" rel="noopener noreferrer">@hackerspider1</a> <span aria-label="with love" role="img">❤️</span></span>
        <nav aria-label="More"><Link href="/about">About</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/">Map</Link></nav>
      </footer>
    </div>
  );
}
