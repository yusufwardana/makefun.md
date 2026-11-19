import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMusePackage } from '../server/muse-handoff.ts';

process.env.COSMICLABS_DB_PATH = ':memory:';
const { crud } = await import('../server/crud.ts');
const { syncCompetitionsFromMakefun, syncSingleBountyDetails } = await import('../server/makefun.ts');

test('official read-only sync preserves text and advances snapshots when the kit or leaderboard changes', async t => {
  const slug = 'sync-fixture-' + Date.now();
  const origin = 'https://make.fun/api/competitions';
  const description = '  Official competition text.\r\n\n';
  const competition = { slug, title: 'Sync test fixture', status: 'open', description, submissionCount: 0 };
  const requirements = { competition: { slug }, deliverables: [] };
  let kitFiles = ['RULES.txt'];
  let unreachable = false;
  let activeRequirements = requirements;
  const mock = t.mock.method(globalThis, 'fetch', async (input: string, options: RequestInit) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    if (unreachable) return new Response('Unavailable', { status: 503 });
    const byUrl: Record<string, unknown> = {
      [origin + '?status=open']: { items: [competition, { slug: 'invalid.bounty' }] },
      [origin]: { items: [competition], next_cursor: null },
      [origin + '/' + slug]: competition,
      [origin + '/' + slug + '/requirements?format=json']: activeRequirements,
      [origin + '/' + slug + '/leaderboard']: { entries: [] },
      [origin + '/' + slug + '/kit']: { files: kitFiles.map(path => ({ path })) },
    };
    assert.ok(Object.hasOwn(byUrl, input));
    return Response.json(byUrl[input]);
  });
  try {
    const discoveryRequest = syncCompetitionsFromMakefun();
    assert.equal(syncCompetitionsFromMakefun({ includeOpenFirst: true }), discoveryRequest);
    const discovery = await discoveryRequest;
    assert.equal(discovery.syncedCount, 1);
    assert.equal(discovery.syncState, 'LIVE');
    assert.equal(crud.getBountyBySlug(slug)?.title, competition.title);
    assert.equal(crud.getBountyBySlug('invalid.bounty'), null);
    crud.updateBountyWatchlist(slug, true);
    crud.updateBountyNotes(slug, 'private notes');
    const detailRequest = syncSingleBountyDetails(slug);
    assert.equal(syncSingleBountyDetails(slug), detailRequest);
    const first = await detailRequest;
    assert.deepEqual(first.snapshot?.rawRequirements, requirements);
    assert.equal(first.snapshot?.rawCompetition?.description, description);
    assert.equal(first.bounty?.watchlisted, true);
    assert.equal(first.bounty?.founderNotes, 'private notes');
    assert.equal(buildMusePackage(first.bounty!, first.snapshot, null).officialPrompt, description);

    kitFiles = ['RULES.txt', 'manifest.json'];
    const changed = await syncSingleBountyDetails(slug);
    assert.notEqual(changed.snapshot?.id, first.snapshot?.id);
    assert.equal(buildMusePackage(changed.bounty!, changed.snapshot, null).competitionKit?.files?.length, 2);

    unreachable = true;
    const offline = await syncSingleBountyDetails(slug);
    assert.equal(offline.syncState, 'OFFLINE');
    assert.equal(offline.snapshot?.id, changed.snapshot?.id);
    assert.equal(buildMusePackage(offline.bounty!, offline.snapshot, null).officialPrompt, description);
    assert.equal(mock.mock.callCount(), 14);

    unreachable = false;
    activeRequirements = { ...requirements, competition: { slug: 'different-bounty' } };
    const mismatched = await syncSingleBountyDetails(slug);
    assert.equal(mismatched.syncState, 'UNVERIFIED');
    assert.equal(mismatched.snapshot?.rawRequirements, null);
  } finally {
    crud.deleteBounty(slug);
  }
});
