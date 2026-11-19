import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Award, XCircle, Plus, AlertCircle } from 'lucide-react';
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
import type { BountyRecord, SubmissionRecord, SubmissionStatus } from '../../types/command-center';

const STATUS_META: Record<
  SubmissionStatus,
  { label: string; colorClass: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  submitted: { label: 'Submitted', colorClass: 'text-accent', Icon: Clock },
  accepted: { label: 'Accepted', colorClass: 'text-accent', Icon: CheckCircle2 },
  judged: { label: 'Judged', colorClass: 'text-warning', Icon: AlertCircle },
  awarded: { label: 'Awarded', colorClass: 'text-success', Icon: Award },
  rejected: { label: 'Rejected', colorClass: 'text-danger', Icon: XCircle },
};

export const SubmissionsView: React.FC<{ onRewards: () => void }> = ({ onRewards }) => {
  const [accountHandle, setAccountHandle] = useState('@0xkeinara');
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [bounties, setBounties] = useState<BountyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [showAdd, setShowAdd] = useState(false);
  const [slug, setSlug] = useState('');
  const [entryTitle, setEntryTitle] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [status, setStatus] = useState<SubmissionStatus>('submitted');
  const [rank, setRank] = useState('');
  const [scoreDisplay, setScoreDisplay] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, bRes] = await Promise.all([
        fetch('/api/submissions'),
        fetch('/api/bounties?status=all'),
      ]);
      const sData = await sRes.json();
      const bData = await bRes.json();
      setAccountHandle(sData.accountHandle || '@0xkeinara');
      setSubmissions(sData.submissions || []);
      const bList = (bData.items || []) as BountyRecord[];
      setBounties(bList);
      if (bList.length > 0 && !slug) setSlug(bList[0].slug);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRecordSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !entryTitle.trim()) return;
    setSaving(true);
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
      if (res.ok) {
        const data = await res.json();
        setSubmissions((prev) => [data.submission, ...prev]);
        setShowAdd(false);
        setEntryTitle('');
        setCommitSha('');
        setRepoUrl('');
        setRank('');
        setScoreDisplay('');
      }
    } finally {
      setSaving(false);
    }
  };

  const filtered =
    filterStatus === 'all'
      ? submissions
      : submissions.filter((s) => s.status === filterStatus);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-line">
        <div>
          <h1 className="text-[clamp(1.55rem,3vw,2.25rem)] font-semibold text-ink tracking-tight">
            Verified Submissions
          </h1>
          <p className="text-xs text-muted mt-1">
            Official submissions matched for {accountHandle} or recorded from verified make.fun receipts
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onRewards}>Review rewards</Button>
          <Button variant="primary" size="sm" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="w-3.5 h-3.5" />
            <span>Record Verified Receipt</span>
          </Button>
        </div>
      </div>

      <div className="rounded-md bg-surface border border-line px-4 py-2.5 text-xs text-muted">
        Submission status comes from make.fun or a verified receipt. Local evidence is reviewed in Evidence Monitor.
      </div>

      {showAdd && (
        <Panel>
          <PanelHeader title="Record Verified make.fun Submission Receipt" />
          <form onSubmit={handleRecordSubmission} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Competition</label>
                <Select value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full">
                  {bounties.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Entry Title</label>
                <Input
                  value={entryTitle}
                  onChange={(e) => setEntryTitle(e.target.value)}
                  placeholder="Submission title"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Verified Status</label>
                <Select
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
                <label className="block text-xs text-muted mb-1">Commit SHA (Optional)</label>
                <Input
                  value={commitSha}
                  onChange={(e) => setCommitSha(e.target.value)}
                  placeholder="40-char commit SHA"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Repo URL (Optional)</label>
                <Input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/..."
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Rank (If Judged)</label>
                <Input
                  type="number"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  placeholder="e.g. 3"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Score (If Judged)</label>
                <Input
                  value={scoreDisplay}
                  onChange={(e) => setScoreDisplay(e.target.value)}
                  placeholder="e.g. 1420 Elo"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={saving}>
                {saving ? 'Saving...' : 'Save Verified Record'}
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
          title={`Submission Records (${filtered.length})`}
          actions={
            <div role="group" aria-label="Filter submission records" className="flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-line bg-canvas p-1">
              {(['all', 'submitted', 'accepted', 'judged', 'awarded'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  aria-pressed={filterStatus === st}
                  className={`min-h-11 px-2.5 text-xs rounded cursor-pointer capitalize ${
                    filterStatus === st
                      ? 'bg-accent-wash text-accent'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          }
        />

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded bg-hover animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={`No verified submissions found for ${accountHandle}`}
            description="When you enter a make.fun competition and sync its detail/leaderboard snapshot—or record a verified submission receipt—its status will appear here."
            action={
              <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>
                Record Verified Receipt
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto" role="region" aria-label="Submission records table" tabIndex={0}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Competition</th>
                  <th className="px-4 py-3 font-medium">Entry Title</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Rank / Score</th>
                  <th className="px-4 py-3 font-medium">Provenance</th>
                  <th className="px-4 py-3 font-medium">Verified At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((s) => {
                  const meta = STATUS_META[s.status] || STATUS_META.submitted;
                  const Icon = meta.Icon;
                  return (
                    <tr key={s.id} className="hover:bg-hover">
                      <td className="px-4 py-3 font-medium text-ink">
                        {s.bountyTitle || s.bountySlug}
                      </td>
                      <td className="px-4 py-3 text-secondary">
                        <div>{s.entryTitle}</div>
                        {s.commitSha && (
                          <div className="font-mono text-[11px] text-muted">
                            {s.commitSha.slice(0, 12)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.colorClass}`}>
                          <Icon className="w-3.5 h-3.5" />
                          <span>{meta.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-ink">
                        {s.rank ? `#${s.rank}` : '—'}
                        {s.scoreDisplay ? ` · ${s.scoreDisplay}` : ''}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{s.source}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted tabular-nums">
                        {formatDateTime(s.verifiedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};
