# HexBrain

https://hexbrainai.com

Every disclosed bug, mapped to how it was found: an interactive map of publicly disclosed HackerOne reports, grouped by vulnerability class, weakness and program, with each write-up in full. It also serves the same data to AI assistants.

## Run it

Needs Node 22.5 or newer (it uses Node's built-in SQLite) and pnpm.

```bash
pnpm install
pnpm ingest:import          # load the public report list (about 15,000 reports, a few seconds)
pnpm dev --port 3210        # http://localhost:3210
```

All data lives in one SQLite file, `data/hexbrain.db`.

## Data

| Command | What it does |
| --- | --- |
| `pnpm ingest:import` | Report list from the open hackerone-reports dataset. No token needed. |
| `pnpm ingest:details --max 20000` | Full write-ups from each report's public HackerOne page. Resumable, about 50 a minute. |
| `pnpm ingest:index` | Builds the bypass library from the stored write-ups: passages, the protections each report got past, and links to earlier reports. |
| `pnpm ingest:payloads` | Imports the PayloadsAllTheThings reference collection (MIT licence, credited in `THIRD_PARTY.md`). |
| `pnpm ingest:cves` | Imports CVE checks (nuclei-templates), the exploited-in-the-wild list (CISA KEV) and likelihood scores (EPSS). Run it daily to pick up new CVEs. |
| `pnpm ingest:cvenow` | A headline, score, product and fixed versions for every CVE, from cve.now (CC BY 4.0). The first run reads about 2,000 pages, one a second, and can be stopped and resumed; later runs fetch only what is new. |
| `pnpm ingest:subdomains` | Subdomains of each program from the Chaos public dataset, kept as one compressed file per program in `data/subdomains`. Run it weekly. |
| `pnpm ingest:logos` | Program logos into `public/logos`. |
| `pnpm ingest:refresh` | All of the above, in order. Run it on a schedule (for example nightly) to pick up new disclosures. |
| `pnpm ingest:status` | Counts of what is stored. |

A report whose write-up is not stored yet is fetched from HackerOne the first time someone opens it.
`pnpm ingest:list` reads the list from the official HackerOne API instead and needs `H1_API_USERNAME` and `H1_API_TOKEN`.

## Connect an AI assistant

Two doors onto the same eleven read-only tools:

| Tool | What it answers |
| --- | --- |
| `hexbrain_list_classes` | Which vulnerability classes and weaknesses exist, with counts |
| `hexbrain_search_reports` | Full-text search by words, class or weakness, program, severity, bounty and status (valid, informative, N/A, duplicate) |
| `hexbrain_get_report` | One report in full, write-up included |
| `hexbrain_plan_tests` | Describe a feature and get the bug classes real reports found in features like it, with examples |
| `hexbrain_get_attack_surface` | The subdomains known for a program: domains, counts and host names, filtered by domain or text |
| `hexbrain_find_cves` | Known CVEs for the technologies a target runs: exploited or not, likelihood, version fit, and the request that confirms each |
| `hexbrain_get_cve` | One CVE in full, with its detection check |
| `hexbrain_find_bypasses` | How researchers got past a protection (WAF, filter, CSP, 2FA, an earlier fix), with matching passages and payloads |
| `hexbrain_find_payloads` | Payloads and techniques for 60+ bug classes from PayloadsAllTheThings, including filter-bypass variants |
| `hexbrain_get_testing_playbook` | How a bug class has been found before: top reports with steps, requests and common chains |
| `hexbrain_get_program_history` | What has been reported on a program, what it paid, and what is rarely reported there |

**MCP** (Claude, ChatGPT and other MCP clients): Streamable HTTP at `/api/mcp`.

```bash
claude mcp add --transport http hexbrain https://hexbrainai.com/api/mcp --header "Authorization: Bearer <your key>"
```

Keys are created on `/account`. Against a copy running on your own machine, use `http://localhost:3210/api/mcp`; no key is needed there until sign-in is set up.

**REST** (GPT Actions and anything that calls HTTP): `GET` or `POST /api/v1/<tool without the hexbrain_ prefix>`, described by `/api/v1/openapi.json`.

Hosted assistants (claude.ai, ChatGPT) can only reach a public HTTPS address; a local assistant such as Claude Code can use `localhost`.

## Put it online

The app needs a server with a disk, because the data is a file. A small VPS or any container host with a volume works; serverless hosts do not.

```bash
docker build -t hexbrain .
docker run -d -p 3000:3000 -v hexbrain-data:/app/data \
  -e GOOGLE_CLIENT_ID=... -e GOOGLE_CLIENT_SECRET=... hexbrain
```

Without Docker, on a plain server: `deploy/` holds the systemd service and Caddy configuration used on the live site (Cloudflare in front, Caddy for HTTPS, the app on port 3000 on the loopback address only), and `deploy/deploy.sh` sends new code to the server, builds it and restarts the app.

`deploy/hexbrain-refresh.service` and `.timer` run the data refresh every night at 03:30 UTC, after saving a copy of the database to `/opt/hexbrain/backups` (the last seven are kept). See what the last run did with `journalctl -u hexbrain-refresh -n 80`.

Put HTTPS in front of it (Caddy, nginx or your host's proxy), and make sure the proxy passes the visitor's address in `X-Forwarded-For`, which the request limits use.

| Variable | Purpose |
| --- | --- |
| `HEXBRAIN_PUBLIC_URL` | Public address, used in search previews, the sitemap and the AI connection details. Defaults to `https://hexbrainai.com` in production; set it before building to use another. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Turn on Google sign-in. Once set, the AI endpoints need a key that people create on `/account`. |
| `HEXBRAIN_OPEN_API` | Set to `true` to leave the AI endpoints open even with sign-in on |
| `HEXBRAIN_API_KEY` | An owner key that always works on the AI endpoints |
| `HEXBRAIN_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call `/api/mcp` |
| `HEXBRAIN_PROXY_HOPS` | How many proxies sit in front of the app (default 1); used to read the visitor's real address for request limits |
| `HEXBRAIN_CLIENT_IP_HEADER` | A header in which the host passes the visitor's address, if it has one visitors cannot forge |
| `HEXBRAIN_DB` | Path to the SQLite file, if not `data/hexbrain.db` |

Built in: security headers, no remote images in write-ups, request limits (per visitor: 240 pages and 600 map requests a minute; AI endpoints: 90 a minute and 5,000 a day per account, 240 a minute per address, 64 KB per request, 10 messages per MCP batch), a sitemap, `robots.txt`, and share previews.

## Accounts and API keys

People sign in with Google on `/account`, see their profile, and create up to five API keys. Keys are shown once and stored only as hashes. Limits count per account, not per key (90 requests a minute, 5,000 a day), and the account page shows when each was last used.

To turn it on, create an OAuth client ID (type "Web application") in the [Google Cloud console](https://console.cloud.google.com/apis/credentials), add `<your address>/auth/google/callback` as an authorised redirect address, and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `HEXBRAIN_PUBLIC_URL`.

Connect AI appears only for people who are signed in.

To open the API to chosen people only, set `HEXBRAIN_INVITE_ONLY=true` and list your own address in `HEXBRAIN_ADMINS`. Anyone can still sign in, but only invited email addresses can create and use keys; admins manage the list on `/account`, or with `pnpm access invite <email>`, `pnpm access remove <email>` and `pnpm access list`. Removing an invitation stops that person's keys at once.

`pnpm test:auth` checks sign-in, accounts and keys end to end, apart from the visit to Google itself.

## Code

| Path | What is there |
| --- | --- |
| `src/components/map/layout.ts` | Geometry of every dial: vulnerabilities, CVEs, the Programs index and a dial per letter |
| `src/components/map/renderer.ts` | Drawing, labels, signals and pointer handling |
| `src/components/MapView.tsx` | The page around the map: panel, search, Connect AI |
| `src/components/Sheet.tsx` | The shell every text page sits on: header, corner marks, dial, footer |
| `src/components/Surface.tsx`, `src/lib/subdomains.ts` | A program's subdomains: the dial on its page, the list and the downloads |
| `src/components/Bars.tsx` | The marks the text pages share with the map: strips of lines, severity pips, meters |
| `src/app/plain.module.css` | Styles for the content of the text pages |
| `src/lib/db.ts` | Database access and the map data |
| `src/lib/ai.ts` | The eleven AI tools, shared by MCP and REST |
| `src/lib/auth.ts` | Accounts, sessions and API keys |
| `src/lib/guard.ts`, `src/lib/rate.ts` | Who may call the AI endpoints, how often and how large a request may be |
| `src/components/Find.tsx` | Search |
| `src/lib/taxonomy.ts` | How HackerOne weaknesses group into classes |
| `src/lib/site.ts` | Name, wording, address and the logo mark |
| `scripts/ingest.mjs` | Data import |
| `tests/e2e.mjs` | `pnpm test:e2e`, with the app running: drives a real browser through every feature |

## Note

HexBrain is an independent project, not affiliated with HackerOne. Reports belong to their authors and the programs that disclosed them.
