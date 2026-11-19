import React from 'react';
import { ArrowRight, Bookmark, RefreshCw, ExternalLink, ClipboardList } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { Button, EmptyState, Panel, PanelHeader, SyncStateIndicator } from '../ui/primitives';
import { formatDateTime, formatRelativeDeadline, formatUsd } from '../../lib/utils';
import type { AppSettings, BountyRecord } from '../../types/command-center';

export interface OverviewData {
  totalSyncedBounties: number;
  openBountiesCount: number;
  openPoolTotalUsd: number;
  watchlistedCount: number;
  evidenceCount: number;
  verifiedSubmissionsCount: number;
  rewardSummary: {
    totalAnnounced: number;
    totalVerifiedAwarded: number;
    totalReceived: number;
  };
  topOpenBounties: BountyRecord[];
  watchlistedBounties: BountyRecord[];
  categoryBreakdown: Array<{ category: string; openCount: number; openPoolUsd: number }>;
  lastGlobalSyncAt: string | null;
  settings: AppSettings;
}

interface OverviewViewProps {
  data: OverviewData | null;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  onSyncNow: () => void;
  onOpenExplorer: () => void;
  onInspectBounty: (slug: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  data,
  loading,
  syncing,
  error,
  onSyncNow,
  onOpenExplorer,
  onInspectBounty,
}) => {
  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-[#0F1216] border border-white/[0.08] animate-pulse" />
          ))}
        </div>
        <div className="h-80 rounded-lg bg-[#0F1216] border border-white/[0.08] animate-pulse" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <Panel>
        <EmptyState
          title="Unable to load Command Center overview"
          description={error}
          action={
            <Button variant="primary" onClick={onSyncNow}>
              Retry Sync
            </Button>
          }
        />
      </Panel>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Top Action Context Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-white/[0.07]">
        <div>
          <h1 className="text-xl font-semibold text-[#F3F4F6] tracking-tight">
            COSMICLABS Command Overview
          </h1>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Account {data.settings.accountHandle} · Last Sync: {data.lastGlobalSyncAt ? formatDateTime(data.lastGlobalSyncAt) : 'Not synced yet'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" size="sm" onClick={onSyncNow} disabled={syncing}>
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing make.fun...' : 'Sync Bounties'}</span>
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-amber-200" role="status">{error}</p>}

      {/* 4-Column Real Metrics Row (no fake stats) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Panel className="p-5">
          <p className="text-xs text-[#9CA3AF]">Open Bounties on make.fun</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#F3F4F6]">
              {data.openBountiesCount}
            </span>
            <span className="text-xs text-[#9CA3AF] font-mono tabular-nums">
              {data.totalSyncedBounties} total synced
            </span>
          </div>
          <p className="mt-2 text-xs text-[#6B7280] font-mono tabular-nums">
            Announced open pools: {formatUsd(data.openPoolTotalUsd)}
          </p>
        </Panel>

        <Panel className="p-5">
          <p className="text-xs text-[#9CA3AF]">Watchlisted Bounties</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#F3F4F6]">
              {data.watchlistedCount}
            </span>
          </div>
          <p className="mt-2 text-xs text-[#6B7280] font-mono tabular-nums">
            Review pinned competitions and private notes
          </p>
        </Panel>

        <Panel className="p-5">
          <p className="text-xs text-[#9CA3AF]">Verified Submissions</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#F3F4F6]">
              {data.verifiedSubmissionsCount}
            </span>
            <span className="text-xs text-[#9CA3AF] font-mono tabular-nums">
              {data.evidenceCount} evidence logs
            </span>
          </div>
          <p className="mt-2 text-xs text-[#6B7280]">
            Verified via make.fun API or manual receipt
          </p>
        </Panel>

        <Panel className="p-5">
          <p className="text-xs text-[#9CA3AF]">Received USDC Rewards</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="text-2xl font-semibold font-mono tabular-nums text-[#10B981]">
              {formatUsd(data.rewardSummary.totalReceived)}
            </span>
            <span className="text-xs text-[#9CA3AF] font-mono tabular-nums">
              {formatUsd(data.rewardSummary.totalVerifiedAwarded)} awarded
            </span>
          </div>
          <p className="mt-2 text-xs text-[#6B7280]">
            Separated strictly from open bounty pools
          </p>
        </Panel>
      </div>

      {/* Main Split: Top Open Bounties & Open Pool by Category Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <Panel className="xl:col-span-7 flex flex-col">
          <PanelHeader
            title="Active Open Bounties"
            subtitle="Live read-only competition feed from make.fun"
            actions={
              <Button variant="ghost" size="sm" onClick={onOpenExplorer}>
                <span>Explore All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            }
          />
          {data.topOpenBounties.length === 0 ? (
            <EmptyState
              title="No open bounties synced yet"
              description="Run a read-only sync with make.fun to pull currently open competitions."
              action={
                <Button variant="primary" size="sm" onClick={onSyncNow} disabled={syncing}>
                  Sync make.fun Bounties
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {data.topOpenBounties.map((b) => (
                <div
                  key={b.slug}
                  className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onInspectBounty(b.slug)}
                        className="text-sm font-medium text-[#F3F4F6] hover:text-[#3B82F6] transition-colors text-left truncate cursor-pointer"
                      >
                        {b.title}
                      </button>
                      {b.watchlisted && <Bookmark className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#9CA3AF]">
                      <span>{b.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatUsd(b.potUsd || b.rewardAmount)} pool</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{b.submissionCount} submissions</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{formatRelativeDeadline(b.deadline)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <SyncStateIndicator state={b.syncState} />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onInspectBounty(b.slug)}
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="xl:col-span-5 flex flex-col">
          <PanelHeader
            title="Open Prize Pool by Category"
            subtitle="Announced USDC pools across currently open make.fun bounties"
          />
          <div className="p-5 flex-1 min-h-[280px]">
            {data.categoryBreakdown.length === 0 ? (
              <EmptyState
                title="No category pool data"
                description="Sync open bounties to inspect prize pools across competition categories."
              />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={data.categoryBreakdown}
                  margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="category"
                    tick={{ fill: '#9CA3AF', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#14181E',
                      borderColor: 'rgba(255,255,255,0.12)',
                      borderRadius: '6px',
                      color: '#F3F4F6',
                      fontSize: '12px',
                    }}
                    formatter={(value) => [formatUsd(Number(value ?? 0)), 'Announced Pool']}
                  />
                  <Bar dataKey="openPoolUsd" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>
      </div>

      {/* Bottom Row: Watchlist */}
      <div>
        <Panel>
          <PanelHeader
            title="Watchlisted Bounties"
            subtitle="Competitions pinned by COSMICLABS for deeper study"
            actions={
              <Button variant="ghost" size="sm" onClick={onOpenExplorer}>
                <span>Manage Watchlist</span>
              </Button>
            }
          />
          {data.watchlistedBounties.length === 0 ? (
            <EmptyState
              title="Your watchlist is empty"
              description="Bookmark promising bounties in Bounty Explorer to track them here."
              action={
                <Button variant="secondary" size="sm" onClick={onOpenExplorer}>
                  Browse Bounties
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {data.watchlistedBounties.map((b) => (
                <div key={b.slug} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#F3F4F6] truncate">{b.title}</p>
                    <p className="text-xs text-[#9CA3AF] mt-0.5 font-mono tabular-nums">
                      {b.category} · {formatUsd(b.potUsd || b.rewardAmount)} · {b.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={'https://make.fun/bounty/' + encodeURIComponent(b.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-[#9CA3AF] hover:text-[#F3F4F6] transition-colors"
                      aria-label={`Open ${b.title} on make.fun`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <Button variant="secondary" size="sm" onClick={() => onInspectBounty(b.slug)}>
                      Inspect
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

      </div>
    </div>
  );
};
