import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { crud } from './crud.ts';
import { hosted, initializeDatabase, localDatabasePath } from './db.ts';
import {
  createRateLimiter,
  enforceSameOriginCsrf,
  getOperatorAuthToken,
  hasOperatorAuth,
  requireOperatorAuth,
  safeTokenEquals,
} from './security.ts';
import { buildMusePackage, formatMuseMarkdown } from './muse-handoff.ts';
import { museContextFilename } from '../src/lib/muse-bootstrap.ts';
import { geminiEnhanceModel, MuseSkillEnhancementError, selectMuseSkills } from './muse-skill-enhancement.ts';
import { bountySlugSchema } from '../src/types/muse-package.ts';
import {
  computeEffectiveSyncState,
  extractLeaderboardInsights,
  syncCompetitionsFromMakefun,
  syncSingleBountyDetails,
} from './makefun.ts';
import { createMakefunMonitor } from './makefun-monitor.ts';
import type { AppSettings } from '../src/types/command-center.ts';

export const bindHost =
  process.env.HOST?.trim() || (process.env.K_SERVICE || process.env.VERCEL ? '0.0.0.0' : '127.0.0.1');

// Vite excludes .env.* files from requests and the repository ignores them.
const databasePath = localDatabasePath;
const geminiKeyPath = path.join(path.dirname(databasePath), `.env.${path.basename(databasePath)}.enhance`);

function buildSettingsResponse(): AppSettings {
  return {
    authRequired: hasOperatorAuth(),
    hosted,
    syncIntervalMinutes: Number(crud.getSettingValue('syncIntervalMinutes') || 30),
    accountHandle: crud.getSettingValue('accountHandle') || '@0xkeinara',
    lastGlobalSyncAt: crud.getSettingValue('lastGlobalSyncAt') || null,
    nextCursor: crud.getSettingValue('nextCursor') || null,
    enhanceAi: {
      provider: 'Google Gemini API',
      model: geminiEnhanceModel,
      configured: Boolean(process.env.GEMINI_API_KEY?.trim()) || fs.existsSync(geminiKeyPath),
    },
  };
}

const settingsLimiter = createRateLimiter({ bucket: 'settings', windowMs: 60_000, maxRequests: 30 });
const enhanceSkillLimiter = createRateLimiter({ bucket: 'enhance-skill', windowMs: 60_000, maxRequests: 6 });

