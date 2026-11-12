# HexBrain

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
| `pnpm ingest:logos` | Program logos into `public/logos`. |
| `pnpm ingest:refresh` | All three, in order. Run it on a schedule (for example nightly) to pick up new disclosures. |
| `pnpm ingest:status` | Counts of what is stored. |

A report whose write-up is not stored yet is fetched from HackerOne the first time someone opens it.
`pnpm ingest:list` reads the list from the official HackerOne API instead and needs `H1_API_USERNAME` and `H1_API_TOKEN`.

## Connect an AI assistant

Two doors onto the same five read-only tools:

| Tool | What it answers |
| --- | --- |
| `hexbrain_list_classes` | Which vulnerability classes and weaknesses exist, with counts |
| `hexbrain_search_reports` | Full-text search by words, class or weakness, program, severity, bounty |
| `hexbrain_get_report` | One report in full, write-up included |
| `hexbrain_get_testing_playbook` | How a bug class has been found before: top reports with steps, requests and common chains |
| `hexbrain_get_program_history` | What has been reported on a program, what it paid, and what is rarely reported there |

**MCP** (Claude, ChatGPT and other MCP clients): Streamable HTTP at `/api/mcp`.

```bash
claude mcp add --transport http hexbrain http://localhost:3210/api/mcp
```

**REST** (GPT Actions and anything that calls HTTP): `GET` or `POST /api/v1/<tool without the hexbrain_ prefix>`, described by `/api/v1/openapi.json`.

Hosted assistants (claude.ai, ChatGPT) can only reach a public HTTPS address; a local assistant such as Claude Code can use `localhost`.

## Put it online

The app needs a server with a disk, because the data is a file. A small VPS or any container host with a volume works; serverless hosts do not.

```bash
docker build -t hexbrain .
docker run -d -p 3000:3000 -v hexbrain-data:/app/data \
  -e HEXBRAIN_PUBLIC_URL=https://your.domain hexbrain
```

Put HTTPS in front of it (Caddy, nginx or your host's proxy), and make sure the proxy passes the visitor's address in `X-Forwarded-For`, which the request limits use.

| Variable | Purpose |
| --- | --- |
| `HEXBRAIN_PUBLIC_URL` | Public address, used in search previews, the sitemap and the AI connection details. Set it before building. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Turn on Google sign-in. Once set, the AI endpoints need a key that people create on `/account`. |
| `HEXBRAIN_OPEN_API` | Set to `true` to leave the AI endpoints open even with sign-in on |
| `HEXBRAIN_API_KEY` | An owner key that always works on the AI endpoints |
| `HEXBRAIN_ALLOWED_ORIGINS` | Comma-separated browser origins allowed to call `/api/mcp` |
| `HEXBRAIN_DB` | Path to the SQLite file, if not `data/hexbrain.db` |

Built in: security headers, no remote images in write-ups, a request limit per visitor (600 a minute for the site, 90 a minute for the AI endpoints), a sitemap, `robots.txt`, and share previews.

## Accounts and API keys

People sign in with Google on `/account`, see their profile, and create up to five API keys. Keys are shown once and stored only as hashes. Each key may make 90 requests a minute, and the account page shows when each was last used.

To turn it on, create an OAuth client ID (type "Web application") in the [Google Cloud console](https://console.cloud.google.com/apis/credentials), add `<your address>/auth/google/callback` as an authorised redirect address, and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `HEXBRAIN_PUBLIC_URL`.

Sign-in shows "coming soon" until you also set `HEXBRAIN_SIGNIN=on`. Connect AI appears only for people who are signed in.

`pnpm test:auth` checks sign-in, accounts and keys end to end, apart from the visit to Google itself.

## Code

| Path | What is there |
| --- | --- |
| `src/components/map/layout.ts` | Geometry of both dials |
| `src/components/map/renderer.ts` | Drawing, labels, signals and pointer handling |
| `src/components/MapView.tsx` | The page around the map: panel, search, Connect AI |
| `src/lib/db.ts` | Database access and the map data |
| `src/lib/ai.ts` | The five AI tools, shared by MCP and REST |
| `src/lib/auth.ts` | Accounts, sessions and API keys |
| `src/components/Find.tsx` | Search |
| `src/lib/taxonomy.ts` | How HackerOne weaknesses group into classes |
| `src/lib/site.ts` | Name, wording, address and the logo mark |
| `scripts/ingest.mjs` | Data import |
| `tests/e2e.mjs` | `pnpm test:e2e`, with the app running: drives a real browser through every feature |

## Note

HexBrain is an independent project, not affiliated with HackerOne. Reports belong to their authors and the programs that disclosed them.
