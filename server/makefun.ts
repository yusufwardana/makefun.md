import crypto from 'crypto';
import { crud } from './crud.ts';
import { bountySlugSchema } from '../src/types/muse-package.ts';
import type {
  BountyRecord,
  BountySnapshot,
  LeaderboardEntryInsight,
  LeaderboardGapInsights,
  PrerequisitesData,
  SyncState,
} from '../src/types/command-center.ts';

const MAKEFUN_BASE = 'https://make.fun';
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

interface MakefunCompetitionListItem {
  id?: string;
  slug: string;
  title?: string;
  url?: string;
  rewardAmount?: number;
  potUsd?: string | number;
  entryFeeUsd?: number | null;
  deadline?: string | null;
  publishedAt?: string | null;
  status?: string;
  submissionCount?: number;
  sponsor?: {
    name?: string | null;
    slug?: string | null;
    isVerified?: boolean;
  } | null;
  category?: string;
  skills?: string[];
  description?: string;
  summary?: string | null;
  harnessKind?: string | null;
  acceptingSubmissions?: boolean;
  demo?: boolean;
  prerequisites?: PrerequisitesData | null;
  submissions?: Array<{
    id?: string;
    hunter?: string;
    title?: string;
    status?: string;
    score?: unknown;
    createdAt?: string;
    link?: string;
  }>;
}

async function fetchJsonReadOnly(url: string, timeoutMs = 12000): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'COSMICLABS-CommandCenter/1.0 (read-only)',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : 'Network error',
    };
  } finally {
    clearTimeout(timer);
  }
}

function hashContent(input: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(input ?? '')).digest('hex').slice(0, 16);
}

export function extractOfficialPromptText(
  competition: Record<string, unknown> | null,
  requirements: Record<string, unknown> | null
): string {
  const parts: string[] = [];
  if (competition) {
    if (typeof competition.title === 'string' && competition.title.trim()) {
      parts.push(`# ${competition.title.trim()}`);
    }
    if (typeof competition.summary === 'string' && competition.summary.trim()) {
      parts.push(`## Official Summary\n${competition.summary.trim()}`);
    }
    if (typeof competition.description === 'string' && competition.description.trim()) {
      parts.push(`## Official Description & Prompt\n${competition.description.trim()}`);
    }
    if (typeof competition.rules === 'string' && competition.rules.trim()) {
      parts.push(`## Official Rules\n${competition.rules.trim()}`);
    }
    if (competition.rulesNote && typeof competition.rulesNote === 'object') {
      const note = competition.rulesNote as { text?: string; current?: string[] };
      const noteLines = [note.text, ...(Array.isArray(note.current) ? note.current : [])].filter(Boolean);
      if (noteLines.length > 0) {
        parts.push(`## Rules Addendum\n${noteLines.join('\n')}`);
      }
    }
  }
  if (requirements) {
    const deliverables = requirements.deliverables;
    if (Array.isArray(deliverables) && deliverables.length > 0) {
      const lines = deliverables.map((d) => {
        const item = d as { name?: string; kind?: string; required?: boolean; description?: string };
        return `- ${item.name || 'item'} (${item.kind || 'field'}, ${item.required ? 'required' : 'optional'}): ${item.description || ''}`;
      });
      parts.push(`## Deliverables (from /requirements)\n${lines.join('\n')}`);
    }
  }
  return parts.join('\n\n').trim();
}

