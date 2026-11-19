# COSMICLABS Make.fun Command Center

A local-first command center for discovering make.fun competitions, inspecting official requirements, handing a bounty to MUSE BOUNTY AGENT, and tracking execution evidence, submissions and rewards.

## Install and run

This project uses Bun for dependency management and Node.js for the Express server and its native SQLite driver. The refactor was verified on Windows with Bun 1.4.2 and Node.js 24.22.1.

~~~sh
git clone https://github.com/yusufwardana/makefun.md.git
cd makefun.md
bun install --frozen-lockfile
bun run dev
~~~

Open [the local dashboard](http://127.0.0.1:3000). The server binds to loopback by default. Copy .env.example to .env if you need custom settings. Set COMMAND_CENTER_TOKEN to protect API mutations and Muse downloads. Enter the token in Settings for the current browser session. For remote hosting, put the whole app behind an authenticated reverse proxy since dashboard read endpoints follow the existing local access model.

~~~powershell
bun run lint
bun run build
bun x --no-install tsx --test 'tests/*.test.ts'
~~~

For production, build first and run bun run start with NODE_ENV=production. The server serves the compiled dashboard.

## From bounty discovery to reward tracking

1. Sync from **Bounty Explorer**. Search, compare, or watchlist competitions. Open a bounty's details to inspect its prerequisites and leaderboard gap.
2. Select **Inspect requirements & export** for the official prompt, rules, deliverables, judging, payout schedule, Competition Kit manifest and public leaderboard.
3. Under **Export to Muse**, download JSON or Markdown. Copy the bootstrap instructions to use with the package.
4. Open your existing **MUSE BOUNTY AGENT** workspace and provide the downloaded file using the workspace's attachment or file-reading workflow. Ask Muse to read it and follow the bootstrap. Muse verifies the official specification, loads its workspace instructions and Skill Registry, and explicitly reads selected SKILL.md files. Establish official session recording before implementation whenever the specification requires it.
5. Review the current run's evidence in **Evidence Monitor**. The nine local transcript checks are preliminary. Official validation happens at make.fun. Use **Submissions** and **Rewards Analytics** to track receipts and distinguish announced, awarded and received amounts.

This integration uses manual file handoff. The app reads public make.fun endpoints through GET requests and does not execute a bounty, register an entry, submit, or transact. It does not require an LLM account.

## Source freshness

| Indicator | Meaning |
| --- | --- |
| LIVE | The official detail snapshot includes a verbatim prompt and matching requirements and is at most six hours old. |
| STALE | The official detail snapshot includes the prompt and matching requirements but is older than six hours. |
| OFFLINE | The most recent sync marked the bounty offline. Any cached official data remains available. |
| UNVERIFIED | The details, prompt, matching requirements, or valid timestamp are incomplete. |

The intelligence view shows the source and cached snapshot timestamp separately from the bounty record's last sync. A fresh core snapshot can still lack a kit manifest or leaderboard. Missing values are listed so Muse can verify them on the official page. The existing prerequisite checker and tracked-account leaderboard comparison remain available in Explorer.

## Muse package contract

- [JSON Schema v1.0.0](docs/muse-execution-package.schema.json) and [synthetic JSON example](docs/muse-execution-package.example.json)
- [MUSE_BOUNTY_CONTEXT.md example and bootstrap](docs/MUSE_BOUNTY_CONTEXT.md)

Each JSON export is validated on the server against the schema. It includes selected fields from the public competition, requirements, kit and leaderboard snapshots. The official prompt is the original description string, including whitespace. Null means the field was unavailable. An empty list means a list was present with no usable entries. Manual prompt overrides, operator notes, prior analyses, evidence, credentials and private settings stay outside the package. Official check applicability is true, false or null when unspecified. Review unavailable or unclear requirements in Muse before execution.

createdAt is the official snapshot fetch time and is null for a package without a trusted snapshot. The snapshot ID hashes the matching raw official source objects and the competition source URL. The package ID and content checksum hash the exported context, source URLs and missing-field labels. Both hashes use compact UTF-8 JSON with recursively sorted object keys and original array order, using JavaScript number and string serialization. The package hash excludes timestamps and freshness status. Its input contains the top-level fields from bounty through submissionRequirements, the four URL fields from sourceProvenance at the top level and missingInformation. The checksum can verify package content. Official acceptance is verified by make.fun.

The read-only download endpoint is GET /api/bounties/:slug/muse-export with format=json or format=markdown. An optional checksum from the inspected detail returns HTTP 409 if the selected content changed before download. The endpoint reads the local SQLite snapshot and serves fixed attachment filenames. Refresh in the UI to fetch a newer source. Source links are constrained to the official make.fun origin, and exported text is rendered as data. Markdown fences keep external markup inert when rendered.

## SQLite data

The default database is data/cosmiclabs.db. Use COSMICLABS_DB_PATH to select an existing database or a separate test file. The app preserves the existing SQLite schema and archives ai_analyses, prompt_drafts, prompt_versions, legacy prompt overrides and prior provider settings in place. Evidence keeps the historical hermes_evidence table name. Existing .env files are preserved. Legacy provider settings and secrets are no longer loaded by an enhancement workflow.

Evidence scanning only reads permitted directories inside the resolved workspace. Confirm that any imported file belongs to the current bounty and session before using it. Read-only local checks cannot establish official provenance or verify acceptance.

[Audit, file-by-file changes and QA](docs/REFRACTOR_QA.md)
