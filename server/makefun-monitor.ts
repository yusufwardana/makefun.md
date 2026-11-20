import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createClient, KeyExpiredError, MakefunError, QuotaExceededError } from '@makedotfun/sdk';
import { Router } from 'express';
import { z } from 'zod';
import type { MakefunAccountMonitor, MakefunRecordings, MakefunWatchlistMonitor, OfficialReward } from '../src/types/makefun-monitor.ts';
import { bountySlugSchema } from '../src/types/muse-package.ts';
import { crud } from './crud.ts';
import { extractLeaderboardInsights, syncSingleBountyDetails } from './makefun.ts';
import { createRateLimiter, getOperatorAuthToken, requireOperatorAuth } from './security.ts';

const origin = 'https://make.fun';
const loopback = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '::ffff:127.0.0.1']);
type AccountSnapshot = NonNullable<MakefunAccountMonitor['snapshot']>;
const recordingsSchema = z.object({ recordings: z.array(z.object({
  recording_id: z.string().min(1), competition: bountySlugSchema,
  started_at: z.iso.datetime({ offset: true }), sealed_at: z.iso.datetime({ offset: true }).nullable(),
  chunks: z.number().int().nonnegative(), documents: z.number().int().nonnegative(),
})) });

function clientFor(apiKey: string) {
  return createClient({
    origin, apiKey, timeoutMs: 10_000, maxRetries: 0,
    fetch(url, init) {
      if (new URL(url).origin !== origin || init.method !== 'GET') throw new Error('Invalid make.fun monitor request');
      return fetch(url, { ...init, redirect: 'error' });
    },
  });
}

async function fetchAccountSnapshot(apiKey: string): Promise<AccountSnapshot> {
  const client = clientFor(apiKey);
  const signal = AbortSignal.timeout(25_000);
  const home = await client.agent.home({ signal });
  if (typeof home.agent?.handle !== 'string' || !home.agent.handle || !Array.isArray(home.entries)) {
    throw new Error('Invalid make.fun account data');
  }

  const rewards = new Map<string, OfficialReward>();
  for (const entry of home.entries) {
    const payout = entry.payout;
    if (!payout) continue;
    const id = payout.claim_id || payout.id || entry.submission_id;
    rewards.set(id, {
      id, bounty: entry.competition, title: entry.competition, amountUsd: payout.amount_usd ?? null,
      status: payout.status, place: payout.place ?? null, claimDeadline: payout.claim_deadline ?? null,
    });
  }
  for (const prize of home.prizes ?? []) {
    const id = prize.claim_id || prize.id;
    rewards.set(id, {
      id, bounty: prize.competition.slug, title: prize.competition.title, amountUsd: prize.amount_usd,
      status: prize.status, place: prize.placement, claimDeadline: prize.claim_deadline,
    });
  }
  for await (const claim of client.agent.iteratePrizes({ limit: 50 }, { signal })) {
    const known = rewards.get(claim.claim_id);
    rewards.set(claim.claim_id, {
      id: claim.claim_id, bounty: claim.competition, title: known?.title ?? claim.competition,
      amountUsd: known?.amountUsd ?? null, status: claim.status,
      place: known?.place ?? null, claimDeadline: claim.claim_deadline,
    });
  }

  return {
    handle: home.agent.handle,
    syncedAt: new Date().toISOString(),
    entryCount: Number.isFinite(home.entry_count) ? home.entry_count : home.entries.length,
    entries: home.entries.map(entry => ({
      id: entry.submission_id, bounty: entry.competition, stage: entry.stage, outcome: entry.outcome ?? null,
      checks: (entry.checks ?? []).map(check => ({ name: check.check, status: check.status, reason: check.reason })),
    })),
    rewards: [...rewards.values()],
  };
}

function connectionError(error: unknown): { connection?: MakefunAccountMonitor['connection']; error: string } {
  if (error instanceof KeyExpiredError) return { connection: 'expired', error: 'The make.fun API key expired. Replace it in Settings.' };
  if (error instanceof MakefunError && error.status === 401) return { connection: 'invalid', error: 'make.fun rejected this API key. Replace it in Settings.' };
  if (error instanceof QuotaExceededError) return { error: 'make.fun is rate limiting requests. Try again later.' };
  return { error: 'Could not sync the make.fun account. Try again.' };
}