function upsertBountyFromItem(item: MakefunCompetitionListItem, syncState: SyncState, nowIso: string): void {
  const fullUrl = item.url?.startsWith('http')
    ? item.url
    : `${MAKEFUN_BASE}${item.url || `/bounty/${item.slug}`}`;

  const potNum =
    typeof item.potUsd === 'number'
      ? item.potUsd
      : typeof item.potUsd === 'string'
        ? parseFloat(item.potUsd) || Number(item.rewardAmount || 0)
        : Number(item.rewardAmount || 0);

  crud.upsertBounty({
    slug: item.slug,
    id: item.id || item.slug,
    title: item.title || item.slug,
    url: fullUrl,
    category: item.category || 'Uncategorized',
    skills: Array.isArray(item.skills) ? item.skills : [],
    rewardAmount: Number(item.rewardAmount || 0),
    potUsd: potNum,
    entryFeeUsd: item.entryFeeUsd ?? null,
    deadline: item.deadline ?? null,
    publishedAt: item.publishedAt ?? null,
    status: item.status || (item.acceptingSubmissions ? 'open' : 'resolved'),
    submissionCount: Number(item.submissionCount || 0),
    sponsorName: item.sponsor?.name ?? null,
    sponsorVerified: Boolean(item.sponsor?.isVerified),
    summary: item.summary ?? null,
    harnessKind: item.harnessKind ?? null,
    acceptingSubmissions: item.acceptingSubmissions ?? item.status === 'open',
    isDemo: Boolean(item.demo),
    syncState,
    lastSyncedAt: nowIso,
    prerequisites: item.prerequisites ?? null,
  });
}

function recordMatchingAccountSubmissions(
  slug: string,
  competition: Record<string, unknown> | null,
  leaderboard: Record<string, unknown> | null,
  nowIso: string
): void {
  const configuredHandle = crud.getSettingValue('accountHandle').replace(/^@/, '').trim().toLowerCase();
  if (!configuredHandle) return;

  const subs = Array.isArray(competition?.submissions)
    ? (competition?.submissions as Array<Record<string, unknown>>)
    : [];

  for (const sub of subs) {
    const hunter = String(sub.hunter || '').toLowerCase();
    if (hunter === configuredHandle) {
      const subId = String(sub.id || `${slug}-${hunter}-${sub.createdAt || nowIso}`);
      const rawStatus = String(sub.status || 'submitted').toLowerCase();
      const mappedStatus =
        rawStatus === 'passed' || rawStatus === 'accepted'
          ? 'accepted'
          : rawStatus === 'rejected' || rawStatus === 'failed'
            ? 'rejected'
            : rawStatus === 'awarded'
              ? 'awarded'
              : rawStatus === 'judged'
                ? 'judged'
                : 'submitted';

      crud.upsertSubmission({
        id: subId,
        bountySlug: slug,
        hunterHandle: `@${configuredHandle}`,
        entryTitle: String(sub.title || slug),
        commitSha: null,
        repoUrl: sub.link ? String(sub.link) : null,
        status: mappedStatus,
        rank: null,
        scoreDisplay: sub.score !== undefined && sub.score !== null ? String(sub.score) : null,
        source: 'makefun_api',
        verifiedAt: nowIso,
        rawJson: JSON.stringify(sub),
      });
    }
  }

  const lbEntries = Array.isArray(leaderboard?.entries)
    ? (leaderboard?.entries as Array<Record<string, unknown>>)
    : [];

  for (const entry of lbEntries) {
    const hunter = String(entry.hunter || entry.handle || '').toLowerCase();
    if (hunter === configuredHandle) {
      const entryId = String(entry.submission_id || entry.id || `${slug}-lb-${hunter}`);
      const rank = typeof entry.rank === 'number' ? entry.rank : null;
      const prizeUsd = Number(entry.prize_usd || entry.prizeUsd || 0);
      const status = prizeUsd > 0 ? 'awarded' : 'judged';

      crud.upsertSubmission({
        id: entryId,
        bountySlug: slug,
        hunterHandle: `@${configuredHandle}`,
        entryTitle: String(entry.title || slug),
        commitSha: entry.commit_sha ? String(entry.commit_sha) : null,
        repoUrl: entry.repo_url ? String(entry.repo_url) : null,
        status,
        rank,
        scoreDisplay: entry.score !== undefined && entry.score !== null ? String(entry.score) : null,
        source: 'makefun_api',
        verifiedAt: nowIso,
        rawJson: JSON.stringify(entry),
      });
    }
  }
}

interface CompetitionSyncOptions {
  cursor?: string | null;
  includeOpenFirst?: boolean;
}

