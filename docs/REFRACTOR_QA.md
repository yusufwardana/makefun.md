# Make.fun Command Center refactor and QA

## Architecture

The Command Center owns discovery, read-only inspection, local monitoring and handoff. Existing MUSE BOUNTY AGENT workspace instructions and its Skill Registry own analysis and implementation. The handoff endpoint validates the bounty slug and download options, projects selected fields from the stored official snapshot, validates the v1 package and serves a fixed attachment. Competition Kit contents are inspected through the official manifest. The app has no agent execution or submission route.

## Audit and baseline

The clone started at 10afe9a on the repository's default branch. The audit traced server entry points, the LLM workflow, SQLite schema and CRUD, sync and transcript checks, shared types and the Explorer, Studio, Library and Settings consumers.

The enhancer route, LLM connectivity test, Gemini SDK, OpenAI-compatible HTTP client, research fallback, Master Prompt builder, generated-skill controls and prompt version writers formed the retired feature. Sync, official raw snapshots, prerequisite inspection, leaderboard analysis, watchlisting and notes, evidence import and local validation, submissions and rewards use separate paths.

The original checkout passed the frozen Bun install, typecheck, Vite build and all 14 existing tests before implementation. The Muse generator then passed four contract tests before enhancer removal. Those covered the schema and sample, deterministic IDs, prompt fidelity, status, Markdown sections, bootstrap and private-data exclusion.

## Removed

The Prompt Studio, Prompt Library, enhancement, prompt history and manual prompt editing routes, AI-only settings and SDK, and legacy prompt write and display code were removed. The manual override column stays in SQLite. Existing overrides are archived and the export uses the official raw description.

## Preserved

Explorer search, status and category filters, comparison, pagination and watchlist remain. The dashboard shows open competitions, watchlist, evidence, submissions and received rewards. Requirements, kit manifests and leaderboard information are available in the intelligence view. The existing prerequisite checker and tracked-account leaderboard gap remain in Explorer. Evidence, submissions and rewards continue to use the original database tables.

The existing SQLite DDL, incremental migrations, archived prompts, analyses, submissions, rewards, evidence and configuration are preserved. Evidence scanning resolves the real workspace path. The transcript pre-check retains its nine local checks and rejects evidence already assigned to a different bounty.

## Added

JSON and Markdown downloads plus copyable Muse bootstrap instructions. The JSON contract includes provenance, a stable snapshot ID, SHA-256 package checksum, and explicit missing fields. The export can require the checksum from the view to prevent a download after content changes. Muse intake follows the operator-provided manual file workflow.

## File-by-file changes