export function createApp(): express.Express {
  // On serverless hosts the database lives in a writable temp directory and
  // is (re)created on cold start; make sure the schema exists before serving.
  initializeDatabase();

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // CSRF / Origin & Operator Authentication for all mutating API routes
  app.use('/api', enforceSameOriginCsrf);
  app.use('/api', (req, res, next) => {
    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      next();
      return;
    }
    requireOperatorAuth(req, res, next);
  });
  const makefunKeyPath = path.join(path.dirname(databasePath), `.env.${path.basename(databasePath)}.makefun`);
  app.use('/api/makefun', createMakefunMonitor(makefunKeyPath, bindHost));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'COSMICLABS Make.fun Command Center',
      authRequired: hasOperatorAuth(),
      timestamp: new Date().toISOString(),
    });
  });

  // Overview summary
  app.get('/api/overview', (_req, res) => {
    res.json(crud.getOverviewData(buildSettingsResponse(), computeEffectiveSyncState));
  });

  // Daily cron sync (Vercel Cron calls this with Bearer CRON_SECRET).
  app.get('/api/cron/sync', async (req, res) => {
    const secret = process.env.CRON_SECRET?.trim();
    if (secret) {
      const supplied = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
      if (!supplied || !safeTokenEquals(supplied, secret)) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }
    }
    const result = await syncCompetitionsFromMakefun({ includeOpenFirst: true });
    res.json(result);
  });

  // Bounties list (auto-syncs once if DB is empty)
  app.get('/api/bounties', async (req, res) => {
    const initial = crud.listBounties();
    let syncWarning: string | undefined;
    if (initial.items.length === 0) {
      const syncResult = await syncCompetitionsFromMakefun({ includeOpenFirst: true });
      if (syncResult.error) syncWarning = syncResult.error;
    }

    const { items, categories } = crud.listBounties(
      {
        search: String(req.query.search || ''),
        category: String(req.query.category || 'all'),
        status: String(req.query.status || 'all'),
        watchlistedOnly: req.query.watchlisted === '1',
        sortBy: String(req.query.sort || 'status_deadline'),
      },
      computeEffectiveSyncState
    );

    res.json({
      items,
      categories,
      nextCursor: crud.getSettingValue('nextCursor') || null,
      lastGlobalSyncAt: crud.getSettingValue('lastGlobalSyncAt') || null,
      syncWarning,
    });
  });

  app.post('/api/bounties/sync', async (_req, res) => {
    const result = await syncCompetitionsFromMakefun({ includeOpenFirst: true });
    res.json(result);
  });

  app.post('/api/bounties/load-more', async (_req, res) => {
    const cursor = crud.getSettingValue('nextCursor');
    if (!cursor) {
      res.json({ syncedCount: 0, nextCursor: null, syncState: 'LIVE' });
      return;
    }
    const result = await syncCompetitionsFromMakefun({ cursor, includeOpenFirst: false });
    res.json(result);
  });

  app.get('/api/bounties/:slug', async (req, res) => {
    const { slug } = req.params;
    if (!bountySlugSchema.safeParse(slug).success) {
      res.status(400).json({ error: 'Invalid bounty identifier.' });
      return;
    }
    const forceRefresh = req.query.refresh === '1';

    let bounty = crud.getBountyBySlug(slug);
    let snapshot = crud.getLatestBountySnapshot(slug);

    let refreshError: string | undefined;
    if (forceRefresh || !bounty || !snapshot || !snapshot.rawRequirements) {
      const synced = await syncSingleBountyDetails(slug);
      refreshError = synced.error;
      bounty = crud.getBountyBySlug(slug);
      snapshot = crud.getLatestBountySnapshot(slug);
    }

    if (!bounty) {
      res.status(404).json({ error: `Bounty "${slug}" not found.` });
      return;
    }

    bounty.syncState = computeEffectiveSyncState(bounty);

    const leaderboardInsights = extractLeaderboardInsights(
      snapshot?.rawLeaderboard ?? null,
      snapshot?.rawCompetition ?? null,
      crud.getSettingValue('accountHandle') || '@0xkeinara'
    );

    res.json({
      bounty,
      snapshot: snapshot && {
        sourceEndpoint: snapshot.sourceEndpoint,
        fetchedAt: snapshot.fetchedAt,
        rawCompetition: snapshot.rawCompetition,
        rawRequirements: snapshot.rawRequirements,
      },
      leaderboardInsights,
      intelligence: buildMusePackage(bounty, snapshot, leaderboardInsights),
      refreshError,
    });
  });

  app.get('/api/bounties/:slug/muse-export', requireOperatorAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    // NOTE: non-strict object on purpose. The Vercel rewrite forwards the
    // request through /api/backend?__makefun_path=..., and any extra query
    // key the edge or adapter adds must not fail the export — strictObject
    // rejects unknown keys, which is what broke this endpoint on Vercel
    // (every export returned 400 even with a valid format + checksum).
    // format/checksum themselves are still validated below.
    const input = z.object({
      format: z.enum(['json', 'markdown']),
      checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
    }).safeParse(req.query);
    const slug = bountySlugSchema.safeParse(req.params.slug);
    if (!input.success || !slug.success) {
      res.status(400).json({ error: 'Invalid bounty identifier or export options.' });
      return;
    }
    const bounty = crud.getBountyBySlug(slug.data);
    if (!bounty) {
      res.status(404).json({ error: 'Bounty not found in the local records.' });
      return;
    }
    const snapshot = crud.getLatestBountySnapshot(slug.data);
    const insights = extractLeaderboardInsights(
      snapshot?.rawLeaderboard ?? null, snapshot?.rawCompetition ?? null, ''
    );
    const pkg = buildMusePackage(bounty, snapshot, insights);
    if (input.data.checksum && input.data.checksum !== pkg.sourceProvenance.contentChecksum) {
      res.status(409).json({ error: 'The snapshot changed. Reload the bounty details before exporting.' });
      return;
    }
    res.attachment(museContextFilename(pkg.bounty.slug, input.data.format));
    if (input.data.format === 'markdown') {
      res.type('text/markdown').send(formatMuseMarkdown(pkg));
      return;
    }
    res.type('application/json').send(JSON.stringify(pkg, null, 2) + '\n');
  });

  app.post('/api/bounties/:slug/enhance-skill', enhanceSkillLimiter, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const slug = bountySlugSchema.safeParse(req.params.slug);
    const input = z.strictObject({ checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).safeParse(req.body);
    if (!slug.success || !input.success) {
      res.status(400).json({ error: 'Invalid bounty identifier or snapshot checksum.' });
      return;
    }
    const bounty = crud.getBountyBySlug(slug.data);
    if (!bounty) {
      res.status(404).json({ error: 'Bounty not found in the local records.' });
      return;
    }
    const snapshot = crud.getLatestBountySnapshot(slug.data);
    const insights = extractLeaderboardInsights(snapshot?.rawLeaderboard ?? null, snapshot?.rawCompetition ?? null, '');
    const pkg = buildMusePackage(bounty, snapshot, insights);
    if (input.data.checksum !== pkg.sourceProvenance.contentChecksum) {
      res.status(409).json({ error: 'The snapshot changed. Reload the bounty details before enhancing.' });
      return;
    }
    if (!pkg.officialPrompt?.trim() || !pkg.officialRequirements) {
      res.status(422).json({ error: 'Refresh this bounty to load its official brief and requirements first.' });
      return;
    }
    // Gemini key: saved file first (Settings UI), env var fallback (Vercel).
    let apiKey = process.env.GEMINI_API_KEY?.trim() || '';
    if (!apiKey) {
      try {
        apiKey = (await fs.promises.readFile(geminiKeyPath, 'utf8')).trim();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          res.status(500).json({ error: 'Could not read the Gemini API key. Check Settings.' });
          return;
        }
        apiKey = '';
      }
    }
    if (!apiKey) {
      res.status(400).json({ error: 'Save a Gemini API key in Settings → Enhance AI first.' });
      return;
    }
    try {
      res.json(await selectMuseSkills(pkg, apiKey));
    } catch (error) {
      if (error instanceof MuseSkillEnhancementError) {
        res.status(error.status).json({ error: error.message });
      } else if (error instanceof Error && error.name === 'TimeoutError') {
        res.status(504).json({ error: 'Gemini took too long to respond. Try again.' });
      } else {
        res.status(502).json({ error: 'Could not connect to Gemini. Try again.' });
      }
    }
  });

  app.patch('/api/bounties/:slug/watchlist', (req, res) => {
    const { slug } = req.params;
    const body = z.object({ watchlisted: z.boolean() }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Invalid watchlist payload.' });
      return;
    }
    const updated = crud.updateBountyWatchlist(slug, body.data.watchlisted);
    if (!updated) {
      res.status(404).json({ error: 'Bounty not found.' });
      return;
    }
    res.json({ ok: true, slug, watchlisted: body.data.watchlisted });
  });

  app.patch('/api/bounties/:slug/notes', (req, res) => {
    const { slug } = req.params;
    const body = z.object({ founderNotes: z.string() }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'Invalid notes payload.' });
      return;
    }
    const updated = crud.updateBountyNotes(slug, body.data.founderNotes);
    if (!updated) {
      res.status(404).json({ error: 'Bounty not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // Submission records
  app.get('/api/submissions', (_req, res) => {
    res.json({
      accountHandle: crud.getSettingValue('accountHandle') || '@0xkeinara',
      submissions: crud.listSubmissions(),
    });
  });

  app.post('/api/submissions', (req, res) => {
    const schema = z.object({
      bountySlug: z.string().min(1),
      entryTitle: z.string().min(1),
      commitSha: z.string().nullable().optional(),
      repoUrl: z.string().nullable().optional(),
      status: z.enum(['submitted', 'accepted', 'judged', 'awarded', 'rejected']),
      rank: z.number().int().nullable().optional(),
      scoreDisplay: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid manual submission details.' });
      return;
    }

    const accountHandle = crud.getSettingValue('accountHandle') || '@0xkeinara';
    const submission = crud.createSubmission({
      bountySlug: parsed.data.bountySlug,
      hunterHandle: accountHandle,
      entryTitle: parsed.data.entryTitle,
      commitSha: parsed.data.commitSha || null,
      repoUrl: parsed.data.repoUrl || null,
      status: parsed.data.status,
      rank: parsed.data.rank ?? null,
      scoreDisplay: parsed.data.scoreDisplay || null,
      source: 'manual_verified',
    });

    res.status(201).json({ submission });
  });

  app.patch('/api/submissions/:id', (req, res) => {
    const schema = z.object({
      entryTitle: z.string().min(1).optional(),
      commitSha: z.string().nullable().optional(),
      repoUrl: z.string().nullable().optional(),
      status: z.enum(['submitted', 'accepted', 'judged', 'awarded', 'rejected']).optional(),
      rank: z.number().int().nullable().optional(),
      scoreDisplay: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid submission update payload.' });
      return;
    }
    const updated = crud.updateSubmission(req.params.id, parsed.data);
    if (!updated) {
      res.status(404).json({ error: 'Submission not found.' });
      return;
    }
    res.json({ submission: updated });
  });

  app.delete('/api/submissions/:id', (req, res) => {
    const deleted = crud.deleteSubmission(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Submission not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // Rewards Ledger & Analytics
  app.get('/api/rewards', (_req, res) => {
    res.json(crud.listRewardsWithTotals());
  });

  app.post('/api/rewards', (req, res) => {
    const schema = z.object({
      bountySlug: z.string().min(1),
      announcedPrizeUsd: z.number().min(0),
      verifiedAwardUsd: z.number().min(0),
      receivedUsd: z.number().min(0),
      txSignature: z.string().nullable().optional(),
      claimStatus: z.enum(['announced', 'awarded_unclaimed', 'claimed_received']),
      notes: z.string().optional().default(''),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reward record payload.' });
      return;
    }

    const record = crud.createReward({
      bountySlug: parsed.data.bountySlug,
      announcedPrizeUsd: parsed.data.announcedPrizeUsd,
      verifiedAwardUsd: parsed.data.verifiedAwardUsd,
      receivedUsd: parsed.data.receivedUsd,
      txSignature: parsed.data.txSignature || null,
      claimStatus: parsed.data.claimStatus,
      notes: parsed.data.notes,
    });

    res.status(201).json({ record });
  });

  app.patch('/api/rewards/:id', (req, res) => {
    const schema = z.object({
      announcedPrizeUsd: z.number().min(0).optional(),
      verifiedAwardUsd: z.number().min(0).optional(),
      receivedUsd: z.number().min(0).optional(),
      txSignature: z.string().nullable().optional(),
      claimStatus: z.enum(['announced', 'awarded_unclaimed', 'claimed_received']).optional(),
      notes: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid reward update payload.' });
      return;
    }
    const record = crud.updateReward(req.params.id, parsed.data);
    if (!record) {
      res.status(404).json({ error: 'Reward record not found.' });
      return;
    }
    res.json({ record });
  });

  app.delete('/api/rewards/:id', (req, res) => {
    const deleted = crud.deleteReward(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Reward record not found.' });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/settings', (_req, res) => {
    res.json(buildSettingsResponse());
  });

  app.patch('/api/settings', settingsLimiter, (req, res) => {
    const parsed = z.strictObject({
      syncIntervalMinutes: z.number().int().min(5).max(1440).optional(),
      accountHandle: z.string().trim().min(1).optional(),
      enhanceGeminiApiKey: z.string().trim().min(1).max(512).regex(/^\S+$/).nullable().optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid settings update payload.' });
      return;
    }
    const { syncIntervalMinutes, accountHandle, enhanceGeminiApiKey } = parsed.data;
    if (syncIntervalMinutes !== undefined) crud.setSettingValue('syncIntervalMinutes', String(syncIntervalMinutes));
    if (accountHandle !== undefined) crud.setSettingValue('accountHandle', accountHandle);
    if (enhanceGeminiApiKey === null) {
      fs.rmSync(geminiKeyPath, { force: true });
    } else if (enhanceGeminiApiKey !== undefined) {
      const temporaryKeyPath = `${geminiKeyPath}.${crypto.randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporaryKeyPath, enhanceGeminiApiKey, { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporaryKeyPath, geminiKeyPath);
      } catch {
        fs.rmSync(temporaryKeyPath, { force: true });
        res.status(500).json({ error: 'Could not store the Gemini API key.' });
        return;
      }
    }
    res.json(buildSettingsResponse());
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  // Global API error handler returning JSON (preventing HTML fallback for API routes)
  app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal server error';
    res.status(status).json({ error: message });
  });

  return app;
}