async function syncCompetitionList(options?: CompetitionSyncOptions): Promise<{
  syncedCount: number;
  openCount: number;
  nextCursor: string | null;
  syncState: SyncState;
  error?: string;
}> {
  const nowIso = new Date().toISOString();
  const seenSlugs = new Set<string>();
  let syncedCount = 0;
  let openCount = 0;

  if (!options?.cursor && options?.includeOpenFirst !== false) {
    const openRes = await fetchJsonReadOnly(`${MAKEFUN_BASE}/api/competitions?status=open`);
    if (openRes.ok && openRes.data && typeof openRes.data === 'object') {
      const payload = openRes.data as { items?: MakefunCompetitionListItem[] };
      const items = Array.isArray(payload.items) ? payload.items : [];
      for (const item of items) {
        if (!bountySlugSchema.safeParse(item?.slug).success) continue;
        seenSlugs.add(item.slug);
        upsertBountyFromItem(
          { ...item, status: item.status || 'open', acceptingSubmissions: item.acceptingSubmissions ?? true },
          'LIVE',
          nowIso
        );
        if (!crud.hasAnyBountySnapshot(item.slug)) {
          const officialPromptText = extractOfficialPromptText(
            item as unknown as Record<string, unknown>,
            null
          );
          crud.saveBountySnapshot({
            bountySlug: item.slug,
            sourceEndpoint: `${MAKEFUN_BASE}/api/competitions?status=open`,
            rawCompetition: item as unknown as Record<string, unknown>,
            rawRequirements: null,
            rawLeaderboard: null,
            rawKit: null,
            officialPromptText,
            fetchedAt: nowIso,
            contentHash: hashContent(item),
          });
        }
        syncedCount += 1;
        openCount += 1;
      }
    }
  }

  const listUrl = options?.cursor
    ? `${MAKEFUN_BASE}/api/competitions?cursor=${encodeURIComponent(options.cursor)}`
    : `${MAKEFUN_BASE}/api/competitions`;

  const listRes = await fetchJsonReadOnly(listUrl);
  const payload = listRes.data as { items?: MakefunCompetitionListItem[]; next_cursor?: string | null } | null;
  if (!listRes.ok || !Array.isArray(payload?.items)) {
    crud.markBountiesOffline();
    return {
      syncedCount,
      openCount,
      nextCursor: crud.getSettingValue('nextCursor') || null,
      syncState: 'OFFLINE',
      error: listRes.error || 'Invalid competition list from make.fun',
    };
  }

  const items = payload.items;

  for (const item of items) {
    if (!bountySlugSchema.safeParse(item?.slug).success) continue;
    if (!seenSlugs.has(item.slug)) {
      upsertBountyFromItem(item, 'LIVE', nowIso);
      if (!crud.hasAnyBountySnapshot(item.slug)) {
        const officialPromptText = extractOfficialPromptText(
          item as unknown as Record<string, unknown>,
          null
        );
        crud.saveBountySnapshot({
          bountySlug: item.slug,
          sourceEndpoint: listUrl,
          rawCompetition: item as unknown as Record<string, unknown>,
          rawRequirements: null,
          rawLeaderboard: null,
          rawKit: null,
          officialPromptText,
          fetchedAt: nowIso,
          contentHash: hashContent(item),
        });
      }
      syncedCount += 1;
    }
  }

  const nextCursor = payload.next_cursor ?? null;
  crud.setSettingValue('lastGlobalSyncAt', nowIso);
  crud.setSettingValue('nextCursor', nextCursor || '');

  return {
    syncedCount,
    openCount,
    nextCursor,
    syncState: 'LIVE',
  };
}

const listSyncRequests = new Map<string, ReturnType<typeof syncCompetitionList>>();
let listSyncQueue = Promise.resolve();

export function syncCompetitionsFromMakefun(options?: CompetitionSyncOptions): ReturnType<typeof syncCompetitionList> {
  const normalized = { cursor: options?.cursor || null, includeOpenFirst: options?.includeOpenFirst !== false };
  const key = JSON.stringify(normalized);
  const existing = listSyncRequests.get(key);
  if (existing) return existing;

  const request = listSyncQueue.then(() => syncCompetitionList(normalized)).finally(() => {
    listSyncRequests.delete(key);
  });
  listSyncRequests.set(key, request);
  listSyncQueue = request.then(() => undefined, () => undefined);
  return request;
}

