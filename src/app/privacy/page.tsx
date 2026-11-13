import Link from "next/link";
import Sheet from "@/components/Sheet";
import { SITE } from "@/lib/site";
import s from "../plain.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Privacy",
  description: `What ${SITE.name} stores about the people who use it, and how to have it removed.`,
  alternates: { canonical: "/privacy" },
};

export default function Privacy() {
  return (
    <Sheet className={s.page}>
      <h1>Privacy</h1>
      <p className={s.lede}>{SITE.name} can be used without an account, and it does not track you. This page says exactly what is kept when you do sign in.</p>

      <h2>Without an account</h2>
      <p>The map, every report, the CVE library, the payloads and the downloads are open to everyone. No cookies are set, and there are no adverts, analytics scripts or third-party trackers on any page.</p>
      <p>To stop abuse, the server counts requests per network address for a minute at a time. Those counts are held in memory only and are never written down.</p>

      <h2>When you sign in</h2>
      <p>Sign-in is through Google. From Google we receive, and store, four things:</p>
      <ul>
        <li>your name</li>
        <li>your email address</li>
        <li>the address of your profile picture</li>
        <li>the identifier Google uses for your account</li>
      </ul>
      <p>We never see your Google password, and we ask Google for nothing else. One cookie keeps you signed in for up to 30 days; scripts on the page cannot read it, and it is removed when you sign out.</p>

      <h2>API keys</h2>
      <p>If you create an API key, we store a one-way hash of it, the name you gave it, when it was created, when it was last used and how many requests it has made. The key itself is shown to you once and cannot be recovered from what we hold. We do not record what you search for or which reports your assistant reads.</p>

      <h2>Who else handles the data</h2>
      <ul>
        <li>Google, to sign you in.</li>
        <li>Cloudflare, which sits in front of the site and so sees the requests made to it.</li>
        <li>The company that hosts our server.</li>
      </ul>
      <p>We do not sell, rent or share what we hold with anyone else.</p>

      <h2>Removing your data</h2>
      <p>The <Link href="/account">account page</Link> has a Delete account button. It removes your profile, your sessions and every key straight away. Nothing is kept afterwards.</p>

      <h2>Reports about you or your organisation</h2>
      <p>Reports shown here were disclosed publicly on HackerOne by the programs concerned. If a report has since been withdrawn there, or you believe something here should not be public, tell <a href="https://x.com/hackerspider1" target="_blank" rel="noopener noreferrer">@hackerspider1</a> and it will be removed.</p>

      <p className={s.small}>Questions about any of this go to the same place. See also the <Link href="/terms">terms of use</Link>.</p>
    </Sheet>
  );
}
