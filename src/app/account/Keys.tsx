"use client";

import { useActionState, useState } from "react";
import type { ApiKey } from "@/lib/auth";
import { createKeyAction, deleteAccountAction, revokeKeyAction, type KeyState } from "./actions";
import s from "./account.module.css";

const day = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never");

export default function Keys({ keys, max, site }: { keys: ApiKey[]; max: number; site: string }) {
  const [state, create, busy] = useActionState<KeyState, FormData>(createKeyAction, {});
  const [copied, setCopied] = useState("");
  const copy = (label: string, value: string) => navigator.clipboard?.writeText(value).then(() => { setCopied(label); setTimeout(() => setCopied(""), 1600); }).catch(() => {});
  const shown = state.key ?? "YOUR_KEY";
  const uses: [string, string][] = [
    ["Claude Code", `claude mcp add --scope user --transport http hexbrain ${site}/api/mcp --header "Authorization: Bearer ${shown}"`],
    ["ChatGPT and other MCP clients: add this server, with the header Authorization: Bearer " + (state.key ? "your key" : "YOUR_KEY"), `${site}/api/mcp`],
    ["Any HTTP client", `curl -H "Authorization: Bearer ${shown}" "${site}/api/v1/get_testing_playbook?topic=ssrf"`],
  ];
  return (
    <>
      <section className={s.block}>
        <h2>API keys</h2>
        {state.key && (
          <div className={s.fresh} role="status">
            <p><b>{state.name}</b> is ready. Copy it now: it is shown only this once.</p>
            <div className={s.copyRow}><code id="new-key">{state.key}</code><button onClick={() => copy("key", state.key!)}>{copied === "key" ? "Copied" : "Copy key"}</button></div>
          </div>
        )}
        {keys.length === 0 && !state.key && <p className={s.dim}>You have no keys yet. Create one to use {"the API"} from Claude, ChatGPT or your own scripts.</p>}
        {keys.map((k) => (
          <form key={k.id} action={revokeKeyAction} className={s.keyRow}>
            <input type="hidden" name="id" value={k.id} />
            <div>
              <b>{k.name}</b>
              <small><code>{k.prefix}…</code> · created {day(k.created_at)} · last used {day(k.last_used_at)} · {k.requests.toLocaleString("en-US")} requests</small>
            </div>
            <button>Revoke</button>
          </form>
        ))}
        {keys.length < max ? (
          <form action={create} className={s.create}>
            <input name="name" placeholder="Name this key, for example: laptop" maxLength={60} aria-label="Name for the new key" />
            <button disabled={busy}>{busy ? "Creating…" : "Create API key"}</button>
          </form>
        ) : <p className={s.dim}>You have {max} keys, the most one account can hold. Revoke one to create another.</p>}
        {state.error && <p className={s.error} role="alert">{state.error}</p>}
      </section>

      <section className={s.block}>
        <h2>Connect your AI</h2>
        {!state.key && <p className={s.dim}>Put your key in place of YOUR_KEY. Create a new key to have these filled in for you.</p>}
        {uses.map(([label, value]) => (
          <div key={label} className={s.use}>
            <span>{label}</span>
            <div className={s.copyRow}><code>{value}</code><button onClick={() => copy(label, value)}>{copied === label ? "Copied" : "Copy"}</button></div>
          </div>
        ))}
        <p className={s.dim}>Then ask your assistant things like “use hexbrain to show how SSRF has been found on GitLab”. Each key may make 90 requests a minute.</p>
      </section>
    </>
  );
}

/** Deleting asks once more before it happens. */
export function DeleteAccount() {
  const [sure, setSure] = useState(false);
  return sure ? (
    <form action={deleteAccountAction} className={s.confirm}>
      <button className={s.danger}>Yes, delete everything</button>
      <button type="button" onClick={() => setSure(false)}>Keep my account</button>
    </form>
  ) : <button className={s.quiet} onClick={() => setSure(true)}>Delete my account and keys</button>;
}
