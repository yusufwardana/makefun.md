import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUsd } from '../src/lib/utils.ts';

process.env.COSMICLABS_DB_PATH = ':memory:';
const { extractLeaderboardInsights, extractOfficialPromptText } = await import('../server/makefun.ts');

test('formatUsd formats integers and decimals consistently', () => {
  assert.equal(formatUsd(250), '$250');
  assert.equal(formatUsd(1325.5), '$1,325.50');
  assert.equal(formatUsd(null), '$0.00');
});

test('extractOfficialPromptText preserves description, rules, and deliverables', () => {
  const text = extractOfficialPromptText(
    {
      title: 'Test Bounty',
      summary: 'Short summary',
      description: 'Detailed prompt text',
      rules: 'Must be MIT licensed',
    },
    {
      deliverables: [
        { name: 'repo_url', kind: 'form_field', required: true, description: 'GitHub URL' },
      ],
    }
  );
  assert.ok(text.includes('# Test Bounty'));
  assert.ok(text.includes('Detailed prompt text'));
  assert.ok(text.includes('Must be MIT licensed'));
  assert.ok(text.includes('repo_url'));
});

test('extractLeaderboardInsights computes #1, house baseline, and @0xkeinara gap', () => {
  const insights = extractLeaderboardInsights(
    {
      rank_key: 'elo',
      columns: [{ key: 'elo', title: 'Elo' }],
      entries: [
        { rank: 1, handle: 'leader-dev', title: 'Alpha Engine', display: { elo: '2110' }, baseline: false },
        { rank: 2103, handle: '0xkeinara', title: 'Quiet Rook', display: { elo: '1550' }, baseline: false },
        { rank: 10576, handle: 'house', title: 'sunfish-4k', display: { elo: '0' }, baseline: true },
      ],
    },
    null,
    '@0xkeinara'
  );
  assert.ok(insights);
  assert.equal(insights.topEntries[0].primaryMetricValue, '2110');
  assert.equal(insights.houseBaseline?.title, 'sunfish-4k');
  assert.equal(insights.accountEntry?.rank, 2103);
  assert.ok(insights.gapSummary.includes('gap to #1: 560 Elo'));
});
