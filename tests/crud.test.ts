import test from 'node:test';
import assert from 'node:assert/strict';

process.env.COSMICLABS_DB_PATH = ':memory:';
const { createCommandCenterCrud } = await import('../server/crud.ts');
const { createDatabaseConnection } = await import('../server/db.ts');

function setupIsolatedCrud() {
  const { sqlite, orm } = createDatabaseConnection(':memory:');
  const crud = createCommandCenterCrud(orm);
  return { sqlite, orm, crud };
}

test('Drizzle Bounties CRUD: upsert preserves watchlist/notes and supports sorting/filtering', () => {
  const { sqlite, crud } = setupIsolatedCrud();
  try {
    const now = '2026-11-18T02:00:00.000Z';
    crud.upsertBounty({
      slug: 'alpha-bounty',
      id: 'b-1',
      title: 'Alpha Coding Challenge',
      url: 'https://make.fun/bounty/alpha-bounty',
      category: 'Software',
      skills: ['typescript', 'rust'],
      rewardAmount: 1000,
      potUsd: 1000,
      entryFeeUsd: null,
      deadline: '2026-12-01T00:00:00Z',
      publishedAt: '2026-11-10T00:00:00Z',
      status: 'open',
      submissionCount: 2,
      sponsorName: 'MakeFun',
      sponsorVerified: true,
      summary: 'Original summary',
      harnessKind: 'code',
      acceptingSubmissions: true,
      isDemo: false,
      syncState: 'LIVE',
      lastSyncedAt: now,
      prerequisites: {
        label: 'Needs Node 22',
        software: [{ name: 'Node.js', required: true, version: '>=22' }],
      },
    });

    crud.upsertBounty({
      slug: 'beta-bounty',
      id: 'b-2',
      title: 'Beta Crowded Challenge',
      url: 'https://make.fun/bounty/beta-bounty',
      category: 'Creative',
      skills: ['design'],
      rewardAmount: 500,
      potUsd: 500,
      entryFeeUsd: null,
      deadline: '2026-11-25T00:00:00Z',
      publishedAt: '2026-11-10T00:00:00Z',
      status: 'open',
      submissionCount: 100,
      sponsorName: null,
      sponsorVerified: false,
      summary: 'Crowded',
      harnessKind: null,
      acceptingSubmissions: true,
      isDemo: false,
      syncState: 'LIVE',
      lastSyncedAt: now,
    });

    assert.equal(crud.updateBountyWatchlist('alpha-bounty', true), true);
    assert.equal(crud.updateBountyNotes('alpha-bounty', 'Focus on latency'), true);

    // Re-upsert without prerequisites or summary should preserve existing values and watchlist/notes
    const updated = crud.upsertBounty({
      slug: 'alpha-bounty',
      id: 'b-1',
      title: 'Alpha Coding Challenge v2',
      url: 'https://make.fun/bounty/alpha-bounty',
      category: 'Software',
      skills: ['typescript'],
      rewardAmount: 1200,
      potUsd: 1200,
      entryFeeUsd: null,
      deadline: '2026-12-01T00:00:00Z',
      publishedAt: '2026-11-10T00:00:00Z',
      status: 'open',
      submissionCount: 2,
      sponsorName: 'MakeFun',
      sponsorVerified: true,
      summary: null,
      harnessKind: null,
      acceptingSubmissions: true,
      isDemo: false,
      syncState: 'LIVE',
      lastSyncedAt: '2026-11-18T02:05:00.000Z',
      prerequisites: null,
    });

    assert.equal(updated.title, 'Alpha Coding Challenge v2');
    assert.equal(updated.summary, 'Original summary');
    assert.equal(updated.watchlisted, true);
    assert.equal(updated.founderNotes, 'Focus on latency');
    assert.equal(updated.prerequisites?.label, 'Needs Node 22');

    const byRatio = crud.listBounties({ sortBy: 'ratio_desc' });
    assert.equal(byRatio.items[0].slug, 'alpha-bounty');
    assert.equal(byRatio.items[1].slug, 'beta-bounty');

    const watchlisted = crud.listBounties({ watchlistedOnly: true });
    assert.equal(watchlisted.items.length, 1);
    assert.equal(watchlisted.items[0].slug, 'alpha-bounty');
  } finally {
    sqlite.close();
  }
});

