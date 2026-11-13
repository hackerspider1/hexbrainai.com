/* eslint-disable @next/next/no-img-element */
import Sheet from "@/components/Sheet";
import { MAX_KEYS, currentUser, keyTotals, listKeys, signInLive } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { signOutAction } from "./actions";
import Keys, { DeleteAccount } from "./Keys";
import s from "./account.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account", robots: { index: false } };

const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled. Nothing was changed.",
  state: "That sign-in link had expired. Start again.",
  google: "Google could not confirm your account. Try again in a moment.",
  unverified: "Your Google account's email address is not verified yet. Verify it with Google, then sign in again.",
};
const UNLOCKS: [string, string][] = [
  ["plan_tests", "Describe a feature and get the bug classes real reports found in features like it"],
  ["find_cves", "Known CVEs for the technologies a target runs, with the request that confirms each"],
  ["find_bypasses", "How researchers got past a WAF, filter, 2FA or an earlier fix, with the payloads they used"],
  ["find_payloads", "Payloads and techniques for 60+ bug classes, with filter-bypass variants"],
  ["get_testing_playbook", "How a bug class was found before, with real steps and requests"],
  ["get_program_history", "What a program has already paid for, and what is rarely reported there"],
  ["search_reports", "Full-text search across every title and write-up"],
  ["get_report", "Any report in full, in the researcher's own words"],
  ["list_classes", "Every vulnerability class and weakness, with counts"],
];
const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser(), error = ERRORS[(await searchParams).error || ""];
  const out = user ? <form action={signOutAction}><button>Sign out</button></form> : null;

  if (!user) return (
    <Sheet here="account" className={s.page} actions={out}>
      <div className={s.split}>
        <section className={s.enter}>
          <p className={s.tag}>Account</p>
          <h1>Sign in to connect your AI.</h1>
          <p className={s.lede}>Create an API key and Claude, ChatGPT or your own scripts can search {SITE.name} while you test: every report, every write-up, a playbook for each bug class.</p>
          {error && <p className={s.error} role="alert">{error}</p>}
          {signInLive()
            ? <a className={s.google} href="/auth/google"><GoogleG />Continue with Google</a>
            : <p className={s.error}>Sign-in is not available on this site yet.</p>}
          <p className={s.fine}>New here? The same button creates your account. We keep only your name, email address and profile picture from Google, and you can delete your account at any time. The map and every write-up stay open without an account.</p>
        </section>
        <aside className={s.unlocks} aria-label="What a key unlocks">
          <h2>What a key unlocks</h2>
          <dl>{UNLOCKS.map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}</dl>
          <p>Read-only access, 90 requests a minute and 5,000 a day per account.</p>
        </aside>
      </div>
    </Sheet>
  );

  const keys = listKeys(user.id), totals = keyTotals(user.id);
  return (
    <Sheet here="account" className={s.page} actions={out}>
      <section className={s.who}>
        {user.picture ? <img src={user.picture} alt="" width={64} height={64} referrerPolicy="no-referrer" /> : <i>{(user.name || user.email || "?").slice(0, 1).toUpperCase()}</i>}
        <div>
          <h1>{user.name || "Your account"}</h1>
          <p>{user.email} · member since {new Date(user.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
        </div>
        <dl className={s.facts}>
          <div><dt>{keys.length} of {MAX_KEYS}</dt><dd>API keys</dd></div>
          <div><dt>{totals.requests.toLocaleString("en-US")}</dt><dd>requests made</dd></div>
          <div><dt>{day(totals.lastUsed)}</dt><dd>last used</dd></div>
        </dl>
      </section>
      <Keys keys={keys} max={MAX_KEYS} site={SITE.url} />
      <section className={s.block}>
        <h2>Delete account</h2>
        <p className={s.dim}>Removes your profile and every key. Keys stop working straight away. This cannot be undone.</p>
        <DeleteAccount />
      </section>
    </Sheet>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
