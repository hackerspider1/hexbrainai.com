// Step one of signing in: send the visitor to Google.
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { OAUTH_COOKIE, cookieOptions, signInLive } from "@/lib/auth";
import { tooMany } from "@/lib/rate";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const busy = tooMany(req, "sign-in", 20);
  if (busy) return busy;
  if (!signInLive()) return NextResponse.redirect(`${SITE.url}/account`); // not open yet: the account page says so
  const state = randomBytes(24).toString("base64url"), nonce = randomBytes(24).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: `${SITE.url}/auth/google/callback`, response_type: "code",
    scope: "openid email profile", state, nonce, prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, `${state}.${nonce}`, cookieOptions(600)); // proves the reply belongs to this browser
  return res;
}
