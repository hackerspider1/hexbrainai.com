// Step two of signing in: Google sends the visitor back with a code, which is exchanged for their identity.
import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, SESSION_COOKIE, cookieOptions, createSession, signInLive, upsertGoogleUser } from "@/lib/auth";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const fail = (why: string) => { const r = NextResponse.redirect(`${SITE.url}/account?error=${why}`); r.cookies.delete(OAUTH_COOKIE); return r; };
  if (!signInLive()) return NextResponse.redirect(`${SITE.url}/account`);
  const q = req.nextUrl.searchParams, [state, nonce] = (req.cookies.get(OAUTH_COOKIE)?.value || "").split(".");
  if (q.get("error")) return fail("cancelled");
  if (!state || !nonce || q.get("state") !== state || !q.get("code")) return fail("state");
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({
        code: q.get("code")!, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${SITE.url}/auth/google/callback`, grant_type: "authorization_code",
      }),
    });
    if (!res.ok) return fail("google");
    // The identity token comes straight from Google over HTTPS, so its claims can be read directly; they are still checked.
    const idToken = String((await res.json()).id_token || ""), claims = JSON.parse(Buffer.from(idToken.split(".")[1] || "", "base64url").toString() || "{}");
    const okIssuer = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
    if (!okIssuer || claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.nonce !== nonce || !(claims.exp * 1000 > Date.now()) || !claims.sub) return fail("google");
    if (claims.email && claims.email_verified === false) return fail("unverified");
    const session = createSession(upsertGoogleUser({ sub: String(claims.sub), email: claims.email, name: claims.name, picture: claims.picture }));
    const done = NextResponse.redirect(`${SITE.url}/account`);
    done.cookies.set(SESSION_COOKIE, session.value, cookieOptions(session.maxAge));
    done.cookies.delete(OAUTH_COOKIE);
    return done;
  } catch {
    return fail("google");
  }
}
