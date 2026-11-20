import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSubmissionEntries, matchesSubmissionStatus } from '../src/lib/submissions.ts';
import type { SubmissionRecord } from '../src/types/command-center.ts';
import type { OfficialEntry } from '../src/types/makefun-monitor.ts';

const local = (id: string, source: SubmissionRecord['source'] = 'makefun_api'): SubmissionRecord => ({
  id, bountySlug: 'fixture', bountyTitle: 'Fixture', hunterHandle: '@fixture', entryTitle: 'Local title',
  repoUrl: null, commitSha: null, status: 'accepted', rank: null, scoreDisplay: null, source,
  verifiedAt: '2026-11-20T00:00:00Z', rawJson: null,
});

test('submission list deduplicates exact IDs, preserving official outcomes and unmatched local entries', () => {
  const rejected: OfficialEntry = {
    id: 'shared-id', bounty: 'fixture', stage: 'rejected', outcome: 'superseded',
    checks: [{ name: 'thinking_reproduces', status: 'fail', reason: 'Fixture detail' }],
  };
  const entries = mergeSubmissionEntries([rejected], [local('shared-id'), local('manual-id', 'manual_verified')]);
  assert.deepEqual(entries.map(entry => entry.id), ['shared-id', 'manual-id']);
  assert.equal(entries[0].stage, 'rejected');
  assert.equal(entries[0].official, rejected);
  assert.equal(entries[0].local?.entryTitle, 'Local title');
  assert.equal(entries[1].stage, 'accepted');
  assert.equal(entries[1].official, null);
  assert.deepEqual(entries.filter(entry => matchesSubmissionStatus(entry, 'rejected')).map(entry => entry.id), ['shared-id']);
  assert.deepEqual(entries.filter(entry => matchesSubmissionStatus(entry, 'superseded')).map(entry => entry.id), ['shared-id']);
  assert.deepEqual(entries.filter(entry => matchesSubmissionStatus(entry, 'accepted')).map(entry => entry.id), ['manual-id']);
});
