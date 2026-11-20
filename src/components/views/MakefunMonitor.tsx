import { useEffect, useRef, useState } from 'react';
import { fetch } from '../../lib/api';
import { formatDateTime, formatUsd } from '../../lib/utils';
import type { MakefunAccountMonitor, MakefunWatchlistMonitor } from '../../types/makefun-monitor';
import { Button, Input, Panel, PanelHeader } from '../ui/primitives';

const accountUrl = '/api/makefun/account';
const watchlistUrl = '/api/makefun/watchlist';

function useMonitor<T>(url: string, sessionToken = '') {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);

  async function load(route = url, options?: RequestInit) {
    if (active.current && !options) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    if (options) setBusy(true);
    try {
      const response = await fetch(route, { ...options, signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not load the make.fun monitor.');
      if (controller.signal.aborted) return;
      setData(result);
      setError('');
      return true;
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (!options) setData(null);
        setError((failure as Error).message);
      }
      return false;
    } finally {
      if (active.current === controller) {
        active.current = null;
        if (options) setBusy(false);
      }
    }
  }

  useEffect(() => {
    setData(null);
    setBusy(false);
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      window.clearInterval(timer);
      active.current?.abort();
      active.current = null;
    };
  }, [url, sessionToken]);

  return { data, error, busy, load };
}

const connectionLabels: Record<MakefunAccountMonitor['connection'], string> = {
  disconnected: 'Account not connected',
  connected: 'Connected',
  pending: 'Waiting for account sync',
  expired: 'API key expired',
  invalid: 'API key rejected',
};

function canSyncAccount(data: MakefunAccountMonitor) {
  return data.connection === 'connected' || data.connection === 'pending';
}

export function MakefunConnectionPanel({ sessionToken, onConnected }: { sessionToken: string; onConnected: () => void }) {
  const [key, setKey] = useState('');
  const { data, error, busy, load } = useMonitor<MakefunAccountMonitor>(accountUrl, sessionToken);
  const connected = data && data.connection !== 'disconnected';
  return <Panel>
    <PanelHeader title="Connect make.fun" />
    <form className="space-y-3 p-4" onSubmit={async event => {
      event.preventDefault();
      const saved = await load(accountUrl, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key.trim() }),
      });
      if (saved) {
        setKey('');
        onConnected();
      }
    }}>
      <p className="text-sm text-secondary">
        {data ? connectionLabels[data.connection] : error ? 'Connection unavailable' : 'Checking connection…'}
        {data?.snapshot && ` · @${data.snapshot.handle.replace(/^@/, '')}`}
      </p>
      {data?.snapshot && <p className="text-xs text-muted">Last sync · {formatDateTime(data.snapshot.syncedAt)}</p>}
      <label className="block space-y-2 text-sm">
        <span>make.fun API key</span>
        <Input className="w-full" type="password" autoComplete="new-password" placeholder="af_…"
          value={key} maxLength={512} required disabled={busy} onChange={event => setKey(event.target.value)} />
      </label>
      <a href="https://make.fun/profile?tab=keys" target="_blank" rel="noreferrer" className="inline-block text-sm text-accent underline">
        Open API keys on make.fun
      </a>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" type="submit" disabled={busy || !key.trim()}>{connected ? 'Replace API key' : 'Connect account'}</Button>
        {connected && <>
          {canSyncAccount(data) && <Button variant="secondary" type="button" disabled={busy || data.syncing} onClick={() => void load(`${accountUrl}/sync`, { method: 'POST' })}>Sync now</Button>}
          <Button variant="ghost" type="button" disabled={busy || data.syncing} onClick={() => void load(accountUrl, { method: 'DELETE' })}>Disconnect</Button>
        </>}
      </div>
      {(error || data?.error || busy) && <p className="text-sm text-secondary" role="status">{error || data?.error || 'Working…'}</p>}
    </form>
  </Panel>;
}

