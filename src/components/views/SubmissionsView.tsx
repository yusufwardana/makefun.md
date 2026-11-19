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
  submitted: { label: 'Submitted', colorClass: 'text-[#93C5FD]', Icon: Clock },
  accepted: { label: 'Accepted', colorClass: 'text-[#3B82F6]', Icon: CheckCircle2 },
  judged: { label: 'Judged', colorClass: 'text-[#F59E0B]', Icon: AlertCircle },
  awarded: { label: 'Awarded', colorClass: 'text-[#10B981]', Icon: Award },
  rejected: { label: 'Rejected', colorClass: 'text-[#EF4444]', Icon: XCircle },
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
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/[0.07]">
        <div>
          <h1 className="text-xl font-semibold text-[#F3F4F6] tracking-tight">
            Verified Submissions
          </h1>
          <p className="text-xs text-[#9CA3AF] mt-1">
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

      <div className="rounded-md bg-[#0F1216] border border-white/[0.08] px-4 py-2.5 text-xs text-[#9CA3AF]">
        Submission status comes from make.fun or a verified receipt. Local evidence is reviewed in Evidence Monitor.
      </div>

      {showAdd && (
        <Panel>
          <PanelHeader title="Record Verified make.fun Submission Receipt" />
          <form onSubmit={handleRecordSubmission} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Competition</label>
                <Select value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full">
                  {bounties.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Entry Title</label>
                <Input
                  value={entryTitle}
                  onChange={(e) => setEntryTitle(e.target.value)}
                  placeholder="Submission title"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Verified Status</label>
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
                <label className="block text-xs text-[#9CA3AF] mb-1">Commit SHA (Optional)</label>
                <Input
                  value={commitSha}
                  onChange={(e) => setCommitSha(e.target.value)}
                  placeholder="40-char commit SHA"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Repo URL (Optional)</label>
                <Input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/..."
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Rank (If Judged)</label>
                <Input
                  type="number"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  placeholder="e.g. 3"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9CA3AF] mb-1">Score (If Judged)</label>
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
            <div className="flex items-center gap-1 p-1 bg-[#090B0E] border border-white/[0.08] rounded-md">
              {(['all', 'submitted', 'accepted', 'judged', 'awarded'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1 text-xs rounded cursor-pointer capitalize ${
                    filterStatus === st
                      ? 'bg-[#1C212A] text-[#F3F4F6]'
                      : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
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
              <div key={i} className="h-12 rounded bg-white/[0.03] animate-pulse" />
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/[0.07] text-xs text-[#9CA3AF]">
                <tr>
                  <th className="px-4 py-3 font-medium">Competition</th>
                  <th className="px-4 py-3 font-medium">Entry Title</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Rank / Score</th>
                  <th className="px-4 py-3 font-medium">Provenance</th>
                  <th className="px-4 py-3 font-medium">Verified At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filtered.map((s) => {
                  const meta = STATUS_META[s.status] || STATUS_META.submitted;
                  const Icon = meta.Icon;
                  return (
                    <tr key={s.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 font-medium text-[#F3F4F6]">
                        {s.bountyTitle || s.bountySlug}
                      </td>
                      <td className="px-4 py-3 text-[#D1D5DB]">
                        <div>{s.entryTitle}</div>
                        {s.commitSha && (
                          <div className="font-mono text-[11px] text-[#6B7280]">
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
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-xs text-[#F3F4F6]">
                        {s.rank ? `#${s.rank}` : '—'}
                        {s.scoreDisplay ? ` · ${s.scoreDisplay}` : ''}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#9CA3AF]">{s.source}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#9CA3AF] tabular-nums">
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