function rememberAccountHandle(handle: string) {
  const tracked = `@${handle.replace(/^@/, '')}`;
  if (crud.getSettingValue('accountHandle') !== tracked) crud.setSettingValue('accountHandle', tracked);
}

export function createMakefunMonitor(credentialPath: string, bindHost: string) {
  const router = Router();
  const limit = createRateLimiter({ bucket: 'makefun-monitor', windowMs: 60_000, maxRequests: 12 });
  let account: MakefunAccountMonitor = {
    connection: fs.existsSync(credentialPath) ? 'pending' : 'disconnected', syncing: false, error: null, snapshot: null,
  };
  let accountRequest: Promise<void> | undefined;
  let updatingConnection = false;
  let connectionVersion = 0;
  let lastAccountAttempt = 0;
  let watchlistRequest: Promise<void> | undefined;
  let lastWatchlistAttempt = Date.now();
  let watchlistSyncAt: string | null = null;
  let watchlistError: string | null = null;
  let resumeWatchlistAfter: string | null = null;

  function syncAccount() {
    if (accountRequest) return accountRequest;
    if (updatingConnection || !['connected', 'pending'].includes(account.connection)) return Promise.resolve();
    const request = (async () => {
      lastAccountAttempt = Date.now();
      account = { ...account, syncing: true, error: null };
      try {
        const key = (await fs.promises.readFile(credentialPath, 'utf8')).trim();
        const snapshot = await fetchAccountSnapshot(key);
        rememberAccountHandle(snapshot.handle);
        account = { connection: 'connected', syncing: false, error: null, snapshot };
      } catch (error) {
        account = { ...account, ...connectionError(error), syncing: false };
      }
    })().finally(() => { accountRequest = undefined; });
    accountRequest = request;
    return request;
  }

  function watchlist(): MakefunWatchlistMonitor {
    const handle = account.snapshot?.handle || crud.getSettingValue('accountHandle') || '@0xkeinara';
    return {
      syncing: Boolean(watchlistRequest), lastSyncAt: watchlistSyncAt, error: watchlistError, handle,
      items: crud.listBounties({ watchlistedOnly: true }).items.map(bounty => {
        const snapshot = crud.getLatestBountySnapshot(bounty.slug);
        const acceptingSubmissions = snapshot?.rawCompetition?.acceptingSubmissions;
        const insights = extractLeaderboardInsights(snapshot?.rawLeaderboard ?? null, snapshot?.rawCompetition ?? null, handle);
        return {
          slug: bounty.slug, title: bounty.title, status: bounty.status, deadline: bounty.deadline,
          acceptingSubmissions: typeof acceptingSubmissions === 'boolean' ? acceptingSubmissions : null,
          rankAvailable: Boolean(insights),
          rank: insights?.accountEntry?.rank ?? null,
          syncedAt: snapshot?.fetchedAt ?? null,
        };
      }),
    };
  }

  function syncWatchlist() {
    if (watchlistRequest) return watchlistRequest;
    lastWatchlistAttempt = Date.now();
    const items = crud.listBounties({ watchlistedOnly: true }).items;
    if (!items.length) return Promise.resolve();
    const start = items.findIndex(item => item.slug === resumeWatchlistAfter) + 1;
    const ordered = [...items.slice(start), ...items.slice(0, start)];
    resumeWatchlistAfter = null;
    watchlistError = null;
    watchlistRequest = (async () => {
      let updated = 0;
      try {
        for (const item of ordered) {
          const result = await syncSingleBountyDetails(item.slug);
          if (result.syncState === 'LIVE' && result.snapshot?.rawLeaderboard) updated++;
          if (result.error === 'HTTP 429') {
            resumeWatchlistAfter = item.slug;
            break;
          }
        }
      } finally {
        if (updated > 0) watchlistSyncAt = new Date().toISOString();
        if (updated < items.length) watchlistError = `Updated ${updated} of ${items.length} watchlisted bounties. Some official data is unavailable.`;
      }
    })().catch(() => { watchlistError = 'Could not fully sync the watchlist.'; })
      .finally(() => { watchlistRequest = undefined; });
    return watchlistRequest;
  }

  router.use(['/account', '/watchlist'], (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!getOperatorAuthToken() && (!loopback.has(bindHost) || !loopback.has(req.hostname) || !loopback.has(req.socket.remoteAddress ?? ''))) {
      res.status(403).json({ error: 'Configure operator authentication to access the make.fun account outside localhost.' });
      return;
    }
    requireOperatorAuth(req, res, next);
  });
  router.get('/account', (_req, res) => { res.json(account); });
  router.get('/account/recordings', limit, async (req, res) => {
    const competition = bountySlugSchema.safeParse(req.query.competition);
    if (!competition.success) { res.status(400).json({ error: 'Select a valid bounty to sync its recordings.' }); return; }
    if (account.connection !== 'connected') {
      res.status(409).json({ error: 'Connect your make.fun account before syncing recordings.' });
      return;
    }
    const version = connectionVersion;
    try {
      const key = (await fs.promises.readFile(credentialPath, 'utf8')).trim();
      const result = recordingsSchema.parse(await clientFor(key).json('GET', '/api/recordings', {
        query: { competition: competition.data },
      }));
      if (version !== connectionVersion) { res.status(409).json({ error: 'The make.fun connection changed. Sync again.' }); return; }
      const data: MakefunRecordings = {
        competition: competition.data, syncedAt: new Date().toISOString(),
        recordings: result.recordings.filter(recording => recording.competition === competition.data).map(recording => ({
          id: recording.recording_id, startedAt: recording.started_at, sealedAt: recording.sealed_at,
          chunks: recording.chunks, documents: recording.documents,
        })),
      };
      res.json(data);
    } catch (error) {
      const problem = connectionError(error);
      res.status(error instanceof QuotaExceededError ? 429 : problem.connection ? 409 : 502)
        .json({ error: problem.connection || error instanceof QuotaExceededError ? problem.error : 'Could not sync recordings from make.fun.' });
    }
  });
  router.put('/account', limit, async (req, res) => {
    const input = z.strictObject({ apiKey: z.string().trim().max(512).regex(/^af_\S+$/) }).safeParse(req.body);
    if (!input.success) { res.status(400).json({ error: 'Enter a make.fun API key starting with af_.' }); return; }
    if (updatingConnection || accountRequest) { res.status(409).json({ error: 'Account sync is in progress. Try again shortly.' }); return; }
    updatingConnection = true;
    const temporaryPath = `${credentialPath}.${randomUUID()}.tmp`;
    try {
      const snapshot = await fetchAccountSnapshot(input.data.apiKey);
      fs.writeFileSync(temporaryPath, input.data.apiKey, { flag: 'wx', mode: 0o600 });
      fs.renameSync(temporaryPath, credentialPath);
      rememberAccountHandle(snapshot.handle);
      lastAccountAttempt = Date.now();
      connectionVersion++;
      account = { connection: 'connected', syncing: false, error: null, snapshot };
      res.json(account);
    } catch (error) {
      fs.rmSync(temporaryPath, { force: true });
      const problem = connectionError(error);
      res.status(problem.connection ? 422 : error instanceof QuotaExceededError ? 429 : 502).json({ error: problem.error });
    } finally {
      updatingConnection = false;
    }
  });
  router.delete('/account', limit, (_req, res) => {
    if (updatingConnection || accountRequest) { res.status(409).json({ error: 'Account sync is in progress. Try again shortly.' }); return; }
    fs.rmSync(credentialPath, { force: true });
    connectionVersion++;
    account = { connection: 'disconnected', syncing: false, error: null, snapshot: null };
    res.json(account);
  });
  router.post('/account/sync', limit, async (_req, res) => { await syncAccount(); res.json(account); });
  router.get('/watchlist', (_req, res) => { res.json(watchlist()); });
  router.post('/watchlist/sync', limit, async (_req, res) => { await syncWatchlist(); res.json(watchlist()); });

  const timer = setInterval(() => {
    const intervalMinutes = Number(crud.getSettingValue('syncIntervalMinutes')) || 30;
    const interval = Math.max(5, Math.min(1440, intervalMinutes)) * 60_000;
    if (['pending', 'connected'].includes(account.connection) && Date.now() - lastAccountAttempt >= interval) void syncAccount();
    if (Date.now() - lastWatchlistAttempt >= interval) void syncWatchlist();
  }, 15_000);
  timer.unref();
  return router;
}
