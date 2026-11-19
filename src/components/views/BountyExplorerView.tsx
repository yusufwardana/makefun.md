import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Columns3,
  ExternalLink,
  RefreshCw,
  Search,
  ClipboardList,
  X,
  Code2,
} from 'lucide-react';
import {
  Button,
  EmptyState,
  Input,
  Panel,
  PanelHeader,
  Select,
  SyncStateIndicator,
} from '../ui/primitives';
import { formatDateTime, formatRelativeDeadline, formatUsd } from '../../lib/utils';
import { fetch } from '../../lib/api';
import type { MusePackage } from '../../types/muse-package';
import type {
  BountyRecord,
  LeaderboardGapInsights,
} from '../../types/command-center';

interface BountyExplorerViewProps {
  onInspectBounty: (slug: string) => void;
  onDataMutated: () => void;
}

export const BountyExplorerView: React.FC<BountyExplorerViewProps> = ({
  onInspectBounty,
  onDataMutated,
}) => {
  const [bounties, setBounties] = useState<BountyRecord[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [watchlistedOnly, setWatchlistedOnly] = useState(false);
  const [sortBy, setSortBy] = useState('status_deadline');

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<{
    bounty: BountyRecord;
    snapshot: { sourceEndpoint: string; fetchedAt: string; rawCompetition: unknown; rawRequirements: unknown } | null;
    intelligence: MusePackage;
    leaderboardInsights?: LeaderboardGapInsights | null;
    refreshError?: string;
  } | null>(null);
  const [detailError, setDetailError] = useState('');
  const detailRequest = useRef<AbortController | null>(null);
  const detailPanel = useRef<HTMLDivElement>(null);
  useEffect(() => () => detailRequest.current?.abort(), []);
  useEffect(() => {
    if (!selectedSlug) return;
    detailPanel.current?.focus({ preventScroll: true });
    if (window.matchMedia('(width < 80rem)').matches) detailPanel.current?.scrollIntoView();
  }, [selectedSlug]);
  const [showRawJson, setShowRawJson] = useState(false);

  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [showCompareDrawer, setShowCompareDrawer] = useState(false);

  const fetchBounties = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        category,
        status: statusFilter,
        sort: sortBy,
        watchlisted: watchlistedOnly ? '1' : '0',
      });
      const res = await fetch(`/api/bounties?${params.toString()}`);
      const data = await res.json();
      setBounties(data.items || []);
      setCategories(data.categories || []);
      setNextCursor(data.nextCursor || null);
      setLastSyncAt(data.lastGlobalSyncAt || null);
      setSyncWarning(data.syncWarning || null);
    } catch (err) {
      setSyncWarning(err instanceof Error ? err.message : 'Failed to load bounties');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBounties();
  }, [category, statusFilter, sortBy, watchlistedOnly]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBounties();
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncWarning(null);
    try {
      const res = await fetch('/api/bounties/sync', { method: 'POST' });
      const data = await res.json();
      if (data.error) setSyncWarning(data.error);
      await fetchBounties();
      onDataMutated();
    } finally {
      setSyncing(false);
    }
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch('/api/bounties/load-more', { method: 'POST' });
      const data = await res.json();
      if (data.error) setSyncWarning(data.error);
      await fetchBounties();
    } finally {
      setLoadingMore(false);
    }
  };

  const openBountyDetail = async (slug: string, refresh = false) => {
    detailRequest.current?.abort();
    const request = new AbortController();
    detailRequest.current = request;
    if (slug !== selectedSlug) setDetailData(null);
    setSelectedSlug(slug);
    setDetailLoading(true);
    setDetailError('');
    setShowRawJson(false);
    try {
      const res = await fetch(`/api/bounties/${encodeURIComponent(slug)}${refresh ? '?refresh=1' : ''}`, { signal: request.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load this bounty.');
      if (!request.signal.aborted) setDetailData(data);
    } catch (error) {
      if (!request.signal.aborted) setDetailError((error as Error).message);
    } finally {
      if (!request.signal.aborted) setDetailLoading(false);
    }
  };

  const toggleWatchlist = async (slug: string, current: boolean) => {
    const response = await fetch(`/api/bounties/${encodeURIComponent(slug)}/watchlist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watchlisted: !current }),
    });
    if (!response.ok) {
      setSyncWarning((await response.json()).error || 'Could not update the watchlist.');
      return;
    }
    setBounties((prev) =>
      prev.map((b) => (b.slug === slug ? { ...b, watchlisted: !current } : b))
    );
    if (detailData && detailData.bounty.slug === slug) {
      setDetailData({
        ...detailData,
        bounty: { ...detailData.bounty, watchlisted: !current },
      });
    }
    onDataMutated();
  };

  const toggleCompare = (slug: string) => {
    setCompareSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= 3) return [...prev.slice(1), slug];
      return [...prev, slug];
    });
  };

  const comparedBounties = useMemo(
    () => bounties.filter((b) => compareSlugs.includes(b.slug)),
    [bounties, compareSlugs]
  );

  const rawComp = (detailData?.snapshot?.rawCompetition || {}) as Record<string, unknown>;
  const rawReq = (detailData?.snapshot?.rawRequirements || {}) as Record<string, unknown>;
  const deliverables = Array.isArray(rawReq.deliverables)
    ? (rawReq.deliverables as Array<{ name?: string; kind?: string; required?: boolean; description?: string }>)
    : [];
  const checks = Array.isArray(rawReq.checks)
    ? (rawReq.checks as Array<{ check?: string; title?: string; description?: string; applies?: boolean }>).filter(
        (c) => c.applies !== false
      )
    : [];
  const payout = rawReq.payout_curve as { places?: unknown[] } | undefined;
  const payoutCurve = Array.isArray(payout?.places ?? payout)
    ? ((payout?.places ?? payout) as Array<{ place?: number; usd?: string | number; amount_usd?: string | number }>)
    : Array.isArray(rawComp.rewardsNow)
      ? (rawComp.rewardsNow as Array<{ place?: number; amountUsd?: string }>)
      : [];

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/[0.07]">
        <div>
          <h1 className="text-xl font-semibold text-[#F3F4F6] tracking-tight">Bounty Explorer</h1>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Read-only discovery from make.fun official endpoints · Last synced:{' '}
            {lastSyncAt ? formatDateTime(lastSyncAt) : 'Never'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {compareSlugs.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowCompareDrawer((v) => !v)}
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Compare ({compareSlugs.length}/3)</span>
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={handleSyncNow} disabled={syncing}>
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync make.fun'}</span>
          </Button>
        </div>
      </div>

      {syncWarning && (
        <div className="rounded-md bg-[#F59E0B]/10 border border-[#F59E0B]/30 px-4 py-2.5 text-xs text-[#FCD34D]">
          Sync status notice: {syncWarning}. Showing locally cached SQLite snapshots.
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <Panel className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, slug, skill, category..."
              className="pl-9"
            />
          </form>

          {/* Segmented status filter */}
          <div className="flex items-center gap-1 p-1 bg-[#090B0E] border border-white/[0.08] rounded-md">
            {(['open', 'resolved', 'all'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-[#1C212A] text-[#F3F4F6]'
                    : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
                }`}
              >
                {st === 'open' ? 'Open' : st === 'resolved' ? 'Resolved' : 'All'}
              </button>
            ))}
          </div>

          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className="w-40"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>

          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort bounties"
            className="w-48"
          >
            <option value="status_deadline">Open First & Latest</option>
            <option value="ratio_desc">Best $/Entry Ratio</option>
            <option value="reward_desc">Highest Prize Pool</option>
            <option value="deadline_asc">Nearest Deadline</option>
            <option value="submissions_desc">Most Submissions</option>
          </Select>

          <Button
            variant={watchlistedOnly ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setWatchlistedOnly((v) => !v)}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Watchlist</span>
          </Button>
        </div>
      </Panel>

      {/* Side-by-Side Opportunity Comparison */}
      {showCompareDrawer && comparedBounties.length > 0 && (
        <Panel>
          <PanelHeader
            title="Opportunity Comparison Matrix"
            subtitle="Comparing selected competitions side-by-side"
            actions={
              <Button variant="ghost" size="sm" onClick={() => setShowCompareDrawer(false)}>
                <X className="w-4 h-4" />
                <span>Close</span>
              </Button>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.07] text-[#9CA3AF]">
                <tr>
                  <th className="px-4 py-3 font-medium">Dimension</th>
                  {comparedBounties.map((b) => (
                    <th key={b.slug} className="px-4 py-3 font-semibold text-[#F3F4F6]">
                      {b.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                <tr>
                  <td className="px-4 py-2.5 text-[#9CA3AF]">Category & Skills</td>
                  {comparedBounties.map((b) => (
                    <td key={b.slug} className="px-4 py-2.5 text-[#F3F4F6]">
                      {b.category} · {b.skills.join(', ') || 'None listed'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-[#9CA3AF]">Prize Pool</td>
                  {comparedBounties.map((b) => (
                    <td key={b.slug} className="px-4 py-2.5 font-mono tabular-nums text-[#10B981]">
                      {formatUsd(b.potUsd || b.rewardAmount)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-[#9CA3AF]">Deadline</td>
                  {comparedBounties.map((b) => (
                    <td key={b.slug} className="px-4 py-2.5 font-mono tabular-nums text-[#F3F4F6]">
                      {formatRelativeDeadline(b.deadline)} ({formatDateTime(b.deadline)})
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-[#9CA3AF]">Submissions & $/Entry</td>
                  {comparedBounties.map((b) => {
                    const ratio = (b.potUsd || b.rewardAmount) / Math.max(b.submissionCount, 1);
                    return (
                      <td key={b.slug} className="px-4 py-2.5 font-mono tabular-nums text-[#F3F4F6]">
                        {b.submissionCount} entries · {formatUsd(ratio)}/entry
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-[#9CA3AF]">Action</td>
                  {comparedBounties.map((b) => (
                    <td key={b.slug} className="px-4 py-2.5">
                      <Button variant="primary" size="sm" onClick={() => onInspectBounty(b.slug)}>
                        Inspect requirements
                      </Button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Split Workspace: Table + Detail Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <Panel className={selectedSlug ? 'min-w-0 xl:col-span-7' : 'min-w-0 xl:col-span-12'}>
          <PanelHeader
            title={`Competitions (${bounties.length})`}
            subtitle="Click any competition to inspect full official rules, deliverables, checks, and snapshots"
          />
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 rounded bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : bounties.length === 0 ? (
            <EmptyState
              title="No matching competitions found"
              description="Adjust your search or status filter, or run a fresh read-only sync with make.fun."
              action={
                <Button variant="primary" size="sm" onClick={handleSyncNow}>
                  Sync make.fun
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/[0.07] text-xs text-[#9CA3AF]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Competition</th>
                    <th className="px-4 py-3 font-medium text-right">Prize Pool</th>
                    <th className="px-4 py-3 font-medium text-right">Entries</th>
                    <th className="px-4 py-3 font-medium text-right">$/Entry</th>
                    <th className="px-4 py-3 font-medium">Deadline</th>
                    <th className="px-4 py-3 font-medium">Sync</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {bounties.map((b) => {
                    const isSelected = selectedSlug === b.slug;
                    const isCompared = compareSlugs.includes(b.slug);
                    const poolUsd = b.potUsd || b.rewardAmount;
                    const ratioUsd = poolUsd / Math.max(b.submissionCount, 1);
                    return (
                      <tr
                        key={b.slug}
                        onClick={() => openBountyDetail(b.slug)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#3B82F6]/10' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <td className="px-4 py-3 min-w-[230px]">
                          <button
                            type="button"
                            className="line-clamp-1 cursor-pointer text-left font-medium text-[#F3F4F6] hover:text-blue-300 focus-visible:outline-2 focus-visible:outline-blue-400"
                            aria-expanded={isSelected}
                            onClick={(event) => {
                              event.stopPropagation();
                              void openBountyDetail(b.slug);
                            }}
                          >
                            {b.title}
                          </button>
                          <div className="text-xs text-[#9CA3AF] mt-0.5">
                            {b.category} · {b.status}
                            {b.skills.length > 0 ? ` · ${b.skills.slice(0, 3).join(', ')}` : ''}
                            {b.prerequisites?.label ? ` · Prereq: ${b.prerequisites.label}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-[#10B981] whitespace-nowrap">
                          {formatUsd(poolUsd)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-[#F3F4F6] whitespace-nowrap">
                          {b.submissionCount}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-[#93C5FD] whitespace-nowrap">
                          {formatUsd(ratioUsd)}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-xs text-[#9CA3AF] whitespace-nowrap">
                          {formatRelativeDeadline(b.deadline)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <SyncStateIndicator state={b.syncState} />
                        </td>
                        <td
                          className="px-4 py-3 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => toggleWatchlist(b.slug, b.watchlisted)}
                              title="Toggle Watchlist"
                              aria-label="Toggle Watchlist"
                              className={`p-1.5 rounded hover:bg-white/[0.06] cursor-pointer ${
                                b.watchlisted ? 'text-[#F59E0B]' : 'text-[#6B7280]'
                              }`}
                            >
                              <Bookmark className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleCompare(b.slug)}
                              title="Add to Comparison"
                              aria-label="Add to Comparison"
                              className={`p-1.5 rounded hover:bg-white/[0.06] cursor-pointer ${
                                isCompared ? 'text-[#3B82F6]' : 'text-[#6B7280]'
                              }`}
                            >
                              <Columns3 className="w-3.5 h-3.5" />
                            </button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => onInspectBounty(b.slug)}
                            >
                              <ClipboardList className="w-3.5 h-3.5" />
                              <span>Inspect</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {nextCursor && (
            <div className="px-5 py-3.5 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[#9CA3AF]">More historical competitions available on make.fun</span>
              <Button variant="secondary" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading...' : 'Load Next Page'}
              </Button>
            </div>
          )}
        </Panel>

        {/* Bounty Detail Inspector */}
        {selectedSlug && (
          <Panel ref={detailPanel} tabIndex={-1} role="region" aria-label="Bounty details"
            className="min-w-0 xl:col-span-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-140px)] flex flex-col">
            <PanelHeader
              title={detailData?.bounty.title || selectedSlug}
              subtitle={
                detailData
                  ? `${detailData.bounty.category} · ${formatUsd(detailData.bounty.potUsd || detailData.bounty.rewardAmount)} · ${detailData.bounty.status}`
                  : 'Loading official snapshot...'
              }
              actions={
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openBountyDetail(selectedSlug, true)}
                    disabled={detailLoading}
                    title="Refresh official details"
                    aria-label="Refresh official details"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${detailLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Close bounty details" onClick={() => { detailRequest.current?.abort(); setSelectedSlug(null); setDetailData(null); }}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              }
            />

            <div className="min-w-0 p-5 xl:overflow-y-auto space-y-5 flex-1 text-xs [overflow-wrap:anywhere]">
              {detailError && <p role="alert" className="text-red-300">{detailError}</p>}
              {detailLoading && !detailData ? (
                <div className="space-y-3">
                  <div className="h-20 rounded bg-white/[0.04] animate-pulse" />
                  <div className="h-32 rounded bg-white/[0.04] animate-pulse" />
                </div>
              ) : detailData ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                      <SyncStateIndicator state={detailData.bounty.syncState} />
                      <span className="text-[#9CA3AF] font-mono">
                        Snapshot: {detailData.snapshot ? formatDateTime(detailData.snapshot.fetchedAt) : 'None'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={detailData.intelligence.bounty.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[#3B82F6] hover:underline"
                      >
                        <span>Official Page</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onInspectBounty(detailData.bounty.slug)}
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        <span>Inspect requirements & export</span>
                      </Button>
                    </div>
                  </div>

                  {detailData.refreshError && (
                    <div className="rounded bg-[#EF4444]/10 border border-[#EF4444]/30 px-3 py-2 text-[#FCA5A5]">
                      Live fetch warning: {detailData.refreshError}
                    </div>
                  )}

                  {detailData.bounty.summary && (
                    <div>
                      <h3 className="text-xs font-semibold text-[#F3F4F6] mb-1.5">Official Summary</h3>
                      <p className="text-[#D1D5DB] leading-relaxed">{detailData.bounty.summary}</p>
                    </div>
                  )}

                  {(() => {
                    const prereqs =
                      detailData.bounty.prerequisites ||
                      (rawReq.prerequisites as BountyRecord['prerequisites']) ||
                      null;
                    if (!prereqs) return null;
                    const software = Array.isArray(prereqs.software) ? prereqs.software : [];
                    const accounts = Array.isArray(prereqs.accounts) ? prereqs.accounts : [];
                    const mcp = Array.isArray(prereqs.mcp) ? prereqs.mcp : [];
                    const allItems = [
                      ...software.map((item) => ({ kind: 'Software', ...item })),
                      ...accounts.map((item) => ({ kind: 'Account', ...item })),
                      ...mcp.map((item) => ({ kind: 'MCP', ...item })),
                    ];
                    return (
                      <div className="rounded-md bg-[#090B0E] border border-white/[0.08] p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-semibold text-[#F3F4F6]">
                            Prerequisites Check{prereqs.label ? ` · ${prereqs.label}` : ''}
                          </h3>
                          {prereqs.as_of && (
                            <span className="font-mono text-[10px] text-[#9CA3AF]">
                              as of {prereqs.as_of}
                            </span>
                          )}
                        </div>
                        {prereqs.summary && (
                          <p className="text-[#D1D5DB] leading-relaxed">{prereqs.summary}</p>
                        )}
                        {allItems.length > 0 && (
                          <ul className="space-y-1.5 pt-1">
                            {allItems.map((item, idx) => (
                              <li key={idx} className="text-[#D1D5DB] leading-relaxed">
                                <span className="font-mono text-[#93C5FD]">[{item.kind}]</span>{' '}
                                <span className="font-medium text-[#F3F4F6]">{item.name}</span>
                                {item.version ? ` (${item.version})` : ''}
                                {item.required ? ' · Required' : ' · Optional'}
                                {item.why ? ` — ${item.why}` : ''}
                                {item.how_to_check && (
                                  <div className="font-mono text-[11px] text-[#9CA3AF] mt-0.5">
                                    Check: {item.how_to_check}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {prereqs.if_unmet && (
                          <p className="text-[11px] text-[#FCD34D] pt-1">
                            If unmet: {prereqs.if_unmet}
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {detailData.leaderboardInsights && (
                    <div className="rounded-md bg-[#090B0E] border border-white/[0.08] p-3.5 space-y-1.5">
                      <h3 className="text-xs font-semibold text-[#F3F4F6]">
                        Leaderboard Snapshot ({detailData.leaderboardInsights.rankKeyTitle})
                      </h3>
                      <p className="text-[#D1D5DB] leading-relaxed">
                        {detailData.leaderboardInsights.gapSummary}
                      </p>
                    </div>
                  )}

                  <div>
                    <h3 className="text-xs font-semibold text-[#F3F4F6] mb-1.5">
                      Official Prompt & Rules Snapshot
                    </h3>
                    <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed bg-[#090B0E] border border-white/[0.07] rounded-md p-3 text-[#D1D5DB] max-h-60 overflow-y-auto">
                      {detailData.intelligence.officialPrompt ||
                        'Official description not returned in snapshot.'}
                    </pre>
                  </div>

                  {deliverables.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-[#F3F4F6] mb-1.5">
                        Required Deliverables ({deliverables.length})
                      </h3>
                      <ul className="space-y-1.5 text-[#D1D5DB]">
                        {deliverables.map((d, idx) => (
                          <li key={idx} className="leading-relaxed">
                            <span className="font-mono text-[#3B82F6]">{d.name}</span> ({d.kind}
                            {d.required ? ', required' : ''}): {d.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {checks.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-[#F3F4F6] mb-1.5">
                        Intake & Gate Checks ({checks.length})
                      </h3>
                      <ul className="space-y-1.5 text-[#9CA3AF] max-h-40 overflow-y-auto">
                        {checks.slice(0, 12).map((c, idx) => (
                          <li key={idx}>
                            <span className="font-mono text-[#F3F4F6]">{c.check}</span>: {c.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {payoutCurve.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-[#F3F4F6] mb-1.5">Payout Curve</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[#D1D5DB] tabular-nums">
                        {payoutCurve.slice(0, 10).map((p, idx) => (
                          <span key={idx}>
                            #{p.place ?? idx + 1}: $
                            {(p as { amountUsd?: string; amount_usd?: string; usd?: string }).amountUsd ??
                              (p as { amount_usd?: string }).amount_usd ??
                              (p as { usd?: string }).usd ??
                              '?'}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/[0.07]">
                    <button
                      type="button"
                      onClick={() => setShowRawJson((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#F3F4F6] cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>{showRawJson ? 'Hide Raw Official JSON' : 'Inspect Raw Official JSON'}</span>
                    </button>
                    {showRawJson && (
                      <pre className="mt-2 font-mono text-[10px] bg-[#090B0E] border border-white/[0.07] rounded p-3 text-[#9CA3AF] max-h-56 overflow-auto">
                        {JSON.stringify(
                          {
                            sourceEndpoint: detailData.snapshot?.sourceEndpoint,
                            competition: detailData.snapshot?.rawCompetition,
                            requirements: detailData.snapshot?.rawRequirements,
                          },
                          null,
                          2
                        )}
                      </pre>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
};
