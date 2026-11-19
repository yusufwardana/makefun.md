# COSMICLABS Make.fun Command Center

[Bahasa Indonesia](README.md) · **English**

Use the local dashboard to find make.fun bounties and check their official requirements. Export the bounty context to MUSE BOUNTY AGENT, then use the dashboard to track execution evidence, submissions, and rewards.

## <img src="docs/icons/install.svg" alt="" width="20" height="20"> Install and run

Bun manages dependencies. The Express server and native SQLite driver run on Node.js. The app was tested on Windows with Bun 1.4.2 and Node.js 24.22.1.

~~~sh
git clone https://github.com/yusufwardana/makefun.md.git
cd makefun.md
bun install --frozen-lockfile
bun run dev
~~~

Open [the local dashboard](http://127.0.0.1:3000). By default, the server accepts connections only from the same machine. Copy `.env.example` to `.env` to change the configuration.

Set `COMMAND_CENTER_TOKEN` to protect API writes and Muse downloads. Enter the token in **Settings** for the current browser session. If you access the dashboard from another machine, put the entire app behind an authenticated reverse proxy, including read access.

~~~powershell
bun run lint
bun run build
bun x --no-install tsx --test 'tests/*.test.ts'
~~~

For production, build the dashboard and run `bun run start` with `NODE_ENV=production`. Express serves the compiled dashboard.

## <img src="docs/icons/workspace.svg" alt="" width="20" height="20"> Set up MUSE BOUNTY AGENT in Muse.ai Cloud

Download the [Phase 1 workspace ZIP](docs/muse-bounty-agent.zip) for the workspace instructions, setup and start prompts, eight starter skills, and an offline workspace checker.

1. For a new workspace, open **MUSE BOUNTY AGENT** in Muse.ai Cloud and attach the ZIP. Ask Muse to follow `MUSE_APP_SETUP_PROMPT.md` inside the archive, then report the workspace path and the files it can read.
2. If you already have a workspace, open it and follow its `AGENTS.md` and `MUSE_START_PROMPT.md`. Use the files and Skill Registry already there.
3. For a Phase 2 workspace, check the registry for `react-best-practices`, `build-wiring-readback-audit`, `verify-summaries`, and `design-system-audit`. Ask Muse to open each relevant `SKILL.md` and name the files it actually read during the session.

## <img src="docs/icons/handoff.svg" alt="" width="20" height="20"> Hand off a bounty

1. Sync from **Bounty Explorer**. Search, compare, or watchlist competitions. Open a bounty's details to inspect its prerequisites and leaderboard gap.
2. Select **Inspect requirements & export** for the official prompt, rules, deliverables, judging, payout schedule, Competition Kit manifest and public leaderboard.
3. Under **Export to Muse**, download JSON or Markdown and copy the bootstrap instructions. Attach the package in **MUSE BOUNTY AGENT** or ask Muse to read it from the workspace. Ask Muse to follow the bootstrap, use its workspace instructions and Skill Registry, and check the package against the official requirements.

For a handoff test, ask Muse to report package validation, which skills it loaded, missing information, and readiness. Get separate approval before building or submitting. Set up official session recording before implementation if the bounty requires it.

Use **Evidence Monitor** to review the current session's evidence. The dashboard runs nine preliminary transcript checks. make.fun handles official validation. Track receipts in **Submissions** and see announced, awarded, and received amounts in **Rewards Analytics**.

The dashboard reads public make.fun endpoints through GET requests. Builds, registrations, submissions, and transactions take place outside the dashboard. You can run Command Center without an LLM account.

## <img src="docs/icons/freshness.svg" alt="" width="20" height="20"> Source freshness

| Indicator | Meaning |
| --- | --- |
| LIVE | The official detail snapshot includes a verbatim prompt and matching requirements and is at most six hours old. |
| STALE | The official detail snapshot includes the prompt and matching requirements but is older than six hours. |
| OFFLINE | The most recent sync marked the bounty offline. Any cached official data remains available. |
| UNVERIFIED | The details, prompt, matching requirements, or valid timestamp are incomplete. |

Bounty Intelligence shows the source, when the snapshot was fetched, and when the bounty record last synced. A recent snapshot may still lack a kit manifest or leaderboard. The dashboard lists missing data for Muse to check on the official page. Use Explorer to check prerequisites or compare the tracked account with the leaderboard.

## <img src="docs/icons/package-schema.svg" alt="" width="20" height="20"> Muse package contract

- [JSON Schema v1.0.0](docs/muse-execution-package.schema.json) and [synthetic JSON example](docs/muse-execution-package.example.json)
- [MUSE_BOUNTY_CONTEXT.md example and bootstrap](docs/MUSE_BOUNTY_CONTEXT.md)

The server validates each JSON export against the schema. The package includes selected fields from public competition, requirements, kit, and leaderboard snapshots. The server copies the official description as the prompt, including whitespace. Manual prompt overrides, operator notes, prior analyses, evidence, credentials, and private settings stay outside the package.

`null` means the value was unavailable. An empty list means the source supplied a list with no usable entries. For official checks, `true` means the check applies, `false` means it does not apply, and `null` means the source did not say. Review missing or unclear requirements in Muse before execution.

`createdAt` records when the app fetched the official snapshot. It is `null` when the package has no trusted snapshot. The server computes the snapshot ID from the matching raw official source objects and the competition source URL.

The package ID and content checksum use the same hash. Its input includes the top-level fields from `bounty` through `submissionRequirements`, the four URL fields from `sourceProvenance` copied to the top level, and `missingInformation`. Timestamps and freshness status are outside the package hash. For both hashes, the server uses compact UTF-8 JSON, sorts object keys recursively, keeps arrays in their original order, and serializes numbers and strings as JavaScript does. Use the checksum to verify the package content. make.fun verifies official acceptance.

Download the package with `GET /api/bounties/:slug/muse-export` and `format=json` or `format=markdown`. The endpoint only reads the local SQLite snapshot and returns an attachment with a fixed filename. If you pass the optional checksum from the detail view and the content has changed, the server returns HTTP 409. Use refresh in the UI to fetch a newer source.

The server limits source links to the official make.fun origin. Code fences in the Markdown export keep external markup as plain text.

## <img src="docs/icons/database.svg" alt="" width="20" height="20"> SQLite data

The default database is `data/cosmiclabs.db`. Set `COSMICLABS_DB_PATH` to use an existing database or a separate test file. The app keeps the existing SQLite schema and preserves the archived `ai_analyses`, `prompt_drafts`, `prompt_versions`, legacy prompt overrides, and prior provider settings in place. Evidence still uses the `hermes_evidence` table.

The app keeps existing `.env` files. It no longer loads the settings and secrets from the retired enhancement workflow.

Evidence scanning only reads permitted directories inside the resolved workspace. Confirm that any imported file belongs to the current bounty and session before using it. Read-only local checks cannot establish official provenance or verify acceptance.

[Audit, file-by-file changes and QA](docs/REFRACTOR_QA.md)
