import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Button,
  EmptyState,
  Input,
  Panel,
  PanelHeader,
  Select,
} from '../ui/primitives';
import { formatDateTime } from '../../lib/utils';
import { fetch } from '../../lib/api';
import { matchesSubmissionStatus, mergeSubmissionEntries, type SubmissionListEntry } from '../../lib/submissions';
import type { BountyRecord, SubmissionRecord, SubmissionStatus } from '../../types/command-center';
import { statusLabel, useMakefunAccountMonitor } from './MakefunMonitor';

function SubmissionRow({ entry, bountyTitle }: { entry: SubmissionListEntry; bountyTitle: string }) {
  const { official, local } = entry;
  const source = official ? 'make.fun account' : local?.source === 'makefun_api' ? 'Public make.fun snapshot' : 'Manual record';
  const checks = official?.checks ?? [];
  const failureCount = checks.filter(check => check.status === 'fail').length;
  return (
    <li className="min-w-0 [overflow-wrap:anywhere]">
      <details className="group">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm text-secondary hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
          <span className="font-semibold text-ink">{bountyTitle}</span>
          <span className={entry.stage === 'rejected' ? 'text-danger' : 'text-secondary'}> · <span className="capitalize">{statusLabel(entry.stage)}</span></span>
          {official?.outcome && <span> · <span className="capitalize">{statusLabel(official.outcome)}</span></span>}
          {failureCount > 0 && <span className="text-danger"> · {failureCount} failed {failureCount === 1 ? 'check' : 'checks'}</span>}
          <span className="mt-1 block pl-4 text-xs text-muted">{source}</span>
        </summary>
        <div className="space-y-3 px-4 pb-4 text-sm text-secondary">
          {local?.entryTitle && local.entryTitle !== bountyTitle && <p>{local.entryTitle}</p>}
          <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-muted">Entry ID</dt><dd className="font-mono">{entry.id}</dd>
            {local?.commitSha && <><dt className="text-muted">Commit</dt><dd className="font-mono">{local.commitSha}</dd></>}
            {local && (local.rank !== null || local.scoreDisplay) && <>
              <dt className="text-muted">{local.source === 'makefun_api' ? 'Snapshot rank / score' : 'Recorded rank / score'}</dt>
              <dd>{[local.rank === null ? null : `#${local.rank}`, local.scoreDisplay].filter(Boolean).join(' · ')}</dd>
            </>}
            {local && <><dt className="text-muted">Recorded at</dt><dd>{formatDateTime(local.verifiedAt)}</dd></>}
          </dl>
          {official && (checks.length ? <ul className="space-y-1 border-t border-line pt-2">
            {[...checks].sort((a, b) => Number(b.status === 'fail') - Number(a.status === 'fail')).map((check, index) => (
              <li key={`${check.name}-${index}`}>
                <span className={check.status === 'fail' ? 'font-medium text-danger' : 'font-medium'}>{statusLabel(check.name)} · {statusLabel(check.status)}</span>
                {check.reason && <span> · {check.reason}</span>}
              </li>
            ))}
          </ul> : <p>No check details reported.</p>)}
        </div>
      </details>
    </li>
  );
}

