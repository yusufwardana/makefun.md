import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  Button,
  EmptyState,
  Input,
  Panel,
  PanelHeader,
  Select,
} from '../ui/primitives';
import { formatDateTime, formatUsd } from '../../lib/utils';
import { fetch } from '../../lib/api';
import type { BountyRecord, ClaimStatus, RewardRecord } from '../../types/command-center';
import { MakefunOfficialRewards } from './MakefunMonitor';

export const RewardsAnalyticsView: React.FC = () => {
  const [records, setRecords] = useState<RewardRecord[]>([]);
  const [totals, setTotals] = useState({
    marketOpenPoolUsd: 0,
    trackedAnnouncedUsd: 0,
    verifiedAwardedUsd: 0,
    actuallyReceivedUsd: 0,
  });
  const [openMarketByCategory, setOpenMarketByCategory] = useState<
    Array<{ category: string; pool: number }>
  >([]);
  const [bounties, setBounties] = useState<BountyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [slug, setSlug] = useState('');
  const [announcedUsd, setAnnouncedUsd] = useState('0');
  const [awardedUsd, setAwardedUsd] = useState('0');
  const [receivedUsd, setReceivedUsd] = useState('0');
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>('announced');
  const [txSignature, setTxSignature] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rRes, bRes] = await Promise.all([
        fetch('/api/rewards'),
        fetch('/api/bounties?status=all'),
      ]);
      const rData = await rRes.json();
      const bData = await bRes.json();
      setRecords(rData.records || []);
      setTotals(
        rData.totals || {
          marketOpenPoolUsd: 0,
          trackedAnnouncedUsd: 0,
          verifiedAwardedUsd: 0,
          actuallyReceivedUsd: 0,
        }
      );
      setOpenMarketByCategory(rData.openMarketByCategory || []);
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

  const handleSaveReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    setSaving(true);
    try {
      const res = await fetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bountySlug: slug,
          announcedPrizeUsd: Number(announcedUsd || 0),
          verifiedAwardUsd: Number(awardedUsd || 0),
          receivedUsd: Number(receivedUsd || 0),
          claimStatus,
          txSignature: txSignature.trim() || null,
          notes: notes.trim(),
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        setTxSignature('');
        setNotes('');
        await loadData();
      }
    } finally {
      setSaving(false);
    }
  };

  const comparisonData = [
    {
      stage: 'Market Open Pools (Opportunity)',
      amount: totals.marketOpenPoolUsd,
    },
    {
      stage: 'Tracked Announced Prizes',
      amount: totals.trackedAnnouncedUsd,
    },
    {
      stage: 'Verified Awards Won',
      amount: totals.verifiedAwardedUsd,
    },
    {
      stage: 'Actually Received USDC',
      amount: totals.actuallyReceivedUsd,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-line">
        <div>
          <h1 className="text-[clamp(1.55rem,3vw,2.25rem)] font-semibold text-ink tracking-tight">
            Rewards Analytics
          </h1>
          <p className="text-xs text-muted mt-1">
            Strict separation between announced bounty pools, verified competition awards, and settled Solana USDC payouts
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="w-3.5 h-3.5" />
          <span>Record Verified Payout</span>
        </Button>
      </div>

      <MakefunOfficialRewards />
      {/* 3+1 Strict Ledger Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Panel className="p-5">
          <p className="text-xs text-muted">Open Market Pools (Not Earned)</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-ink">
            {formatUsd(totals.marketOpenPoolUsd)}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            Total prize pools currently open on make.fun
          </p>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs text-muted">Tracked Announced Target</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-accent">
            {formatUsd(totals.trackedAnnouncedUsd)}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            Announced prize caps for tracked entries
          </p>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs text-muted">Verified Awards Won</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-warning">
            {formatUsd(totals.verifiedAwardedUsd)}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            Confirmed placements awaiting or cleared for claim
          </p>
        </Panel>
        <Panel className="p-5">
          <p className="text-xs text-muted">Actually Received USDC</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-success">
            {formatUsd(totals.actuallyReceivedUsd)}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            Settled in Solana wallet with verified receipt
          </p>
        </Panel>
      </div>

      {showAdd && (
        <Panel>
          <PanelHeader title="Record Verified Award or Claimed Solana Payout" />
          <form onSubmit={handleSaveReward} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label htmlFor="reward-competition" className="block text-xs text-muted mb-1">Competition</label>
                <Select id="reward-competition" value={slug} onChange={(e) => setSlug(e.target.value)} className="w-full">
                  {bounties.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.title}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="reward-announced" className="block text-xs text-muted mb-1">Announced Prize ($)</label>
                <Input
                  id="reward-announced"
                  type="number"
                  step="0.01"
                  value={announcedUsd}
                  onChange={(e) => setAnnouncedUsd(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="reward-awarded" className="block text-xs text-muted mb-1">Verified Award ($)</label>
                <Input
                  id="reward-awarded"
                  type="number"
                  step="0.01"
                  value={awardedUsd}
                  onChange={(e) => setAwardedUsd(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="reward-received" className="block text-xs text-muted mb-1">Actually Received ($)</label>
                <Input
                  id="reward-received"
                  type="number"
                  step="0.01"
                  value={receivedUsd}
                  onChange={(e) => setReceivedUsd(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor="reward-claim-status" className="block text-xs text-muted mb-1">Claim Status</label>
                <Select
                  id="reward-claim-status"
                  value={claimStatus}
                  onChange={(e) => setClaimStatus(e.target.value as ClaimStatus)}
                  className="w-full"
                >
                  <option value="announced">Announced (Tracked Only)</option>
                  <option value="awarded_unclaimed">Awarded (Unclaimed)</option>
                  <option value="claimed_received">Claimed & Received</option>
                </Select>
              </div>
              <div>
                <label htmlFor="reward-tx-signature" className="block text-xs text-muted mb-1">
                  Solana Tx Signature (Optional)
                </label>
                <Input
                  id="reward-tx-signature"
                  value={txSignature}
                  onChange={(e) => setTxSignature(e.target.value)}
                  placeholder="Solana transaction hash"
                />
              </div>
              <div>
                <label htmlFor="reward-notes" className="block text-xs text-muted mb-1">Notes</label>
                <Input
                  id="reward-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Placement or escrow note"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" size="sm" disabled={saving}>
                {saving ? 'Saving...' : 'Save Reward Record'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <Panel className="xl:col-span-6">
          <PanelHeader
            title="Announced vs Awarded vs Received Breakdown"
            subtitle="Distinct financial stages never conflated into earned income"
          />
          <div className="p-5 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid stroke="var(--ui-line)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: 'var(--ui-muted)', fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="stage"
                  width={185}
                  tick={{ fill: 'var(--ui-secondary)', fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--ui-quiet)',
                    borderColor: 'var(--ui-line)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                  formatter={(v) => [formatUsd(Number(v ?? 0)), 'USD']}
                />
                <Bar dataKey="amount" fill="var(--ui-accent)" radius={[0, 4, 4, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="xl:col-span-6">
          <PanelHeader
            title="Open Opportunity Pools by Category"
            subtitle="Live announced prize liquidity across open make.fun categories"
          />
          <div className="p-5 h-72">
            {openMarketByCategory.length === 0 ? (
              <EmptyState
                title="No open category data"
                description="Sync open bounties to inspect prize pools by category."
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={openMarketByCategory}>
                  <CartesianGrid stroke="var(--ui-line)" vertical={false} />
                  <XAxis dataKey="category" tick={{ fill: 'var(--ui-muted)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--ui-muted)', fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ui-quiet)',
                      borderColor: 'var(--ui-line)',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    formatter={(v) => [formatUsd(Number(v ?? 0)), 'Open Pool']}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar name="Open Pool (USDC)" dataKey="pool" fill="var(--ui-success)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title={`Reward Ledger (${records.length})`} />
        {loading ? (
          <div className="p-6 h-32 animate-pulse" />
        ) : records.length === 0 ? (
          <EmptyState
            title="No verified reward records yet"
            description="Record verified competition awards or claimed Solana payouts here to track awarded vs actually received USDC."
            action={
              <Button variant="secondary" size="sm" onClick={() => setShowAdd(true)}>
                Record Verified Payout
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto" role="region" aria-label="Rewards records table" tabIndex={0}>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Competition</th>
                  <th className="px-4 py-3 font-medium">Claim Status</th>
                  <th className="px-4 py-3 font-medium text-right">Announced</th>
                  <th className="px-4 py-3 font-medium text-right">Verified Award</th>
                  <th className="px-4 py-3 font-medium text-right">Received USDC</th>
                  <th className="px-4 py-3 font-medium">Tx / Notes</th>
                  <th className="px-4 py-3 font-medium">Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-medium text-ink">
                      {r.bountyTitle || r.bountySlug}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-secondary">{r.claimStatus}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-muted">
                      {formatUsd(r.announcedPrizeUsd)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-warning">
                      {formatUsd(r.verifiedAwardUsd)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-success">
                      {formatUsd(r.receivedUsd)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {r.txSignature ? (
                        <span className="font-mono">{r.txSignature.slice(0, 14)}...</span>
                      ) : (
                        r.notes || '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono tabular-nums text-muted">
                      {formatDateTime(r.verifiedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
};