async function syncBountyDetails(slug: string): Promise<{
  bounty: BountyRecord | null;
  snapshot: BountySnapshot | null;
  syncState: SyncState;
  error?: string;
}> {
  const nowIso = new Date().toISOString();

  const [compRes, reqRes, lbRes, kitRes] = await Promise.all([
    fetchJsonReadOnly(`${MAKEFUN_BASE}/api/competitions/${encodeURIComponent(slug)}`),
    fetchJsonReadOnly(`${MAKEFUN_BASE}/api/competitions/${encodeURIComponent(slug)}/requirements?format=json`),
    fetchJsonReadOnly(`${MAKEFUN_BASE}/api/competitions/${encodeURIComponent(slug)}/leaderboard`),
    fetchJsonReadOnly(`${MAKEFUN_BASE}/api/competitions/${encodeURIComponent(slug)}/kit`),
  ]);

  if (!compRes.ok || !compRes.data || (compRes.data as { slug?: unknown }).slug !== slug) {
    const existingBounty = crud.getBountyBySlug(slug);
    const existingSnap = crud.getLatestBountySnapshot(slug);

    if (existingBounty) {
      crud.markBountiesOffline(slug);
      existingBounty.syncState = 'OFFLINE';
    }

    return {
      bounty: existingBounty,
      snapshot: existingSnap,
      syncState: 'OFFLINE',
      error: compRes.error || 'Could not fetch official competition details',
    };
  }

  const comp = compRes.data as Record<string, unknown>;
  const requirements = reqRes.data as (Record<string, unknown> & { competition?: { slug?: unknown } }) | null;
  const reqData = reqRes.ok && requirements?.competition?.slug === slug ? requirements : null;
  const lbData = lbRes.ok && lbRes.data && typeof lbRes.data === 'object' ? (lbRes.data as Record<string, unknown>) : null;
  const kitData = kitRes.ok && kitRes.data && typeof kitRes.data === 'object' ? (kitRes.data as Record<string, unknown>) : null;

  const syncState: SyncState = comp.description && reqData ? 'LIVE' : 'UNVERIFIED';

  const prerequisitesObj =
    (reqData?.prerequisites as PrerequisitesData | undefined) ||
    (comp.prerequisites as PrerequisitesData | undefined) ||
    null;

  upsertBountyFromItem(
    {
      ...(comp as unknown as MakefunCompetitionListItem),
      prerequisites: prerequisitesObj,
    },
    syncState,
    nowIso
  );

  const officialPromptText = extractOfficialPromptText(comp, reqData);
  const newHash = hashContent({ comp, reqData, lbData, kitData, officialPromptText });

  const snapshot = crud.saveBountySnapshot({
    bountySlug: slug,
    sourceEndpoint: `${MAKEFUN_BASE}/api/competitions/${slug}`,
    rawCompetition: comp,
    rawRequirements: reqData,
    rawLeaderboard: lbData,
    rawKit: kitData,
    officialPromptText,
    fetchedAt: nowIso,
    contentHash: newHash,
  });

  recordMatchingAccountSubmissions(slug, comp, lbData, nowIso);

  const bounty = crud.getBountyBySlug(slug);

  return {
    bounty,
    snapshot,
    syncState,
  };
}

const detailSyncRequests = new Map<string, ReturnType<typeof syncBountyDetails>>();

export function syncSingleBountyDetails(slug: string): ReturnType<typeof syncBountyDetails> {
  const existing = detailSyncRequests.get(slug);
  if (existing) return existing;

  const request = syncBountyDetails(slug).finally(() => {
    detailSyncRequests.delete(slug);
  });
  detailSyncRequests.set(slug, request);
  return request;
}

export function computeEffectiveSyncState(bounty: BountyRecord): SyncState {
  if (bounty.syncState === 'OFFLINE' || bounty.syncState === 'UNVERIFIED') {
    return bounty.syncState;
  }
  const ageMs = Date.now() - new Date(bounty.lastSyncedAt).getTime();
  if (Number.isFinite(ageMs) && ageMs > STALE_THRESHOLD_MS) {
    return 'STALE';
  }
  return 'LIVE';
}

