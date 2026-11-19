import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import { crud } from './server/crud.ts';
import { safeJsonParse } from './server/db.ts';
import {
  createRateLimiter,
  enforceSameOriginCsrf,
  isWithinWorkspace,
  getOperatorAuthToken,
  requireOperatorAuth,
} from './server/security.ts';
import { buildMusePackage, formatMuseMarkdown } from './server/muse-handoff.ts';
import { bountySlugSchema } from './src/types/muse-package.ts';
import {
  computeEffectiveSyncState,
  extractLeaderboardInsights,
  syncCompetitionsFromMakefun,
  syncSingleBountyDetails,
} from './server/makefun.ts';
import { evaluateTranscriptGates } from './server/transcript-gate.ts';
import type { AppSettings } from './src/types/command-center.ts';

const PORT = Number(process.env.PORT || 3000);
const BIND_HOST = process.env.HOST?.trim() || (process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1');

function buildSettingsResponse(): AppSettings {
  return {
    authRequired: Boolean(getOperatorAuthToken()),
    syncIntervalMinutes: Number(crud.getSettingValue('syncIntervalMinutes') || 30),
    accountHandle: crud.getSettingValue('accountHandle') || '@0xkeinara',
    permittedEvidencePaths: safeJsonParse<string[]>(
      crud.getSettingValue('permittedEvidencePaths'),
      ['./evidence']
    ),
    lastGlobalSyncAt: crud.getSettingValue('lastGlobalSyncAt') || null,
    nextCursor: crud.getSettingValue('nextCursor') || null,
  };
}

const settingsLimiter = createRateLimiter({ bucket: 'settings', windowMs: 60_000, maxRequests: 30 });

async function startServer() {
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

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'COSMICLABS Make.fun Command Center',
      authRequired: Boolean(getOperatorAuthToken()),
      timestamp: new Date().toISOString(),
    });
  });

  // Overview summary
  app.get('/api/overview', (_req, res) => {
    res.json(crud.getOverviewData(buildSettingsResponse(), computeEffectiveSyncState));
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
    const input = z.strictObject({
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
    if (input.data.format === 'markdown') {
      res.attachment('MUSE_BOUNTY_CONTEXT.md').type('text/markdown').send(formatMuseMarkdown(pkg));
      return;
    }
    res.attachment('MUSE_BOUNTY_CONTEXT.json').type('application/json').send(JSON.stringify(pkg, null, 2) + '\n');
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

  // Read-only evidence monitor
  app.get('/api/evidence', (_req, res) => {
    res.json({
      evidence: crud.listEvidence(),
      permittedPaths: safeJsonParse<string[]>(
        crud.getSettingValue('permittedEvidencePaths'),
        ['./evidence']
      ),
    });
  });

  app.post('/api/evidence/import', (req, res) => {
    const schema = z.object({
      bountySlug: z.string().nullable().optional(),
      sourceType: z.enum(['session_export', 'local_log', 'project_artifact']),
      sourcePathOrName: z.string().min(1),
      sessionId: z.string().nullable().optional(),
      rawContent: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid evidence import payload.' });
      return;
    }

    const raw = parsed.data.rawContent;
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const timestampMatches = raw.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g) || [];
    const summary =
      lines.length > 0
        ? `Imported ${lines.length} line(s) (${Buffer.byteLength(raw, 'utf8')} bytes) from ${parsed.data.sourcePathOrName}.`
        : 'Empty file';

    const item = crud.createEvidence({
      bountySlug: parsed.data.bountySlug || null,
      sourceType: parsed.data.sourceType,
      sourcePathOrName: parsed.data.sourcePathOrName,
      sessionId: parsed.data.sessionId || null,
      summary,
      rawContent: raw.slice(0, 200000),
      metadata: {
        turnCount: lines.length,
        timestampsFound: timestampMatches.length,
        byteSize: Buffer.byteLength(raw, 'utf8'),
        readOnlyVerified: true,
      },
    });

    res.status(201).json({ item });
  });

  app.post('/api/evidence/scan-local', (_req, res) => {
    const permittedPaths = safeJsonParse<string[]>(
      crud.getSettingValue('permittedEvidencePaths'),
      ['./evidence']
    );
    const workspaceRoot = fs.realpathSync(process.cwd());
    const scannedFiles: Array<{ path: string; size: number; modifiedAt: string }> = [];
    const skippedPaths: Array<{ path: string; reason: string }> = [];

    for (const relOrAbs of permittedPaths) {
      const resolved = path.resolve(workspaceRoot, relOrAbs);
      if (!isWithinWorkspace(workspaceRoot, resolved)) {
        skippedPaths.push({ path: relOrAbs, reason: 'Outside workspace directory boundary' });
        continue;
      }
      if (!fs.existsSync(resolved)) {
        skippedPaths.push({ path: relOrAbs, reason: 'Directory does not exist on disk' });
        continue;
      }
      const realDirectory = fs.realpathSync(resolved);
      if (!isWithinWorkspace(workspaceRoot, realDirectory)) {
        skippedPaths.push({ path: relOrAbs, reason: 'Outside workspace directory boundary' });
        continue;
      }
      const stat = fs.statSync(realDirectory);
      if (!stat.isDirectory()) {
        skippedPaths.push({ path: relOrAbs, reason: 'Path is not a directory' });
        continue;
      }
      const entries = fs.readdirSync(realDirectory, { withFileTypes: true });
      for (const entry of entries.slice(0, 25)) {
        if (!entry.isFile()) continue;
        if (!/\.(json|jsonl|log|md|txt)$/i.test(entry.name)) continue;
        const fullFile = fs.realpathSync(path.join(realDirectory, entry.name));
        if (!isWithinWorkspace(workspaceRoot, fullFile)) continue;
        const fStat = fs.statSync(fullFile);
        const content = fs.readFileSync(fullFile, 'utf8').slice(0, 150000);
        const relPath = path.relative(workspaceRoot, fullFile);

        const existing = crud.findEvidenceBySourcePath(relPath);
        if (!existing) {
          const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
          crud.createEvidence({
            bountySlug: null,
            sourceType: 'local_log',
            sourcePathOrName: relPath,
            sessionId: null,
            summary: `Read-only scan from ${relPath} (${lines.length} lines, ${fStat.size} bytes)`,
            rawContent: content,
            metadata: {
              turnCount: lines.length,
              byteSize: fStat.size,
              readOnlyVerified: true,
            },
          });
        }
        scannedFiles.push({
          path: relPath,
          size: fStat.size,
          modifiedAt: fStat.mtime.toISOString(),
        });
      }
    }

    res.json({ scannedFiles, skippedPaths });
  });

  app.post('/api/evidence/:id/precheck', (req, res) => {
    const { id } = req.params;
    const body = z
      .object({
        bountySlug: z.string().nullable().optional(),
      })
      .safeParse(req.body || {});
    if (!body.success) {
      res.status(400).json({ error: 'Invalid pre-check request payload.' });
      return;
    }

    const evidenceItem = crud.getEvidenceById(id);
    if (!evidenceItem) {
      res.status(404).json({ error: 'Evidence artifact not found.' });
      return;
    }

    const targetSlug =
      body.data.bountySlug !== undefined ? body.data.bountySlug : evidenceItem.bountySlug;

    let publishedAt: string | null = null;
    let deadline: string | null = null;
    if (targetSlug && evidenceItem.bountySlug && evidenceItem.bountySlug !== targetSlug) {
      res.status(400).json({ error: 'Evidence is linked to a different bounty.' });
      return;
    }
    if (targetSlug) {
      const bounty = crud.getBountyBySlug(targetSlug);
      if (bounty) {
        publishedAt = bounty.publishedAt;
        deadline = bounty.deadline;
      }
    }

    const report = evaluateTranscriptGates({
      rawContent: evidenceItem.rawContent,
      bountySlug: targetSlug || null,
      competitionPublishedAt: publishedAt,
      competitionDeadline: deadline,
    });

    res.json({ report });
  });

  app.delete('/api/evidence/:id', (req, res) => {
    const deleted = crud.deleteEvidence(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Evidence artifact not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // Verified Submissions
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
      res.status(400).json({ error: 'Invalid verified submission payload.' });
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
      permittedEvidencePaths: z.array(z.string()).optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid settings update payload.' });
      return;
    }
    const { syncIntervalMinutes, accountHandle, permittedEvidencePaths } = parsed.data;
    if (syncIntervalMinutes !== undefined) crud.setSettingValue('syncIntervalMinutes', String(syncIntervalMinutes));
    if (accountHandle !== undefined) crud.setSettingValue('accountHandle', accountHandle);
    if (permittedEvidencePaths !== undefined) {
      crud.setSettingValue('permittedEvidencePaths', JSON.stringify(permittedEvidencePaths));
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

  // Vite or Static Frontend Mounting
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const listener = app.listen(PORT, BIND_HOST, () => {
    const address = listener.address();
    const port = address && typeof address === 'object' ? address.port : PORT;
    console.log(`COSMICLABS Make.fun Command Center listening on http://${BIND_HOST}:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
