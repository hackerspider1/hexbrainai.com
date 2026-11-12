/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Mark from "@/components/Mark";
import { MAX_KEYS, currentUser, listKeys, signInLive } from "@/lib/auth";
import { SITE } from "@/lib/site";
import { deleteAccountAction, signOutAction } from "./actions";
import Keys from "./Keys";
import plain from "../plain.module.css";
import s from "./account.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account", robots: { index: false } };

const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled. Nothing was changed.",
  state: "That sign-in link had expired. Start again.",
  google: "Google could not confirm your account. Try again in a moment.",
  unverified: "Your Google account's email address is not verified yet. Verify it with Google, then sign in again.",
};

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser(), error = ERRORS[(await searchParams).error || ""];
  return (
    <main className={plain.page}>
      <Link href="/" className={plain.brand}><Mark />{SITE.name}</Link>
      {!user && !signInLive() ? (
        <>
          <p className={s.soon}>Coming soon</p>
          <h1>Sign-in is on its way.</h1>
          <p>Soon you will be able to sign in with Google, create an API key, and connect Claude, ChatGPT or your own scripts to every report on the map.</p>
          <p>The map and every write-up are open to everyone now, with no account. <Link href="/">Open the map</Link></p>
        </>
      ) : !user ? (
        <>
          <h1>Sign in to get an API key.</h1>
          <p>With a key, Claude, ChatGPT or your own scripts can search every report, read any write-up and pull a playbook for a bug class while you test. The map itself needs no account.</p>
          {error && <p className={s.error} role="alert">{error}</p>}
          <a className={s.google} href="/auth/google"><GoogleG />Continue with Google</a>
          <p className={plain.small}>We keep your name, email address and profile picture from Google, to show your account. Nothing is posted anywhere, and you can delete your account at any time.</p>
        </>
      ) : (
        <>
          <div className={s.who}>
            {user.picture ? <img src={user.picture} alt="" width={56} height={56} referrerPolicy="no-referrer" /> : <i>{(user.name || user.email || "?").slice(0, 1).toUpperCase()}</i>}
            <div><h1>{user.name || "Your account"}</h1><p>{user.email} · member since {new Date(user.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p></div>
          </div>
          <h2>API keys</h2>
          <Keys keys={listKeys(user.id)} max={MAX_KEYS} site={SITE.url} />
          <h2>Account</h2>
          <div className={s.actions}>
            <form action={signOutAction}><button>Sign out</button></form>
            <form action={deleteAccountAction}><button className={s.danger}>Delete my account and keys</button></form>
          </div>
        </>
      )}
    </main>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.2.800-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.900 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
