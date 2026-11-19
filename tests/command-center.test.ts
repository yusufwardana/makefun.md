import test from 'node:test';
import assert from 'node:assert/strict';
import { formatUsd } from '../src/lib/utils.ts';
import { evaluateTranscriptGates } from '../server/transcript-gate.ts';

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

test('evaluateTranscriptGates flags minimal log and passes full multi-turn JSONL transcript', () => {
  const minimalReport = evaluateTranscriptGates({
    rawContent: 'plain text log without timestamps',
    bountySlug: null,
  });
  assert.equal(minimalReport.overallReady, false);
  assert.equal(minimalReport.checks.find((c) => c.gateId === 'thinking_turns')?.status, 'fail');

  const lines = [
    JSON.stringify({ role: 'user', timestamp: '2026-11-10T10:00:00Z', content: 'Build tiny chess makefun anchor abc1234 round 1' }),
    JSON.stringify({ role: 'assistant', timestamp: '2026-11-10T10:01:00Z', model: 'gemini-3.1-flash-lite', usage: { total_tokens: 120 }, content: [{ type: 'text', text: 'Turn 1 plan' }, { type: 'tool_use', name: 'write_to_file' }] }),
    JSON.stringify({ role: 'assistant', timestamp: '2026-11-10T10:02:00Z', model: 'gemini-3.1-flash-lite', content: [{ type: 'text', text: 'Turn 2 bitboard' }, { type: 'tool_use', name: 'replace_file_content' }] }),
    JSON.stringify({ role: 'assistant', timestamp: '2026-11-10T10:03:00Z', model: 'gemini-3.1-flash-lite', content: 'Turn 3 search' }),
    JSON.stringify({ role: 'assistant', timestamp: '2026-11-10T10:04:00Z', model: 'gemini-3.1-flash-lite', content: 'Turn 4 eval' }),
    JSON.stringify({ role: 'assistant', timestamp: '2026-11-10T10:05:00Z', model: 'gemini-3.1-flash-lite', content: 'Turn 5 verify' }),
  ].join('\n');

  const passingReport = evaluateTranscriptGates({
    rawContent: lines,
    bountySlug: 'tiny-chess-01',
    competitionPublishedAt: '2026-11-01T00:00:00Z',
    competitionDeadline: '2026-12-01T00:00:00Z',
  });
  assert.equal(passingReport.overallReady, true);
  assert.equal(passingReport.assistantTextTurns, 5);
  assert.equal(passingReport.toolEditTurns, 2);
  assert.equal(passingReport.anchorDetected, true);
  assert.equal(passingReport.checks.find((c) => c.gateId === 'thinking_in_window')?.status, 'pass');
});