| File | Change |
| --- | --- |
| .env.example | Keeps server binding, database and operator settings. |
| README.md | Documents setup, the monitoring workflow, package contract and legacy data. |
| package.json | Removes the Gemini SDK. |
| bun.lock | Removes unused SDK dependencies. |
| index.html | Updates dashboard metadata. |
| metadata.json | Updates the project description and removes the Gemini capability. |
| vite.config.ts | Replaces the deprecated config use of __dirname. |
| server.ts | Serves intelligence, authenticated downloads and the retained APIs. Removes enhancer routes and improves evidence scan boundaries. |
| server/muse-handoff.ts | Projects and validates public snapshot fields, generates identifiers, and formats Markdown. |
| server/crud.ts | Removes enhancer writers and overview queries. Keeps bounty, snapshot and operational CRUD. |
| server/db.ts | Removes obsolete model/configuration defaults and mapping code. Keeps schema initialization and migrations. |
| server/schema.ts | Existing table and relation definitions retained as-is. |
| server/makefun.ts | Restricts outbound sync to GET with redirects rejected. Includes kit and leaderboard in snapshot change detection. |
| server/security.ts | Retains operator auth, CSRF and rate limiting. Replaces the retired provider URL policy with the evidence workspace containment helper. |
| server/transcript-gate.ts | Recognizes Muse in the existing plain-text fallback and updates monitor naming. |
| server/llm.ts | Removed the enhancer-only workflow and provider clients. |
| src/App.tsx | Installs intelligence and evidence navigation with shortcuts into submission and reward tracking. |
| src/components/ui/primitives.tsx | Allows a panel to receive focus and name its detail region. |
| src/components/views/OverviewView.tsx | Replaces prompt metrics with watchlist context and bounty inspection. |
| src/components/views/BountyExplorerView.tsx | Adds keyboard access to details, updates inspection links and displays the verbatim prompt and official payouts. |
| src/components/views/BountyIntelligenceView.tsx | Adds source inspection, export, bootstrap copying and bounty notes. |
| src/components/views/EvidenceMonitorView.tsx | Renames HermesMonitorView, keeps legacy evidence access and accepts the selected handoff bounty. |
| src/components/views/SettingsView.tsx | Keeps tracked handle, evidence paths and operator session token. |
| src/components/views/SubmissionsView.tsx | Links submission tracking to the rewards view. |
| src/components/views/PromptStudioView.tsx | Removed the enhancer interface. |
| src/components/views/PromptLibraryView.tsx | Removed the enhancer-only version library. |
| src/lib/prompt-builder.ts | Removed Master Prompt and skill directive assembly. |
| src/lib/utils.ts | Removes prompt diff and legacy download helpers. |
| src/lib/muse-bootstrap.ts | Shares the manual handoff instructions across Markdown and the browser. |
| src/types/command-center.ts | Removes enhancer-only types and retains evidence and business types. |
| src/types/muse-package.ts | Defines the strict package contract and identifier validation. |
| tests/command-center.test.ts | Retains official content, leaderboard and transcript tests. Removes tests for deleted prompt generation. |
| tests/crud.test.ts | Retains operational and snapshot CRUD regression coverage. |
| tests/security.test.ts | Checks workspace containment. |
| tests/http.test.ts | Exercises auth, CSRF, removed routes, downloads and legacy SQLite records through HTTP. |
| tests/makefun-sync.test.ts | Exercises official sync, cache fallback and kit-only refresh using controlled upstream responses. |
| tests/muse-handoff.test.ts | Verifies package fidelity, validation, privacy, status and generated example consistency. |
| docs/muse-execution-package.schema.json | Generated JSON Schema Draft 2020-12. |
| docs/muse-execution-package.example.json | Synthetic package for inspection and validation. |
| docs/MUSE_BOUNTY_CONTEXT.md | Synthetic Markdown example with bootstrap. |
| docs/REFRACTOR_QA.md | Audit, changes, validation and known limits. |

## Validation

| Check | Result |
| --- | --- |
| bun install --frozen-lockfile | Passed against the original and updated locks. |
| bun run lint | Passed before and after implementation. |
| bun run build | Passed before and after implementation. Vite emits a large-chunk advisory. |
| bun x --no-install tsx --test 'tests/*.test.ts' | 14 tests passed on the baseline and 14 tests passed after the refactor, including the replacement regression tests. |
| Live official sync | The in-memory QA server synced 60 competitions, with 14 returned by the open feed and a next cursor. For github-core-clone-01 the app preserved the official description and captured 8 deliverables, 10 judging criteria, 15 recording-related checks and 63 manifest entries. [Official competition](https://make.fun/bounty/github-core-clone-01) |
| Existing SQLite data | A file-backed test opened a seeded database and confirmed archived rows, stored credential, evidence, submissions and rewards survived startup and exports. SQLite integrity_check returned ok. |
| Browser layout and navigation | Checked the intelligence view at 320, 390, 768 and 1440 CSS pixels. Document width matched viewport width at all four sizes and export buttons stayed within it. Opened the details from mobile Explorer and verified focus moved into the detail panel. Followed links through Evidence Monitor, Submissions and Rewards. |
| Browser downloads and clipboard | Chrome completed both downloads after normal button clicks. Reopened the downloaded JSON and Markdown, confirmed schema version 1.0.0 and the live bounty slug, and checked the Markdown bootstrap. The clipboard action reported success. The Agent Browser download-to-path helper failed on Windows, so browser download completion and files were verified directly with Chrome DevTools. |

## Limitations

Muse Cloud intake was not exercised in the operator's workspace. The JSON schema and Markdown contract were verified locally. Direct Muse integration was not implemented. The Competition Kit inspector lists manifest files when the upstream service returns them. Scheduled sync was not implemented in the baseline, so the UI exposes manual sync and refresh. Existing interval values remain stored. No production database was present in the fresh clone.

## Final status

PARTIAL. The local implementation, live make.fun discovery and handoff files passed verification. Opening a package in the operator's Muse Cloud workspace remains unverified.
