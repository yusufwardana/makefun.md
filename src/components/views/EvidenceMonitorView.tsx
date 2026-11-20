import { useEffect, useState } from 'react';
import { Button, Panel, PanelHeader, Select } from '../ui/primitives';
import { fetch } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import type { BountyRecord } from '../../types/command-center';
import type { MakefunRecordings } from '../../types/makefun-monitor';
import { statusLabel, useMakefunAccountMonitor } from './MakefunMonitor';

export function EvidenceMonitorView({ initialSlug, onSubmissions }: { initialSlug: string | null; onSubmissions: () => void }) {
  const account = useMakefunAccountMonitor();
  const snapshot = account.data?.snapshot;
  const connected = account.data?.connection === 'connected';
  const [catalog, setCatalog] = useState<Array<Pick<BountyRecord, 'slug' | 'title'>>>([]);
  const [catalogError, setCatalogError] = useState('');
  const [selectedBounty, setSelectedBounty] = useState('');
  const [recordings, setRecordings] = useState<MakefunRecordings | null>(null);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const choices = new Map(catalog.map(bounty => [bounty.slug, bounty.title]));
  for (const entry of snapshot?.entries ?? []) {
    if (!choices.has(entry.bounty)) choices.set(entry.bounty, entry.bounty);
  }
  if (initialSlug && !choices.has(initialSlug)) choices.set(initialSlug, initialSlug);
  const bounty = selectedBounty || initialSlug || snapshot?.entries[0]?.bounty || choices.keys().next().value || '';
  const entries = snapshot?.entries.filter(entry => entry.bounty === bounty) ?? [];
  const currentRecordings = recordings?.competition === bounty && connected ? recordings : null;

  useEffect(() => {
    const controller = new AbortController();
    async function loadBounties() {
      try {
        const response = await fetch('/api/bounties?status=all', { signal: controller.signal });
        if (!response.ok) throw new Error('Could not load the bounty list.');
        const data = await response.json();
        if (!controller.signal.aborted) setCatalog(data.items ?? []);
      } catch {
        if (!controller.signal.aborted) setCatalogError('Could not load the bounty list.');
      }
    }
    void loadBounties();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setRecordings(null);
    setRecordingError('');
    setLoadingRecordings(connected && Boolean(bounty));
    if (!connected || !bounty) return;
    const controller = new AbortController();
    async function loadRecordings() {
      try {
        const response = await fetch(`/api/makefun/account/recordings?${new URLSearchParams({ competition: bounty })}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not sync recordings from make.fun.');
        if (!controller.signal.aborted) setRecordings(data);
      } catch (error) {
        if (!controller.signal.aborted) setRecordingError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoadingRecordings(false);
      }
    }
    void loadRecordings();
    return () => controller.abort();
  }, [bounty, connected, snapshot?.syncedAt]);

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <h1 className="text-[clamp(1.55rem,3vw,2.25rem)] font-semibold text-ink">Evidence Monitor</h1>
          {snapshot && <p className="mt-1 text-sm text-muted">@{snapshot.handle.replace(/^@/, '')} · Checks synced {formatDateTime(snapshot.syncedAt)}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {account.canSync && <Button variant="primary" size="sm" onClick={account.sync}
            disabled={account.busy || account.data?.syncing || loadingRecordings}>
            {account.busy || account.data?.syncing || loadingRecordings ? 'Syncing…' : 'Sync make.fun'}
          </Button>}
          <Button variant="secondary" size="sm" onClick={onSubmissions}>View submissions</Button>
        </div>
      </header>

      {(account.error || account.data?.error) && <p role="status" className="text-sm text-secondary">{account.error || account.data?.error}</p>}
      {account.data?.connection === 'disconnected' && <p className="text-sm text-secondary">Connect your make.fun account in Settings to see recordings and checks.</p>}
      {!snapshot && !account.error && (!account.data || account.data.connection === 'pending') && <p role="status" className="text-sm text-secondary">Waiting for the make.fun account sync.</p>}

      {(connected || snapshot) && <>
        <label className="block max-w-xl space-y-1 text-sm">
          <span>Bounty</span>
          <Select className="w-full" value={bounty} onChange={event => setSelectedBounty(event.target.value)}>
            <option value="" disabled>Select a bounty</option>
            {[...choices].map(([slug, title]) => <option value={slug} key={slug}>{title}</option>)}
          </Select>
        </label>
        {catalogError && <p className="text-sm text-secondary" role="status">{catalogError}</p>}

        <Panel>
          <PanelHeader title="Official recordings" subtitle={currentRecordings ? `Synced ${formatDateTime(currentRecordings.syncedAt)}` : undefined} />
          <div className="space-y-2 p-4 text-sm text-secondary">
            {recordingError && <p role="status">{recordingError}</p>}
            {loadingRecordings && <p role="status">Loading make.fun recordings…</p>}
            {!connected && <p>Reconnect the account to read recordings.</p>}
            {connected && !bounty && <p>Select a bounty to see its recordings.</p>}
            {currentRecordings && !currentRecordings.recordings.length && <p>make.fun reported no recordings for this bounty.</p>}
            {!!currentRecordings?.recordings.length && <ul className="divide-y divide-line">
              {currentRecordings.recordings.map(recording => <li key={recording.id} className="space-y-1 py-3 [overflow-wrap:anywhere]">
                <p><strong className="text-ink">{recording.sealedAt ? 'Sealed' : 'Open'}</strong> · {recording.chunks} chunks · {recording.documents} documents</p>
                <p className="text-xs text-muted">Started {formatDateTime(recording.startedAt)}{recording.sealedAt && ` · Sealed ${formatDateTime(recording.sealedAt)}`}</p>
                <p className="font-mono text-xs text-muted">{recording.id}</p>
              </li>)}
            </ul>}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Official evidence checks" />
          {!entries.length && <p className="p-4 text-sm text-secondary">No submissions reported for this bounty.</p>}
          <div className="divide-y divide-line">
            {entries.map(entry => {
              const checks = entry.checks.filter(check => /^(transcripts?_|thinking_|entry_signature$|run_)/.test(check.name));
              const failures = checks.filter(check => check.status === 'fail').length;
              return <details className="min-w-0 [overflow-wrap:anywhere]" key={entry.id}>
                <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm text-secondary hover:bg-hover">
                  <span className="capitalize text-ink">{statusLabel(entry.stage)}</span>
                  {entry.outcome && ` · ${statusLabel(entry.outcome)}`}
                  {failures > 0 && <span className="text-danger"> · {failures} failed {failures === 1 ? 'check' : 'checks'}</span>}
                  <span className="mt-1 block pl-4 font-mono text-xs text-muted">{entry.id}</span>
                </summary>
                <div className="space-y-1 px-4 pb-4 text-sm text-secondary">
                  {!checks.length && <p>No evidence checks reported for this submission.</p>}
                  {!!checks.length && <ul className="space-y-2">
                    {[...checks].sort((first, second) => Number(second.status === 'fail') - Number(first.status === 'fail')).map((check, index) =>
                      <li key={`${check.name}-${index}`}><code>{check.name}</code> · <strong className={check.status === 'fail' ? 'text-danger' : ''}>{check.status}</strong>
                        {check.reason && <p>{check.reason}</p>}
                      </li>)}
                  </ul>}
                </div>
              </details>;
            })}
          </div>
        </Panel>
      </>}
    </div>
  );
}
