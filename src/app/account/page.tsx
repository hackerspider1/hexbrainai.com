/* eslint-disable @next/next/no-img-element */
import Sheet from "@/components/Sheet";
import { MAX_KEYS, currentUser, inviteOnly, isAdmin, keyTotals, listInvites, listKeys, listWaiting, mayUseApi, signInLive } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { inviteAction, signOutAction, uninviteAction } from "./actions";
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
  ["get_attack_surface", "The subdomains known for a program, to choose where to look"],
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
  const user = await currentUser(), asked = (await searchParams).error || "", error = Object.hasOwn(ERRORS, asked) ? ERRORS[asked] : undefined;
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
          {inviteOnly() && <p className={s.fine}>API keys are by invitation for now. Anyone can sign in; keys unlock once your email address is invited.</p>}
          <p className={s.fine}>By signing in you accept the <a href="/terms">terms</a>; the <a href="/privacy">privacy page</a> says what is kept.</p>
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

  const keys = listKeys(user.id), totals = keyTotals(user.id), allowed = mayUseApi(user.email), admin = isAdmin(user.email), invites = admin ? listInvites() : [], waiting = admin ? listWaiting() : [];
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
      {allowed ? <Keys keys={keys} max={MAX_KEYS} site={SITE.url} /> : (
        <section className={s.block}>
          <h2>API access is by invitation</h2>
          <p className={s.dim}>The API and MCP server are open to invited people for now. You are on the waiting list just by having signed in. To be let in sooner, ask <a href="https://x.com/hackerspider1" target="_blank" rel="noopener noreferrer">@hackerspider1</a> on X; once you are approved, this page lets you create keys. The map and every write-up stay open to everyone.</p>
        </section>
      )}
      {admin && (
        <section className={s.block}>
          <h2>Invitations</h2>
          <p className={s.dim}>{inviteOnly() ? "Only these email addresses may create and use API keys. Removing one stops that person's keys at once." : "Invitations are not being enforced: anyone who signs in can create keys. Set HEXBRAIN_INVITE_ONLY=true to enforce this list."}</p>
          <form action={inviteAction} className={s.create}>
            <input name="emails" placeholder="Email addresses, separated by commas or spaces" aria-label="Email addresses to invite" required />
            <button>Invite</button>
          </form>
          {waiting.length > 0 && (<>
            <h3 className={s.sub}>Signed in and waiting: {waiting.length}</h3>
            {waiting.length > 1 && (
              <form action={inviteAction} className={s.keyRow}>
                <input type="hidden" name="emails" value={waiting.slice(0, 50).map((w) => w.email).join(",")} />
                <div><b>Everyone waiting</b><small>{waiting.length > 50 ? "the first 50 at a time" : `all ${waiting.length}`}</small></div>
                <button>Approve all</button>
              </form>
            )}
            {waiting.map((w) => (
              <form key={w.email} action={inviteAction} className={s.keyRow}>
                <input type="hidden" name="emails" value={w.email} />
                <div><b>{w.name || w.email}</b><small>{w.name ? `${w.email} · ` : ""}signed in {day(w.created_at)}</small></div>
                <button>Approve</button>
              </form>
            ))}
            <h3 className={s.sub}>Invited</h3>
          </>)}
          {invites.map((i) => (
            <form key={i.email} action={uninviteAction} className={s.keyRow}>
              <input type="hidden" name="email" value={i.email} />
              <div><b>{i.email}</b><small>invited {day(i.created_at)} · {i.joined ? "has signed in" : "has not signed in yet"}</small></div>
              <button>Remove</button>
            </form>
          ))}
          {invites.length === 0 && <p className={s.dim}>Nobody is invited yet.</p>}
        </section>
      )}
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