export function extractLeaderboardInsights(
  rawLeaderboard: Record<string, unknown> | null,
  rawCompetition: Record<string, unknown> | null,
  accountHandle: string
): LeaderboardGapInsights | null {
  if (!rawLeaderboard || !Array.isArray(rawLeaderboard.entries)) {
    return null;
  }

  const rankKey = String(rawLeaderboard.rank_key || 'score');
  const columns = Array.isArray(rawLeaderboard.columns)
    ? (rawLeaderboard.columns as Array<{ key?: string; title?: string }>)
    : [];
  const rankCol = columns.find((c) => c?.key === rankKey);
  const rankKeyTitle = rankCol?.title || rankKey;

  const cleanHandle = accountHandle.replace(/^@/, '').trim().toLowerCase();
  const entries = rawLeaderboard.entries as Array<Record<string, unknown>>;

  const toInsight = (e: Record<string, unknown>): LeaderboardEntryInsight => {
    const displayObj = (e.display && typeof e.display === 'object' ? e.display : {}) as Record<
      string,
      unknown
    >;
    const valuesObj = (e.values && typeof e.values === 'object' ? e.values : {}) as Record<
      string,
      unknown
    >;
    const display: Record<string, string> = {};
    for (const [k, v] of Object.entries(displayObj)) {
      display[k] = String(v ?? '');
    }
    const rawPrimary = displayObj[rankKey] ?? valuesObj[rankKey] ?? '—';
    const handle = String(e.handle || e.hunter || 'unknown');
    return {
      rank: typeof e.rank === 'number' ? e.rank : null,
      handle,
      title: String(e.title || 'Untitled entry'),
      primaryMetricLabel: rankKeyTitle,
      primaryMetricValue: String(rawPrimary),
      isBaseline: Boolean(e.baseline || e.house),
      isAccountMatch: cleanHandle.length > 0 && handle.toLowerCase() === cleanHandle,
      display,
    };
  };

  const mapped = entries.filter(e => e && typeof e === 'object' && !Array.isArray(e)).map(toInsight);
  const topEntries = mapped.filter((m) => !m.isBaseline).slice(0, 5);
  const houseBaseline = mapped.find((m) => m.isBaseline) || null;
  const accountEntry = mapped.find((m) => m.isAccountMatch) || null;

  const leader = topEntries[0] || null;
  const baselineObj = rawCompetition?.baseline as { display?: string; unit?: string } | undefined;
  const summaryParts: string[] = [];

  if (leader) {
    summaryParts.push(
      `Current #1 ("${leader.title}" by @${leader.handle}) holds ${rankKeyTitle}: ${leader.primaryMetricValue}.`
    );
  }
  if (houseBaseline) {
    summaryParts.push(
      `House baseline ("${houseBaseline.title}") sits at rank #${houseBaseline.rank ?? '?'} (${rankKeyTitle}: ${houseBaseline.primaryMetricValue}).`
    );
  } else if (baselineObj?.display) {
    summaryParts.push(
      `Official baseline threshold: ${baselineObj.display} ${baselineObj.unit || ''}.`.trim()
    );
  }
  if (accountEntry) {
    const leaderNum = leader ? Number(leader.primaryMetricValue.replace(/,/g, '')) : NaN;
    const acctNum = Number(accountEntry.primaryMetricValue.replace(/,/g, ''));
    const gapText =
      Number.isFinite(leaderNum) && Number.isFinite(acctNum)
        ? ` (gap to #1: ${(leaderNum - acctNum).toFixed(leaderNum % 1 === 0 && acctNum % 1 === 0 ? 0 : 2)} ${rankKeyTitle})`
        : '';
    summaryParts.push(
      `Tracked account ${accountHandle} ("${accountEntry.title}") is rank #${accountEntry.rank ?? '?'} with ${rankKeyTitle}: ${accountEntry.primaryMetricValue}${gapText}.`
    );
  } else {
    summaryParts.push(`No public leaderboard entry matched for ${accountHandle} in this competition yet.`);
  }

  return {
    rankKey,
    rankKeyTitle,
    totalRanked: mapped.length,
    topEntries,
    houseBaseline,
    accountEntry,
    gapSummary: summaryParts.join(' '),
  };
}

