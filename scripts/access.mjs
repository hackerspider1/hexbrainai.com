// Manages who may use the API when HEXBRAIN_INVITE_ONLY is on.
//   node scripts/access.mjs list
//   node scripts/access.mjs invite someone@example.com [more@example.com ...]
//   node scripts/access.mjs remove someone@example.com
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(process.env.HEXBRAIN_DB || join(root, "data", "hexbrain.db"));
db.exec("PRAGMA busy_timeout = 4000;");
db.exec(readFileSync(join(root, "db", "schema.sql"), "utf8"));
const [cmd, ...rest] = process.argv.slice(2), emails = rest.map((e) => e.trim().toLowerCase()).filter(Boolean);

if (cmd === "invite" && emails.length) {
  for (const e of emails) {
    if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e)) { console.log(`skipped (not an email address): ${e}`); continue; }
    db.prepare("INSERT OR IGNORE INTO invites (email, added_by, created_at) VALUES (?,?,?)").run(e, "command line", new Date().toISOString());
    console.log(`invited: ${e}`);
  }
} else if (cmd === "remove" && emails.length) {
  for (const e of emails) console.log(`${db.prepare("DELETE FROM invites WHERE email = ?").run(e).changes ? "removed" : "was not invited"}: ${e}`);
} else if (cmd === "list") {
  const rows = db.prepare("SELECT i.email, i.created_at, EXISTS(SELECT 1 FROM users u WHERE lower(u.email) = i.email) AS joined FROM invites i ORDER BY i.created_at").all();
  for (const r of rows) console.log(`${r.email}  invited ${r.created_at.slice(0, 10)}  ${r.joined ? "has signed in" : "not signed in yet"}`);
  console.log(`${rows.length} invited. People who have signed in: ${db.prepare("SELECT COUNT(*) n FROM users").get().n}.`);
} else {
  console.log("Usage: node scripts/access.mjs list | invite <email...> | remove <email...>");
  process.exitCode = 1;
}
