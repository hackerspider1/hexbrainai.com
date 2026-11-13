// Accounts, sessions and API keys. People sign in with Google; a signed-in person can create keys for the API.
// Only hashes of session tokens and API keys are stored, so a copy of the database cannot be used to sign in or call the API.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { SITE } from "./site";

export const SESSION_COOKIE = "session", OAUTH_COOKIE = "oauth";
export const MAX_KEYS = 5;
const SESSION_DAYS = 30;
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const emails = (v?: string) => (v || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
/** With HEXBRAIN_INVITE_ONLY=true anyone may sign in, but only invited people (and the admins in HEXBRAIN_ADMINS) may create and use API keys. */
export const inviteOnly = () => process.env.HEXBRAIN_INVITE_ONLY === "true";
export const isAdmin = (email: string | null) => !!email && emails(process.env.HEXBRAIN_ADMINS).includes(email.toLowerCase());
export const mayUseApi = (email: string | null) =>
  !inviteOnly() || isAdmin(email) || (!!email && !!db().prepare("SELECT 1 FROM invites WHERE email = ?").get(email.toLowerCase()));
export type Invite = { email: string; created_at: string; joined: number };
export function listInvites(): Invite[] {
  return db().prepare("SELECT i.email, i.created_at, EXISTS(SELECT 1 FROM users u WHERE lower(u.email) = i.email) AS joined FROM invites i ORDER BY i.created_at DESC").all().map((r) => ({ ...r })) as unknown as Invite[];
}
/** People who have signed in but are neither invited nor admins: the queue an admin can approve from. */
export function listWaiting(): { email: string; name: string | null; created_at: string }[] {
  return (db().prepare(`SELECT email, name, created_at FROM users WHERE email IS NOT NULL AND lower(email) NOT IN (SELECT email FROM invites) ORDER BY created_at DESC LIMIT 300`).all()
    .map((r) => ({ ...r })) as unknown as { email: string; name: string | null; created_at: string }[]).filter((u) => !isAdmin(u.email));
}
/** Returns false when the address is not an email address or the list is full. */
export function addInvite(email: string, by: string | null): boolean {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e) || e.length > 200 || (db().prepare("SELECT COUNT(*) n FROM invites").get() as { n: number }).n >= 2000) return false;
  db().prepare("INSERT OR IGNORE INTO invites (email, added_by, created_at) VALUES (?,?,?)").run(e, by, new Date().toISOString());
  return true;
}
export function removeInvite(email: string) { db().prepare("DELETE FROM invites WHERE email = ?").run(email.trim().toLowerCase()); }
const token = (bytes = 32) => randomBytes(bytes).toString("base64url");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Sign-in is open as soon as the Google details are in place. */
export const signInLive = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
/** Whether the API needs a key. The owner can leave it open with HEXBRAIN_OPEN_API=true. */
// On the live site it always needs one, so nothing is open by accident; on a developer's machine it is open until keys are set up.
export const keysRequired = () => process.env.HEXBRAIN_OPEN_API !== "true" && (process.env.NODE_ENV === "production" || signInLive() || !!process.env.HEXBRAIN_API_KEY);
export const cookieOptions = (maxAge: number) => ({ httpOnly: true, secure: SITE.url.startsWith("https://"), sameSite: "lax" as const, path: "/", maxAge });

export type User = { id: number; email: string | null; name: string | null; picture: string | null; created_at: string };
export type ApiKey = { id: number; name: string; prefix: string; created_at: string; last_used_at: string | null; requests: number };

export function upsertGoogleUser(p: { sub: string; email?: string; name?: string; picture?: string }): number {
  db().prepare(`INSERT INTO users (sub, email, name, picture, created_at) VALUES (?,?,?,?,?)
    ON CONFLICT(sub) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture`)
    .run(p.sub, p.email ?? null, p.name ?? null, p.picture ?? null, new Date().toISOString());
  return (db().prepare("SELECT id FROM users WHERE sub = ?").get(p.sub) as { id: number }).id;
}

/** Starts a session and returns the token to put in the visitor's cookie. */
export function createSession(userId: number): { value: string; maxAge: number } {
  const value = token(), maxAge = SESSION_DAYS * 86400;
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db().prepare("INSERT INTO sessions (hash, user_id, expires_at) VALUES (?,?,?)").run(sha(value), userId, Date.now() + maxAge * 1000);
  return { value, maxAge };
}

export async function currentUser(): Promise<User | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value) return null;
  const u = db().prepare(
    "SELECT u.id, u.email, u.name, u.picture, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires_at > ?"
  ).get(sha(value), Date.now()) as User | undefined;
  return u ?? null;
}

export async function endSession() {
  const jar = await cookies(), value = jar.get(SESSION_COOKIE)?.value;
  if (value) db().prepare("DELETE FROM sessions WHERE hash = ?").run(sha(value));
  jar.delete(SESSION_COOKIE);
}

export function keyTotals(userId: number): { requests: number; lastUsed: string | null } {
  const r = db().prepare("SELECT COALESCE(SUM(requests), 0) n, MAX(last_used_at) t FROM api_keys WHERE user_id = ?").get(userId) as { n: number; t: string | null };
  return { requests: r.n, lastUsed: r.t };
}
export function listKeys(userId: number): ApiKey[] {
  return db().prepare("SELECT id, name, prefix, created_at, last_used_at, requests FROM api_keys WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC").all(userId).map((r) => ({ ...r })) as unknown as ApiKey[]; // plain copies, so they can be handed to the page
}
/** Creates a key and returns it. This is the only time the full key exists outside the owner's hands. */
export function createKey(userId: number, name: string): string | null {
  if (listKeys(userId).length >= MAX_KEYS) return null;
  const key = "sk_" + token(30);
  db().prepare("INSERT INTO api_keys (user_id, name, prefix, hash, created_at) VALUES (?,?,?,?,?)").run(userId, name.slice(0, 60) || "My key", key.slice(0, 9), sha(key), new Date().toISOString());
  return key;
}
export function revokeKey(userId: number, id: number) {
  db().prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), id, userId);
}
export function deleteUser(userId: number) {
  for (const t of ["api_keys", "sessions"]) db().prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId);
  db().prepare("DELETE FROM users WHERE id = ?").run(userId);
}

/** Who is calling the API: `id` names the account (for request limits, so extra keys buy nothing), or is empty when the API is open and no key was sent. Null means refuse. */
export function identify(req: Request): { id: string } | null {
  const sent = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim() || req.headers.get("x-api-key") || "";
  const owner = process.env.HEXBRAIN_API_KEY;
  if (owner && sent && same(sent, owner)) return { id: "owner" };
  if (sent.startsWith("sk_")) {
    const row = db().prepare("SELECT k.id, k.user_id, u.email FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.hash = ? AND k.revoked_at IS NULL").get(sha(sent)) as { id: number; user_id: number; email: string | null } | undefined;
    if (!row || !mayUseApi(row.email)) return null; // a key stops working the moment its owner's invitation is withdrawn
    try { db().prepare("UPDATE api_keys SET requests = requests + 1, last_used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id); }
    catch { /* the database is busy (an import is running): serve the request and skip the count */ }
    // Limits follow the person, not the account row, so deleting an account and signing in again does not reset them.
    return { id: "acct:" + (row.email || "user" + row.user_id).toLowerCase() };
  }
  return keysRequired() ? null : { id: "" };
}
export const NO_KEY = `This API needs a key. Sign in at ${SITE.url}/account to create one, then send it as 'Authorization: Bearer <key>'.`;