test('Drizzle Official Snapshots & Cascade Delete', () => {
  const { sqlite, crud } = setupIsolatedCrud();
  try {
    crud.upsertBounty({
      slug: 'tiny-chess-01',
      id: 'tc-1',
      title: 'Tiny Chess',
      url: 'https://make.fun/bounty/tiny-chess-01',
      category: 'Algorithms',
      skills: ['chess', 'python'],
      rewardAmount: 250,
      potUsd: 250,
      entryFeeUsd: null,
      deadline: '2026-12-10T00:00:00Z',
      publishedAt: '2026-11-01T00:00:00Z',
      status: 'open',
      submissionCount: 10,
      sponsorName: 'MakeFun',
      sponsorVerified: true,
      summary: '4KB chess bot',
      harnessKind: 'elo',
      acceptingSubmissions: true,
      isDemo: false,
      syncState: 'LIVE',
      lastSyncedAt: '2026-11-18T02:00:00Z',
    });

    // Snapshots + manual override
    const snap1 = crud.saveBountySnapshot({
      bountySlug: 'tiny-chess-01',
      sourceEndpoint: 'https://make.fun/api/competitions/tiny-chess-01',
      rawCompetition: { slug: 'tiny-chess-01' },
      rawRequirements: { max_bytes: 4096 },
      rawLeaderboard: null,
      rawKit: null,
      officialPromptText: 'Build a 4KB chess engine.',
      fetchedAt: '2026-11-18T02:00:00Z',
      contentHash: 'hash-1',
    });
    assert.equal(snap1.officialPromptText, 'Build a 4KB chess engine.');

    assert.equal(crud.getLatestBountySnapshot('tiny-chess-01')?.id, snap1.id);
    assert.equal(crud.deleteBounty('tiny-chess-01'), true);
    assert.equal(crud.getLatestBountySnapshot('tiny-chess-01'), null);
  } finally {
    sqlite.close();
  }
});

test('Drizzle Submissions, Rewards, Evidence & Settings CRUD', () => {
  const { sqlite, crud } = setupIsolatedCrud();
  try {
    // Submissions CRUD
    const sub = crud.createSubmission({
      bountySlug: 'tiny-chess-01',
      hunterHandle: '@0xkeinara',
      entryTitle: 'Quiet Rook',
      commitSha: 'abc1234',
      repoUrl: 'https://github.com/0xkeinara/quiet-rook',
      status: 'submitted',
      rank: null,
      scoreDisplay: null,
      source: 'manual_verified',
    });
    assert.equal(crud.listSubmissions().length, 1);

    const updatedSub = crud.updateSubmission(sub.id, {
      status: 'judged',
      rank: 2103,
      scoreDisplay: '1550',
    });
    assert.equal(updatedSub?.status, 'judged');
    assert.equal(updatedSub?.rank, 2103);

    // Upsert from API should update existing ID cleanly
    const upsertedSub = crud.upsertSubmission({
      id: sub.id,
      bountySlug: 'tiny-chess-01',
      hunterHandle: '@0xkeinara',
      entryTitle: 'Quiet Rook',
      status: 'awarded',
      rank: 3,
      scoreDisplay: '2050',
      source: 'makefun_api',
    });
    assert.equal(upsertedSub.status, 'awarded');
    assert.equal(upsertedSub.rank, 3);
    assert.equal(crud.deleteSubmission(sub.id), true);
    assert.equal(crud.listSubmissions().length, 0);

    // Rewards CRUD
    const reward = crud.createReward({
      bountySlug: 'tiny-chess-01',
      announcedPrizeUsd: 250,
      verifiedAwardUsd: 100,
      receivedUsd: 0,
      claimStatus: 'awarded_unclaimed',
      notes: 'Pending claim',
    });
    const updatedReward = crud.updateReward(reward.id, {
      receivedUsd: 100,
      claimStatus: 'claimed_received',
      txSignature: '5xTxSig',
    });
    assert.equal(updatedReward?.claimStatus, 'claimed_received');
    const summary = crud.listRewardsWithTotals();
    assert.equal(summary.totals.actuallyReceivedUsd, 100);
    assert.equal(crud.deleteReward(reward.id), true);

    // Evidence CRUD
    const ev = crud.createEvidence({
      bountySlug: 'tiny-chess-01',
      sourceType: 'session_export',
      sourcePathOrName: 'hermes-run.jsonl',
      sessionId: 'sess-1',
      summary: 'Imported 10 lines',
      rawContent: '{"role":"assistant"}',
      metadata: { turnCount: 1, readOnlyVerified: true },
    });
    assert.equal(crud.findEvidenceBySourcePath('hermes-run.jsonl')?.id, ev.id);
    assert.equal(crud.deleteEvidence(ev.id), true);

    // Settings CRUD
    crud.setSettingValue('accountHandle', '@0xkeinara_test');
    assert.equal(crud.getSettingValue('accountHandle'), '@0xkeinara_test');
  } finally {
    sqlite.close();
  }
});
