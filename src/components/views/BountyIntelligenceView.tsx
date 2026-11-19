import { useEffect, useState, type ReactNode } from 'react';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { Button, Panel, Select, SyncStateIndicator, Textarea } from '../ui/primitives';
import { fetch } from '../../lib/api';
import { formatDateTime, formatUsd } from '../../lib/utils';
import { museBootstrap } from '../../lib/muse-bootstrap';
import type { MusePackage } from '../../types/muse-package';
import type { BountyRecord, LeaderboardGapInsights } from '../../types/command-center';

const unavailable = 'Unavailable in this snapshot';
const freshness = {
  LIVE: 'Recent official competition detail and requirements.',
  STALE: 'Official snapshot is more than six hours old.',
  OFFLINE: 'The latest connection to make.fun failed. Showing cached data where available.',
  UNVERIFIED: 'The official detail, prompt, requirements, or timestamp could not be verified.',
};

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open || undefined} className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer rounded-lg px-4 py-3 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-accent">{title}</summary>
      <div className="min-w-0 space-y-3 border-t border-line p-4 text-sm text-secondary [overflow-wrap:anywhere]">{children}</div>
    </details>
  );
}

function OfficialLink({ url, children }: { url: string; children: ReactNode }) {
  return <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent underline underline-offset-4">
    {children}<ExternalLink className="size-3 shrink-0" aria-hidden="true" />
  </a>;
}

function CheckList({ checks }: { checks: MusePackage['recordingRequirements'] }) {
  if (!checks) return <p>{unavailable}.</p>;
  if (!checks.length) return <p>No matching checks listed in this snapshot.</p>;
  return <ul className="divide-y divide-line">
    {checks.map((check, index) => <li key={index} className="py-2">
      <p className="font-medium">{check.title || check.check} <span className="text-xs text-muted">
        · {check.applies === true ? 'Applies' : check.applies === false ? 'Marked not applicable' : 'Applicability unspecified'}
        {check.phase && ' · ' + check.phase}</span></p>
      {check.description && <p className="whitespace-pre-wrap">{check.description}</p>}
    </li>)}
  </ul>;
}

interface Detail {
  bounty: BountyRecord;
  intelligence: MusePackage;
  leaderboardInsights: LeaderboardGapInsights | null;
  refreshError?: string;
}

