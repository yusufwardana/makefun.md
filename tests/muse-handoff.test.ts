import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { buildMusePackage, formatMuseMarkdown } from '../server/muse-handoff.ts';
import { museBootstrap } from '../src/lib/muse-bootstrap.ts';
import { musePackageSchema } from '../src/types/muse-package.ts';
import type { BountyRecord, BountySnapshot } from '../src/types/command-center.ts';

process.env.COSMICLABS_DB_PATH = ':memory:';
const { extractLeaderboardInsights } = await import('../server/makefun.ts');

const fetchedAt = '2026-11-19T10:00:00.000Z';
const now = Date.parse(fetchedAt);
const base = 'https://make.fun/api/competitions/example-only';
const prompt = '  Synthetic example. Build a test fixture.\r\n~~~\n<script>external text</script>\n\n';
const bounty: BountyRecord = {
  slug: 'example-only', id: 'example-only', title: 'Synthetic example (not an official bounty)',
  url: 'https://make.fun/bounty/example-only', category: 'Test', skills: [], rewardAmount: 0,
  potUsd: 0, entryFeeUsd: null, deadline: null, publishedAt: null, status: 'open', submissionCount: 0,
  sponsorName: null, sponsorVerified: false, summary: null, harnessKind: null,
  acceptingSubmissions: true, isDemo: true, syncState: 'LIVE', lastSyncedAt: fetchedAt,
  watchlisted: true, founderNotes: 'PRIVATE_OPERATOR_NOTES',
};
const snapshot: BountySnapshot = {
  id: 1, bountySlug: bounty.slug, sourceEndpoint: base, fetchedAt, contentHash: 'legacy',
  manualPromptOverride: 'PRIVATE_MANUAL_OVERRIDE', officialPromptText: 'LEGACY_COMPOSITE',
  rawCompetition: {
    slug: bounty.slug, title: bounty.title, url: '/bounty/example-only', status: 'open',
    description: prompt, rules: 'Fixture rule.', submissionCount: 0, potUsd: '100.00',
    internal: 'PRIVATE_COMPETITION_FIELD', chat: [{ body: 'PRIVATE_CHAT_FIELD' }],
    kit: { json: base + '/kit?token=PRIVATE_URL_TOKEN', tarball: '/c/example-only/kit', final: { json: base + '/kit?phase=final' } },
    resolution: { method: 'judges', summary: 'Fixture judging summary.', criteria: ['Fixture criterion.'] },
  },
  rawRequirements: {
    competition: { slug: bounty.slug },
    deliverables: [{ name: 'repo_url', kind: 'form_field', required: true, description: 'Public repository.', internal: 'PRIVATE_NESTED' },
      { name: 'notes', required: false }, { name: 'unknown' }],
    checks: [{ check: 'transcripts_recorded', title: 'Recording', description: 'Record this session.', applies: true },
      { check: 'thinking_fresh', applies: false }],
    prerequisites: { software: [{ name: 'Node.js', required: true }], mcp: [{ name: 'Fixture MCP', required: true }] },
    how_to_submit: { method: 'POST', href: 'https://other.test/private?token=PRIVATE_URL_TOKEN', auth: 'PRIVATE_AUTH', fields: { repo_url: 'description' } },
    deadlines: { entries_close: '2026-11-20T10:00:00Z' },
    payout_curve: { rail: 'manual', places: [{ place: 1, amount_usd: '100.00' }] },
  },
  rawKit: { phase: 'practice', files: [{ path: 'RULES.txt', size: 32, contents: 'PRIVATE_KIT_CONTENTS' }] },
  rawLeaderboard: { phase: { key: 'practice' }, entries: [{ rank: 1, handle: 'sample', title: 'Fixture entry', values: { score: 42 } }] },
};
const leaderboard = extractLeaderboardInsights(snapshot.rawLeaderboard, snapshot.rawCompetition, '@sample');

