import Link from "next/link";
import Sheet from "@/components/Sheet";
import { SITE } from "@/lib/site";
import s from "../plain.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Terms of use",
  description: `The rules for using ${SITE.name}, its downloads and its API.`,
  alternates: { canonical: "/terms" },
};

export default function Terms() {
  return (
    <Sheet className={s.page}>
      <h1>Terms of use</h1>
      <p className={s.lede}>{SITE.name} exists to help people find and fix security bugs. By using the site, its downloads or its API you agree to the following.</p>

      <h2>Test only what you are allowed to test</h2>
      <p>Everything here is for authorised security testing, research and learning. Use payloads, CVE checks and techniques only on systems you own or have permission to test, such as assets inside the published scope of a bug bounty programme.</p>
      <p>The subdomains listed for a programme are names known to exist, not a statement of scope. Many are out of scope. Read the programme&apos;s own policy before you touch any of them.</p>

      <h2>Whose content this is</h2>
      <p>Reports belong to their authors and to the programmes that disclosed them; we link each one to its original. Payload references, CVE checks and subdomain data come from the open projects credited on the <Link href="/about">About page</Link>, under their own licences. {SITE.name} is independent and is not affiliated with HackerOne or any programme shown.</p>

      <h2>Accounts and the API</h2>
      <ul>
        <li>API keys are given by invitation and are personal to you. Keep them private; you are responsible for what is done with them.</li>
        <li>Each account has request limits. Do not try to get round them, for example with extra accounts.</li>
        <li>We may withdraw access from anyone who misuses the service, and we may change or stop the API.</li>
      </ul>

      <h2>No warranty</h2>
      <p>The data is gathered automatically from public sources and will contain mistakes and gaps. It is provided as it is, without any guarantee that it is accurate, complete or current. Reports are sorted into classes by machine, and a CVE check marked as likely may still be wrong. Confirm before you rely on anything here.</p>
      <p>To the extent the law allows, {SITE.name} is not liable for loss or damage arising from use of the site, its data or its API.</p>

      <h2>Changes</h2>
      <p>These terms may change as the service grows. The current version is always on this page.</p>

      <p className={s.small}>How personal data is handled is set out on the <Link href="/privacy">privacy page</Link>. Questions go to <a href="https://x.com/hackerspider1" target="_blank" rel="noopener noreferrer">@hackerspider1</a>.</p>
    </Sheet>
  );
}