export function BountyIntelligenceView({ initialSlug, onSelect, onBack, onEvidence, onDataMutated }: {
  initialSlug: string | null;
  onSelect: (slug: string) => void;
  onBack: () => void;
  onEvidence: () => void;
  onDataMutated: () => void;
}) {
  const [choices, setChoices] = useState<Array<Pick<BountyRecord, 'slug' | 'title'>>>([]);
  const [listError, setListError] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [noteStatus, setNoteStatus] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const selected = detail?.bounty.slug === initialSlug ? detail : null;
  const pkg = selected?.intelligence;

  useEffect(() => {
    const controller = new AbortController();
    async function loadChoices() {
      try {
        const response = await fetch('/api/bounties', { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load the bounty list.');
        setChoices(data.items || []);
        if (data.syncWarning) setListError(data.syncWarning);
      } catch (error) {
        if (!controller.signal.aborted) setListError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) setListLoading(false);
      }
    }
    void loadChoices();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setDetailError('');
    setNoteStatus('');
    setExportStatus('');
    if (!initialSlug) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const response = await fetch('/api/bounties/' + encodeURIComponent(initialSlug!) +
          (refresh ? '?refresh=1' : ''), { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load official details.');
        if (controller.signal.aborted) return;
        setDetail(data);
        setNotes(data.bounty.founderNotes);
      } catch (error) {
        if (!controller.signal.aborted) setDetailError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [initialSlug, refresh]);

  async function saveNotes() {
    setSaving(true);
    setNoteStatus('');
    try {
      const response = await fetch('/api/bounties/' + encodeURIComponent(initialSlug!) + '/notes', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ founderNotes: notes }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not save notes.');
      setNoteStatus('Notes saved.');
      onDataMutated();
    } catch (error) {
      setNoteStatus((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function download(format: 'json' | 'markdown') {
    if (!pkg) return;
    setExporting(true);
    setExportStatus('');
    try {
      const params = new URLSearchParams({ format, checksum: pkg.sourceProvenance.contentChecksum });
      const response = await fetch('/api/bounties/' + encodeURIComponent(pkg.bounty.slug) + '/muse-export?' + params);
      if (!response.ok) throw new Error((await response.json()).error || 'Could not export this bounty.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = format === 'json' ? 'MUSE_BOUNTY_CONTEXT.json' : 'MUSE_BOUNTY_CONTEXT.md';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setExportStatus('Download prepared.');
    } catch (error) {
      setExportStatus((error as Error).message);
    } finally {
      setExporting(false);
    }
  }

  async function copyBootstrap() {
    try {
      await navigator.clipboard.writeText(museBootstrap);
      setExportStatus('Muse bootstrap copied.');
    } catch {
      setExportStatus('Clipboard unavailable. Select and copy the bootstrap text below.');
    }
  }

  const provenance = pkg?.sourceProvenance;
  const payout = pkg?.bounty.payout;
  const selectOptions = initialSlug && !choices.some(item => item.slug === initialSlug)
    ? [{ slug: initialSlug, title: selected?.bounty.title || initialSlug }, ...choices] : choices;

  return (
    <div className="min-w-0 space-y-5">
      <header className="space-y-3 border-b border-line pb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>Back to Bounty Explorer</Button>
        <h1 className="text-[clamp(1.55rem,3vw,2.25rem)] font-semibold text-ink">Bounty Intelligence &amp; Muse Handoff</h1>
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-full max-w-lg space-y-1 text-sm text-secondary">
            <span>Competition</span>
            <Select className="w-full" value={initialSlug ?? ''} disabled={exporting || saving}
              onChange={event => { setRefresh(0); onSelect(event.target.value); }}>
              <option value="" disabled>{listLoading ? 'Loading competitions…' : 'Select a competition'}</option>
              {selectOptions.map(item => <option key={item.slug} value={item.slug}>{item.title}</option>)}
            </Select>
          </label>
          <Button variant="secondary" disabled={!initialSlug || loading || exporting || saving} onClick={() => setRefresh(value => value + 1)}>
            <RefreshCw className="size-4" aria-hidden="true" /> Refresh official details
          </Button>
        </div>
        {listError && <p className="text-sm text-warning" role="status">{listError}</p>}
        {detailError && <p className="text-sm text-danger" role="alert">{detailError}</p>}
        {loading && <p className="text-sm text-secondary" role="status">Loading official details…</p>}
        {!initialSlug && !listLoading && <p className="text-sm text-secondary">
          {choices.length ? 'Select a competition to inspect its requirements.' : 'Sync competitions from Bounty Explorer to get started.'}
        </p>}
      </header>

      {pkg && provenance && payout && (
        <>
          <Panel className="min-w-0 space-y-4 p-4 sm:p-5 [overflow-wrap:anywhere]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{pkg.bounty.title}</h2>
                <OfficialLink url={pkg.bounty.url}>Official make.fun page</OfficialLink>
              </div>
              <SyncStateIndicator state={provenance.status} />
            </div>
            <dl className="grid grid-cols-2 gap-3 border-y border-line py-3 text-sm sm:grid-cols-4">
              {[
                ['Status', pkg.bounty.status ?? unavailable],
                ['Entry deadline', pkg.bounty.deadline ? formatDateTime(pkg.bounty.deadline) : unavailable],
                ['Prize pool', pkg.bounty.prizePoolUsd === null ? unavailable : formatUsd(Number(pkg.bounty.prizePoolUsd))],
                ['Submissions', pkg.bounty.submissionCount ?? unavailable],
              ].map(([label, value]) => <div key={label}><dt className="text-muted">{label}</dt><dd className="font-medium">{value}</dd></div>)}
            </dl>
            <p className="text-sm text-secondary">{freshness[provenance.status]}</p>
            {selected.refreshError && <p className="text-sm text-warning" role="status">{selected.refreshError}</p>}
          </Panel>

          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,25rem)]">
            <div className="min-w-0 space-y-3">
              <Section title="Official prompt" open>
                <p className="whitespace-pre-wrap">{pkg.officialPrompt ?? unavailable}</p>
              </Section>
              <Section title="Official rules and restrictions">
                {pkg.officialRules ? [pkg.officialRules.text, pkg.officialRules.addendum, ...(pkg.officialRules.current || [])]
                  .filter(Boolean).map((text, index) => <p key={index} className="whitespace-pre-wrap">{text}</p>) : <p>{unavailable}.</p>}
                {pkg.officialRequirements?.quotaRule && <p>{pkg.officialRequirements.quotaRule}</p>}
                <CheckList checks={pkg.officialRequirements?.checks ?? null} />
              </Section>
              <Section title="Deliverables and submission requirements">
                {pkg.deliverables ? <ul className="divide-y divide-line">{pkg.deliverables.map((item, index) =>
                  <li key={index} className="py-2">
                    <span className="font-medium">{item.name}</span> · {item.required === true ? 'Required' : item.required === false ? 'Optional' : 'Requirement unspecified'}
                    {item.description && <p className="whitespace-pre-wrap">{item.description}</p>}
                  </li>)}</ul> : <p>{unavailable}.</p>}
                {pkg.submissionRequirements?.fields && <p>Submission fields · {pkg.submissionRequirements.fields.join(', ')}</p>}
                {pkg.submissionRequirements?.repositoryAbout?.description && <p>{pkg.submissionRequirements.repositoryAbout.description}</p>}
              </Section>
              <Section title="Judging criteria">
                {pkg.judgingCriteria?.summary && <p className="whitespace-pre-wrap">{pkg.judgingCriteria.summary}</p>}
                {pkg.judgingCriteria?.criteria?.length ? <ul className="list-disc space-y-2 pl-5">{pkg.judgingCriteria.criteria.map((item, ix) =>
                  <li key={ix} className="whitespace-pre-wrap">{item}</li>)}</ul> : <p>Structured criteria unavailable.</p>}
                {pkg.judgingCriteria?.tieBreak && <p>Tie break · {pkg.judgingCriteria.tieBreak}</p>}
              </Section>
              <Section title="Prerequisites">
                {pkg.prerequisites?.summary && <p>{pkg.prerequisites.summary}</p>}
                {(['software', 'accounts', 'mcp'] as const).map(group =>
                  <div key={group}><h3 className="font-medium capitalize">{group === 'mcp' ? 'MCP' : group}</h3>
                    {pkg.prerequisites?.[group]?.length ? <ul className="space-y-2">{pkg.prerequisites[group].map((item, ix) =>
                      <li key={ix}>
                        {item.name}{item.version && ' · ' + item.version} · {item.required === true ? 'Required' : item.required === false ? 'Optional' : 'Requirement unspecified'}
                        {item.why && <p>{item.why}</p>}{item.howToCheck && <p>Check · {item.howToCheck}</p>}
                      </li>)}</ul> : <p>{pkg.prerequisites?.[group] === null || !pkg.prerequisites ? unavailable : 'No entries listed.'}</p>}
                  </div>)}
                {pkg.prerequisites?.ifUnmet && <p>{pkg.prerequisites.ifUnmet}</p>}
              </Section>
              <Section title="Competition Kit">
                {pkg.competitionKit ? <>
                  <div className="flex flex-wrap gap-4">
                    {pkg.competitionKit.manifestUrl && <OfficialLink url={pkg.competitionKit.manifestUrl}>Official manifest</OfficialLink>}
                    {pkg.competitionKit.downloadUrl && <OfficialLink url={pkg.competitionKit.downloadUrl}>Kit download</OfficialLink>}
                    {pkg.competitionKit.finalManifestUrl && <OfficialLink url={pkg.competitionKit.finalManifestUrl}>Final phase manifest</OfficialLink>}
                    {pkg.competitionKit.finalDownloadUrl && <OfficialLink url={pkg.competitionKit.finalDownloadUrl}>Final phase kit</OfficialLink>}
                  </div>
                  {pkg.competitionKit.phase && <p>Manifest phase · {pkg.competitionKit.phase}</p>}
                  {pkg.competitionKit.files ? <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Manifest files">
                    {pkg.competitionKit.files.map((file, ix) => <li key={ix} className="font-mono text-xs">
                      {file.path}{file.size !== null && ' · ' + file.size.toLocaleString() + ' bytes'}
                    </li>)}
                  </ul> : <p>Kit manifest contents are unavailable.</p>}
                </> : <p>{unavailable}.</p>}
              </Section>
              <Section title="Leaderboard and competitor comparison">
                {pkg.leaderboardContext ? <>
                  <p>{pkg.leaderboardContext.snapshotRankedCount} returned rows · {pkg.leaderboardContext.metric}
                    {pkg.leaderboardContext.phase && ' · ' + pkg.leaderboardContext.phase}</p>
                  {selected.leaderboardInsights?.gapSummary && <p>{selected.leaderboardInsights.gapSummary}</p>}
                  <ul className="space-y-1">{pkg.leaderboardContext.topEntries.map((item, ix) =>
                    <li key={ix}>#{item.rank ?? '?'} · @{item.handle} · {item.title} · {item.metric}</li>)}</ul>
                </> : <p>{unavailable}.</p>}
              </Section>
              <Section title="Payout schedule">
                {payout.rail && <p>Rail · {payout.rail}</p>}
                {payout.claimDeadline && <p>Claim deadline · {formatDateTime(payout.claimDeadline)}</p>}
                {payout.announcement && <p>{payout.announcement}</p>}
                {payout.places?.length ? <ol className="space-y-1">{payout.places.map((place, ix) =>
                  <li key={ix}>Place {place.place} · {place.amountUsd === null ? unavailable : formatUsd(Number(place.amountUsd))}</li>)}</ol> : <p>No payout schedule in this snapshot.</p>}
              </Section>
              <Section title="Recording and provenance requirements">
                <p>Evidence Monitor provides a preliminary local check. Official validation is performed by make.fun.</p>
                <CheckList checks={pkg.recordingRequirements} />
              </Section>
            </div>

            <aside className="min-w-0 space-y-3">
              <Panel className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Export to Muse</h2>
                <p className="text-sm text-secondary">Download the package and provide it to your existing MUSE BOUNTY AGENT workspace for verification.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" className="bg-accent hover:bg-accent-hover" disabled={exporting || loading} onClick={() => download('json')}>
                    <Download className="size-3.5" aria-hidden="true" /> Download JSON
                  </Button>
                  <Button variant="secondary" size="sm" disabled={exporting || loading} onClick={() => download('markdown')}>Download Markdown</Button>
                  <Button variant="ghost" size="sm" onClick={copyBootstrap}>Copy Muse Bootstrap Instructions</Button>
                </div>
                <p className="text-sm text-secondary" role="status">{exportStatus}</p>
                <details className="text-sm text-secondary">
                  <summary className="cursor-pointer">View bootstrap instructions</summary>
                  <p className="mt-2 whitespace-pre-wrap">{museBootstrap}</p>
                </details>
                <Button variant="secondary" size="sm" onClick={onEvidence}>Review evidence</Button>
              </Panel>
              <Section title="Sources and missing information" open>
                <p>Snapshot fetched · {provenance.fetchedAt ? formatDateTime(provenance.fetchedAt) : unavailable}</p>
                <p>Bounty record last synced · {provenance.recordLastSyncedAt ? formatDateTime(provenance.recordLastSyncedAt) : unavailable}</p>
                <ul className="space-y-1">{([
                  ['Competition', provenance.competitionUrl], ['Requirements', provenance.requirementsUrl],
                  ['Kit manifest', provenance.kitUrl], ['Leaderboard', provenance.leaderboardUrl],
                ] as const).map(([label, url]) => <li key={label}>
                  {url ? <OfficialLink url={url}>{label}</OfficialLink> : <span>{label} · {unavailable}</span>}
                </li>)}</ul>
                {provenance.snapshotId && <p className="break-all text-xs">Snapshot ID · {provenance.snapshotId}</p>}
                {pkg.missingInformation.length > 0 && <>
                  <h3 className="font-medium">Verify on make.fun</h3>
                  <ul className="list-disc space-y-1 pl-5">{pkg.missingInformation.map(item => <li key={item}>{item}</li>)}</ul>
                </>}
              </Section>
              <Section title="Watchlist notes">
                <label className="block space-y-2">
                  <span>Private notes for this bounty</span>
                  <Textarea className="w-full" rows={4} value={notes} onChange={event => setNotes(event.target.value)} />
                </label>
                <Button variant="secondary" size="sm" disabled={saving || loading} onClick={saveNotes}>Save notes</Button>
                {noteStatus && <p role="status">{noteStatus}</p>}
              </Section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
