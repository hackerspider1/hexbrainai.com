import Link from "next/link";
import Mark from "@/components/Mark";
import { getGraph } from "@/lib/db";
import { SITE } from "@/lib/site";
import s from "../plain.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "About",
  description: "What this map of disclosed bug bounty reports is, where its data comes from, and how to connect an AI assistant to it.",
  alternates: { canonical: "/about" },
};

export default function About() {
  const g = getGraph(), n = (v: number) => v.toLocaleString("en-US");
  return (
    <main className={s.page}>
      <Link href="/" className={s.brand}><Mark />{SITE.name}</Link>
      <h1>{SITE.tagline}</h1>
      <p>
        {SITE.name} is a map of {n(g.total)} publicly disclosed bug bounty reports from {n(g.programs)} programs, grouped into {n(g.classes.length)} vulnerability
        classes and {n(g.weaknessCount)} weaknesses. Open a class, pick a weakness, and read how each bug was found, in the researcher&apos;s own words.
      </p>

      <h2>How to read the map</h2>
      <ul>
        <li>Each node on the inner ring is a vulnerability class. Each strip beyond it is a weakness, and each dot in a strip is one report.</li>
        <li>Lines through the middle join classes that turn up in the same reports. Thicker lines mean more shared reports.</li>
        <li>The Programs view shows every program as a strip of its reports, with its logo inside the ring.</li>
        <li>Opening a program can mark its reports on the vulnerability map, to show where that program has been hit.</li>
        <li>The <Link href="/bypasses">bypass library</Link> groups reports by the protection they got past: WAFs, filters, 2FA, earlier fixes and more.</li>
      </ul>

      <h2>Use it from an AI assistant</h2>
      <p>
        Claude, ChatGPT and other assistants can search the reports, read any write-up, pull a playbook for a bug class, and check what a program
        has already paid for. Access is read-only.{" "}
        <Link href="/account">Sign in with Google</Link> to create an API key and get the connection details.
      </p>

      <h2>Where the data comes from</h2>
      <ul>
        <li>The list of reports comes from the open <a href="https://github.com/reddelexc/hackerone-reports" target="_blank" rel="noopener noreferrer">hackerone-reports</a> dataset.</li>
        <li>Each write-up comes from that report&apos;s own public page on HackerOne. Every report here links back to it.</li>
        <li>The <Link href="/payloads">payloads and techniques</Link> section is <a href="https://github.com/swisskyrepo/PayloadsAllTheThings" target="_blank" rel="noopener noreferrer">PayloadsAllTheThings</a> by Swissky and contributors, used under the MIT licence.</li>
        <li>The <Link href="/cves">CVE library</Link> takes its checks from <a href="https://github.com/projectdiscovery/nuclei-templates" target="_blank" rel="noopener noreferrer">nuclei-templates</a> (MIT licence), its exploited-in-the-wild list from CISA, and its likelihood scores from EPSS.</li>
        <li>Where a program filed a report without a weakness, the class shown is our guess from the title, and the report page says so.</li>
        <li>{n(g.withBody)} write-ups are stored so far; the rest load from HackerOne the first time someone opens them.</li>
      </ul>

      <h2>Please use it responsibly</h2>
      <p>
        These reports describe real vulnerabilities that were fixed and then disclosed by the programs involved. Use them to learn and to test systems you are
        authorised to test, inside each program&apos;s scope.
      </p>
      <p className={s.small}>
        {SITE.name} is an independent project. It is not affiliated with or endorsed by HackerOne or any program shown. Reports belong to their authors and the
        programs that disclosed them; program names and logos belong to their owners. To have something removed, contact the site owner.
      </p>
      <p><Link href="/">Open the map</Link> · <Link href="/browse">Browse as a list</Link></p>
    </main>
  );
}
