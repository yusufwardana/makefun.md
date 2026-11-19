import { useState, type FormEvent } from 'react';
import { ArrowRight, Bookmark, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { Button, EmptyState, Input, Panel, PanelHeader, SyncStateIndicator } from '../ui/primitives';
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
  onOpenExplorer: (query?: string, watchlist?: boolean) => void;
  onInspectBounty: (slug: string) => void;
}

const wholeNumber = new Intl.NumberFormat();

export function OverviewView({ data, loading, syncing, error, onSyncNow, onOpenExplorer, onInspectBounty }: OverviewViewProps) {
  const [query, setQuery] = useState('');

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onOpenExplorer(query.trim());
  }

  const categories = data?.categoryBreakdown ?? [];
  const maxPool = Math.max(1, ...categories.map(category => category.openPoolUsd));

  return (
    <div className="min-w-0 space-y-7">
      <section aria-labelledby="overview-title" className="grid items-center gap-8 border-b border-line pb-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-10 lg:pb-10">
        <div className="min-w-0">
          <h1 id="overview-title" className="max-w-[15ch] text-[clamp(2.1rem,5vw,3.6rem)] font-semibold leading-[1.04] tracking-[-0.055em]">
            Find your next <span className="text-accent">bounty.</span>
          </h1>
          <p className="mt-4 max-w-[54ch] text-sm leading-relaxed text-secondary sm:text-base">
            Search make.fun competitions, check the official rules, and hand off the bounty context to Muse.
          </p>
          <form onSubmit={search} className="mt-6 flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-52">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-muted" />
              <Input aria-label="Search bounties" value={query} onChange={event => setQuery(event.target.value)}
                placeholder="Title, skill, or category" className="min-h-12 pl-11" />
            </div>
            <Button type="submit" variant="primary" className="min-h-12">Search bounties</Button>
          </form>
        </div>

        <Panel className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Bounty feed</h2>
            <Button variant="ghost" size="sm" onClick={onSyncNow} disabled={syncing}>
              <RefreshCw aria-hidden="true" className={syncing ? 'size-4 animate-spin' : 'size-4'} />
              {syncing ? 'Syncing make.fun' : 'Sync make.fun'}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted">
            {data?.lastGlobalSyncAt ? 'Last synced ' + formatDateTime(data.lastGlobalSyncAt) : 'No recorded sync yet'}
            {data?.settings.accountHandle && ' · ' + data.settings.accountHandle}
          </p>
          {data ? (
            <dl className="mt-3 divide-y divide-line text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                <dt className="text-secondary">Open bounties</dt>
                <dd className="text-right font-mono text-xs"><strong>{wholeNumber.format(data.openBountiesCount)}</strong> <span className="text-muted">/ {wholeNumber.format(data.totalSyncedBounties)} synced</span></dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                <dt className="text-secondary">Open prize pool</dt>
                <dd className="font-mono text-xs font-semibold">{formatUsd(data.openPoolTotalUsd)}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                <dt className="text-secondary">Verified submissions</dt>
                <dd className="font-mono text-xs"><strong>{wholeNumber.format(data.verifiedSubmissionsCount)}</strong> <span className="text-muted">· {wholeNumber.format(data.evidenceCount)} evidence logs</span></dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-2">
                <dt className="text-secondary">USDC received</dt>
                <dd className="font-mono text-xs"><strong className="text-success">{formatUsd(data.rewardSummary.totalReceived)}</strong> <span className="text-muted">· {formatUsd(data.rewardSummary.totalVerifiedAwarded)} awarded</span></dd>
              </div>
            </dl>
          ) : loading && (
            <div role="status" aria-label="Loading overview" className="mt-4 space-y-3">
              {[0, 1, 2, 3].map(row => <div key={row} className="h-6 animate-pulse rounded-md bg-quiet" />)}
            </div>
          )}
        </Panel>
      </section>

      {error && <p className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning" role="status">{error}</p>}

      {data && (
        <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <Panel className="min-w-0">
            <PanelHeader title="Open bounties" subtitle="Official make.fun competition feed"
              actions={<Button variant="ghost" size="sm" onClick={() => onOpenExplorer()}>
                View catalog <ArrowRight className="size-4" aria-hidden="true" />
              </Button>} />
            {!data.topOpenBounties.length ? (
              <EmptyState title="No open bounties in the feed" description="Sync with make.fun to populate the catalog."
                action={<Button size="sm" onClick={onSyncNow} disabled={syncing}>Sync bounties</Button>} />
            ) : (
              <ul className="divide-y divide-line">
                {data.topOpenBounties.map(bounty => (
                  <li key={bounty.slug} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors hover:bg-hover/60 sm:px-5">
                    <div className="min-w-0">
                      <button type="button" onClick={() => onInspectBounty(bounty.slug)}
                        className="min-h-8 cursor-pointer text-left text-sm font-semibold text-ink hover:text-accent">
                        {bounty.title}
                      </button>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-muted">
                        {bounty.watchlisted && <Bookmark aria-label="Watchlisted" className="size-3.5 shrink-0 text-warning" />}
                        {bounty.category} · {formatUsd(bounty.potUsd || bounty.rewardAmount)} pool
                        <span>· {wholeNumber.format(bounty.submissionCount)} submissions</span>
                        <span>· {formatRelativeDeadline(bounty.deadline)}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <SyncStateIndicator state={bounty.syncState} />
                      <Button variant="secondary" size="sm" aria-label={'Inspect ' + bounty.title} onClick={() => onInspectBounty(bounty.slug)}>Inspect</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="min-w-0 space-y-6">
            <Panel>
              <PanelHeader title="Watchlist" subtitle={wholeNumber.format(data.watchlistedCount) + ' saved bounties'}
                actions={<Button variant="ghost" size="sm" onClick={() => onOpenExplorer('', true)}>View watchlist</Button>} />
              {!data.watchlistedBounties.length ? (
                <EmptyState title="Your watchlist is empty" description="Save a bounty from Explorer to find it here again." />
              ) : (
                <ul className="divide-y divide-line">
                  {data.watchlistedBounties.map(bounty => (
                    <li key={bounty.slug} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <button type="button" onClick={() => onInspectBounty(bounty.slug)}
                          className="min-h-8 cursor-pointer text-left text-sm font-semibold hover:text-accent">{bounty.title}</button>
                        <p className="text-xs text-muted">{bounty.category} · {formatUsd(bounty.potUsd || bounty.rewardAmount)} · {bounty.status}</p>
                      </div>
                      <a href={'https://make.fun/bounty/' + encodeURIComponent(bounty.slug)} target="_blank" rel="noreferrer"
                        className="grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-hover hover:text-accent"
                        aria-label={`Open ${bounty.title} on make.fun`}>
                        <ExternalLink className="size-4" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Open prize pool by category" subtitle="Announced amounts in USDC" />
              {!categories.length ? (
                <EmptyState title="No category pool data" description="Sync open bounties to see the prize pool by category." />
              ) : (
                <ul className="space-y-4 p-4 sm:p-5">
                  {categories.map(category => (
                    <li key={category.category}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="break-words font-medium">{category.category}</span>
                        <span className="shrink-0 font-mono text-secondary">{formatUsd(category.openPoolUsd)}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-quiet" aria-hidden="true">
                        <div className="h-full rounded-full bg-accent" style={{ width: Math.max(0, 100 * category.openPoolUsd / maxPool) + '%' }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