test('Muse handoff validates, uses verbatim source text and excludes private and unrelated data', () => {
  const pkg = buildMusePackage(bounty, snapshot, leaderboard, now);
  assert.deepEqual(musePackageSchema.parse(pkg), pkg);
  assert.deepEqual(buildMusePackage(bounty, snapshot, leaderboard, now), pkg);
  assert.equal(pkg.officialPrompt, prompt);
  assert.equal(pkg.bounty.submissionCount, 0);
  assert.equal(pkg.bounty.payout.places?.[0].amountUsd, '100.00');
  assert.equal(pkg.recordingRequirements?.[0].applies, true);
  assert.equal(pkg.recordingRequirements?.[1].applies, false);
  assert.deepEqual(pkg.competitionKit?.files, [{ path: 'RULES.txt', sha256: null, size: 32 }]);
  assert.equal(pkg.leaderboardContext?.leader?.metric, '42');
  assert.equal(pkg.submissionRequirements?.endpoint, null);
  assert.match(pkg.sourceProvenance.contentChecksum, /^sha256:[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(pkg), /PRIVATE_|LEGACY_COMPOSITE/);
  assert.match(pkg.competitionKit?.finalManifestUrl ?? '', /\?phase=final$/);
  assert.equal(pkg.sourceProvenance.status, 'LIVE');
  const stale = buildMusePackage(bounty, snapshot, leaderboard, now + 7 * 60 * 60 * 1000);
  assert.equal(stale.sourceProvenance.status, 'STALE');
  assert.equal(stale.sourceProvenance.snapshotId, pkg.sourceProvenance.snapshotId);
  assert.equal(stale.packageId, pkg.packageId);
  const changed = buildMusePackage(bounty, { ...snapshot, rawKit: { files: [] } }, leaderboard, now);
  assert.notEqual(changed.packageId, pkg.packageId);
});

test('missing, mismatched and offline records are distinguished', () => {
  const missing = buildMusePackage(bounty, null, null, now);
  assert.equal(missing.officialPrompt, null);
  assert.equal(missing.bounty.submissionCount, null);
  assert.equal(missing.sourceProvenance.status, 'UNVERIFIED');
  assert.ok(missing.missingInformation.includes('Verbatim official prompt'));
  assert.match(formatMuseMarkdown(missing), /Unavailable in the official snapshot/);
  const offline = buildMusePackage({ ...bounty, syncState: 'OFFLINE' }, snapshot, leaderboard, now);
  assert.equal(offline.sourceProvenance.status, 'OFFLINE');
  assert.equal(offline.officialPrompt, prompt);
  const wrong = buildMusePackage(bounty, { ...snapshot, sourceEndpoint: 'https://untrusted.test/a' }, null, now);
  assert.equal(wrong.officialPrompt, null);
  assert.equal(wrong.sourceProvenance.snapshotId, null);
  assert.throws(() => buildMusePackage({ ...bounty, slug: '../secret' }, null, null, now));
});

test('Markdown has the ordered handoff contract and renders external text inside inert fences', () => {
  const pkg = buildMusePackage(bounty, snapshot, leaderboard, now);
  const md = formatMuseMarkdown(pkg);
  assert.deepEqual([...md.matchAll(/^## (.+)$/gm)].map(match => match[1]), [
    'Bounty Identity', 'Official Prompt — Verbatim', 'Rules and Constraints', 'Mandatory Deliverables',
    'Judging Criteria', 'Prerequisites', 'Competition Kit', 'Leaderboard Context',
    'Recording and Provenance Requirements', 'Submission Checklist', 'Sources and Verification Status',
    'Muse Execution Bootstrap',
  ]);
  assert.ok(md.includes('~~~~\n' + prompt + '\n~~~~'));
  assert.ok(md.endsWith(museBootstrap + '\n'));
  assert.match(museBootstrap, /Skill Registry/);
  assert.match(museBootstrap, /Explicitly read each selected SKILL\.md/);
  assert.match(museBootstrap, /before implementation/);
  assert.match(museBootstrap, /previous bounty/);
  assert.doesNotMatch(md, /PRIVATE_|LEGACY_COMPOSITE/);
});

test('committed schema and synthetic examples match the exporter', () => {
  const pkg = buildMusePackage(bounty, snapshot, leaderboard, now);
  const schema = JSON.stringify(z.toJSONSchema(musePackageSchema, { target: 'draft-2020-12' }), null, 2) + '\n';
  const artifacts = [
    ['docs/muse-execution-package.schema.json', schema],
    ['docs/muse-execution-package.example.json', JSON.stringify(pkg, null, 2) + '\n'],
    ['docs/MUSE_BOUNTY_CONTEXT.md', formatMuseMarkdown(pkg)],
  ];
  for (const [path, content] of artifacts) {
    if (process.env.UPDATE_MUSE_EXAMPLES === '1') writeFileSync(path, content);
    assert.equal(readFileSync(path, 'utf8'), content);
  }
});