export function statusLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export function useMakefunAccountMonitor() {
  const monitor = useMonitor<MakefunAccountMonitor>(accountUrl);
  return {
    ...monitor,
    canSync: Boolean(monitor.data && canSyncAccount(monitor.data)),
    sync: () => monitor.load(`${accountUrl}/sync`, { method: 'POST' }),
  };
}

export function MakefunOfficialRewards() {
  const { data, error, busy, canSync, sync } = useMakefunAccountMonitor();
  const snapshot = data?.snapshot;
  const connected = data && data.connection !== 'disconnected';
  return <Panel>
    <PanelHeader title="Official make.fun rewards" />
    <div className="space-y-3 p-4 text-sm text-secondary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>{snapshot ? `@${snapshot.handle.replace(/^@/, '')} · Last sync ${formatDateTime(snapshot.syncedAt)}`
          : connected ? connectionLabels[data.connection] : error ? 'Account unavailable' : data ? 'Connect your make.fun account in Settings.' : 'Loading account…'}</p>
        {canSync && <Button variant="secondary" size="sm" disabled={busy || data?.syncing} onClick={sync}>
          {busy || data?.syncing ? 'Syncing…' : 'Sync now'}
        </Button>}
      </div>
      {(error || data?.error) && <p role="status">{error || data?.error}</p>}
      {snapshot && <>
        {!snapshot.rewards.length && <p>No rewards reported by make.fun.</p>}
        <ul className="divide-y divide-line">
          {snapshot.rewards.map(reward => <li key={reward.id} className="space-y-1 py-2 [overflow-wrap:anywhere]">
            <p><strong className="text-ink">{reward.title}</strong>{reward.place !== null && ` · Place ${reward.place}`}</p>
            <p>{reward.amountUsd !== null && Number.isFinite(Number(reward.amountUsd)) ? formatUsd(Number(reward.amountUsd)) : 'USD amount unavailable'} · {statusLabel(reward.status)}</p>
            {reward.claimDeadline && <p className="text-xs text-muted">Claim deadline · {formatDateTime(reward.claimDeadline)}</p>}
          </li>)}
        </ul>
      </>}
    </div>
  </Panel>;
}

export function MakefunWatchlist() {
  const { data, error, busy, load } = useMonitor<MakefunWatchlistMonitor>(watchlistUrl);
  return <Panel>
    <PanelHeader title="Watchlist monitor" />
    <div className="space-y-3 p-4 text-sm text-secondary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>{data?.lastSyncAt ? `Last sync · ${formatDateTime(data.lastSyncAt)}` : 'Public make.fun standings'}</p>
        <Button variant="secondary" size="sm" disabled={!data?.items.length || busy || data.syncing} onClick={() => void load(`${watchlistUrl}/sync`, { method: 'POST' })}>
          {busy || data?.syncing ? 'Syncing…' : 'Sync watchlist now'}
        </Button>
      </div>
      {(error || data?.error) && <p role="status">{error || data?.error}</p>}
      {data?.items.length === 0 && <p>Add a bounty to your watchlist to monitor it.</p>}
      <ul className="divide-y divide-line">
        {data?.items.map(item => <li key={item.slug} className="space-y-1 py-2 [overflow-wrap:anywhere]">
          <p className="font-medium text-ink">{item.title}</p>
          <p>{item.acceptingSubmissions === null ? statusLabel(item.status) : item.acceptingSubmissions ? 'Accepting submissions' : 'Submissions closed'}
            {item.deadline && ` · Deadline ${formatDateTime(item.deadline)}`}</p>
          <p>@{data.handle.replace(/^@/, '')} · {item.rank !== null ? `Rank #${item.rank}` : item.rankAvailable ? 'No public rank found' : 'Leaderboard unavailable'}
            {item.syncedAt && ` · Checked ${formatDateTime(item.syncedAt)}`}</p>
        </li>)}
      </ul>
    </div>
  </Panel>;
}