export const SubmissionsView: React.FC<{ onRewards: () => void }> = ({ onRewards }) => {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [bounties, setBounties] = useState<BountyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [recordsError, setRecordsError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const account = useMakefunAccountMonitor();
  const snapshot = account.data?.snapshot;

  const [showAdd, setShowAdd] = useState(false);
  const [slug, setSlug] = useState('');
  const [entryTitle, setEntryTitle] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [status, setStatus] = useState<SubmissionStatus>('submitted');
  const [rank, setRank] = useState('');
  const [scoreDisplay, setScoreDisplay] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadRecords() {
      try {
        const [sRes, bRes] = await Promise.all([
          fetch('/api/submissions', { signal: controller.signal }),
          fetch('/api/bounties?status=all', { signal: controller.signal }),
        ]);
        if (!sRes.ok || !bRes.ok) throw new Error('Could not load local submission records.');
        const [sData, bData] = await Promise.all([sRes.json(), bRes.json()]);
        if (controller.signal.aborted) return;
        setSubmissions(sData.submissions ?? []);
        setBounties(bData.items ?? []);
        setSlug(current => current || bData.items?.[0]?.slug || '');
      } catch {
        if (!controller.signal.aborted) setRecordsError('Could not load local submission records.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadRecords();
    return () => controller.abort();
  }, []);

  const handleRecordSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !entryTitle.trim()) return;
    setSaving(true);
    setSaveStatus('');
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bountySlug: slug,
          entryTitle: entryTitle.trim(),
          commitSha: commitSha.trim() || null,
          repoUrl: repoUrl.trim() || null,
          status,
          rank: rank.trim() ? Number(rank) : null,
          scoreDisplay: scoreDisplay.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the manual record.');
      setSubmissions((prev) => [data.submission, ...prev]);
      setFilterStatus('all');
      setShowAdd(false);
      setEntryTitle('');
      setCommitSha('');
      setRepoUrl('');
      setRank('');
      setScoreDisplay('');
      setSaveStatus('Manual submission record saved.');
    } catch (error) {
      setSaveStatus((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const entries = mergeSubmissionEntries(snapshot?.entries ?? [], submissions);
  const filtered = entries.filter(entry => matchesSubmissionStatus(entry, filterStatus));
  const filters = new Set(['rejected', 'superseded', ...entries.map(entry => entry.stage)]);
  const bountyTitles = new Map(bounties.map(bounty => [bounty.slug, bounty.title]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-line">
        <div>
          <h1 className="text-[clamp(1.55rem,3vw,2.25rem)] font-semibold text-ink tracking-tight">
            Submissions
          </h1>
          <p className="text-xs text-muted mt-1">
            {snapshot ? `@${snapshot.handle.replace(/^@/, '')} · make.fun synced ${formatDateTime(snapshot.syncedAt)}`
              : account.data?.connection === 'disconnected' ? 'Connect your make.fun account in Settings to sync submissions.'
              : account.error ? 'Account data unavailable.' : 'Waiting for account data…'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {account.canSync && <Button variant="secondary" size="sm" onClick={account.sync} disabled={account.busy || account.data?.syncing}>
            {account.busy || account.data?.syncing ? 'Syncing…' : 'Sync now'}
          </Button>}
          <Button variant="secondary" size="sm" onClick={onRewards}>Review rewards</Button>
          <Button variant="primary" size="sm" aria-expanded={showAdd} onClick={() => { setSaveStatus(''); setShowAdd(v => !v); }}>
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add manual record</span>
          </Button>
        </div>
      </div>

      {(account.error || account.data?.error) && <p className="text-sm text-secondary" role="status">{account.error || account.data?.error}</p>}
      {recordsError && <p className="text-sm text-secondary" role="status">{recordsError}</p>}
      {snapshot && snapshot.entryCount > snapshot.entries.length && <p className="text-sm text-muted">
        make.fun returned {snapshot.entries.length} of {snapshot.entryCount} official submissions.
      </p>}
      {saveStatus && <p className="text-sm text-secondary" role="status">{saveStatus}</p>}

      {showAdd && (
        <Panel>
          <PanelHeader title="Add a manual submission record" />
          <form onSubmit={handleRecordSubmission} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor="submission-competition" className="block text-xs text-muted mb-1">Competition</label>
                <Select id="submission-competition" value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full">
                  {bounties.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="submission-title" className="block text-xs text-muted mb-1">Entry Title</label>
                <Input
                  id="submission-title"
                  value={entryTitle}
                  onChange={(e) => setEntryTitle(e.target.value)}
                  placeholder="Submission title"
                  required
                />
              </div>
              <div>
                <label htmlFor="submission-status" className="block text-xs text-muted mb-1">Recorded status</label>
                <Select
                  id="submission-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as SubmissionStatus)}
                  className="w-full"
                >
                  <option value="submitted">Submitted</option>
                  <option value="accepted">Accepted (Checks Passed)</option>
                  <option value="judged">Judged</option>
                  <option value="awarded">Awarded</option>
                  <option value="rejected">Rejected</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label htmlFor="submission-commit-sha" className="block text-xs text-muted mb-1">Commit SHA (Optional)</label>
                <Input
                  id="submission-commit-sha"
                  value={commitSha}
                  onChange={(e) => setCommitSha(e.target.value)}
                  placeholder="40-char commit SHA"
                />
              </div>
              <div>
                <label htmlFor="submission-repo-url" className="block text-xs text-muted mb-1">Repo URL (Optional)</label>
                <Input
                  id="submission-repo-url"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/..."
                />
              </div>
              <div>
                <label htmlFor="submission-rank" className="block text-xs text-muted mb-1">Rank (If Judged)</label>
                <Input
                  id="submission-rank"
                  type="number"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  placeholder="e.g. 3"
                />
              </div>
              <div>
                <label htmlFor="submission-score" className="block text-xs text-muted mb-1">Score (If Judged)</label>
                <Input
                  id="submission-score"
                  value={scoreDisplay}
                  onChange={(e) => setScoreDisplay(e.target.value)}
                  placeholder="e.g. 1420 Elo"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={saving || !slug}>
                {saving ? 'Saving…' : 'Save manual record'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title={`Submission records (${filtered.length})`}
          actions={
            <Select aria-label="Filter submissions by status" value={filterStatus} onChange={event => setFilterStatus(event.target.value)}>
              <option value="all">All statuses</option>
              {[...filters].map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + statusLabel(value.slice(1))}</option>)}
              {!filters.has(filterStatus) && filterStatus !== 'all' && <option value={filterStatus}>{statusLabel(filterStatus)}</option>}
            </Select>
          }
        />

        {loading || (!account.data && !account.error) ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded bg-hover animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={filterStatus === 'all' ? 'No submission records available' : 'No submissions match this filter'}
            description={filterStatus === 'all' ? 'Sync your connected make.fun account or add a manual record.' : 'Choose All statuses to see every available entry.'}
          />
        ) : (
          <ul aria-label="Submission records" className="divide-y divide-line">
            {filtered.map(entry => <SubmissionRow key={entry.id} entry={entry}
              bountyTitle={bountyTitles.get(entry.bountySlug) || entry.local?.bountyTitle || entry.bountySlug} />)}
          </ul>
        )}
      </Panel>
    </div>
  );
};
