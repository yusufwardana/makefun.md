import crypto from 'crypto';
import { count, desc, eq, or, sql } from 'drizzle-orm';
import {
  type CommandCenterDatabase,
  mapBountyRecord,
  mapEvidenceRecord,
  mapRewardRecord,
  mapSnapshotRecord,
  mapSubmissionRecord,
  orm as defaultOrm,
} from './db.ts';
import {
  appSettings,
  bounties,
  bountySnapshots,
  hermesEvidence,
  rewards,
  submissions,
} from './schema.ts';
import type {
  AppSettings,
  BountyRecord,
  BountySnapshot,
  ClaimStatus,
  EvidenceRecord,
  PrerequisitesData,
  RewardRecord,
  SubmissionRecord,
  SubmissionStatus,
  SyncState,
} from '../src/types/command-center.ts';

export interface BountyListFilters {
  search?: string;
  category?: string;
  status?: 'all' | 'open' | 'resolved' | string;
  watchlistedOnly?: boolean;
  sortBy?: 'status_deadline' | 'ratio_desc' | 'reward_desc' | 'submissions_desc' | 'deadline_asc' | string;
}

export interface UpsertBountyInput {
  slug: string;
  id: string;
  title: string;
  url: string;
  category: string;
  skills: string[];
  rewardAmount: number;
  potUsd: number;
  entryFeeUsd: number | null;
  deadline: string | null;
  publishedAt: string | null;
  status: string;
  submissionCount: number;
  sponsorName: string | null;
  sponsorVerified: boolean;
  summary: string | null;
  harnessKind: string | null;
  acceptingSubmissions: boolean;
  isDemo: boolean;
  syncState: SyncState;
  lastSyncedAt: string;
  prerequisites?: PrerequisitesData | null;
}

export interface SaveSnapshotInput {
  bountySlug: string;
  sourceEndpoint: string;
  rawCompetition: Record<string, unknown> | null;
  rawRequirements: Record<string, unknown> | null;
  rawLeaderboard: Record<string, unknown> | null;
  rawKit: Record<string, unknown> | null;
  officialPromptText: string;
  manualPromptOverride?: string | null;
  fetchedAt: string;
  contentHash: string;
}

export interface UpsertSubmissionInput {
  id: string;
  bountySlug: string;
  hunterHandle: string;
  entryTitle: string;
  commitSha?: string | null;
  repoUrl?: string | null;
  status: SubmissionStatus;
  rank?: number | null;
  scoreDisplay?: string | null;
  source: 'makefun_api' | 'manual_verified';
  verifiedAt?: string;
  rawJson?: string | null;
}

export interface CreateRewardInput {
  id?: string;
  bountySlug: string;
  announcedPrizeUsd: number;
  verifiedAwardUsd: number;
  receivedUsd: number;
  txSignature?: string | null;
  claimStatus: ClaimStatus;
  verifiedAt?: string;
  notes?: string;
}

export interface CreateEvidenceInput {
  id?: string;
  bountySlug?: string | null;
  sourceType: EvidenceRecord['sourceType'];
  sourcePathOrName: string;
  sessionId?: string | null;
  summary: string;
  rawContent: string;
  metadata: EvidenceRecord['metadata'];
  importedAt?: string;
}

export function createCommandCenterCrud(ormDb: CommandCenterDatabase) {
  // =========================================================================
  // Settings CRUD
  // =========================================================================
  function getSettingValue(key: string): string {
    const row = ormDb
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .get();
    return row ? row.value : '';
  }

  function setSettingValue(key: string, value: string): void {
    ormDb
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value },
      })
      .run();
  }

  // =========================================================================
  // Bounties CRUD
  // =========================================================================
  function listBounties(
    filters: BountyListFilters = {},
    computeSyncState?: (b: BountyRecord) => SyncState
  ): { items: BountyRecord[]; categories: string[] } {
    const rows = ormDb.select().from(bounties).all();
    let items = rows.map((row) => {
      const mapped = mapBountyRecord(row);
      if (computeSyncState) {
        mapped.syncState = computeSyncState(mapped);
      }
      return mapped;
    });

    const categories = Array.from(new Set(rows.map((r) => r.category || 'Uncategorized'))).sort();

    const search = (filters.search || '').trim().toLowerCase();
    if (search) {
      items = items.filter(
        (b) =>
          b.title.toLowerCase().includes(search) ||
          b.slug.toLowerCase().includes(search) ||
          b.category.toLowerCase().includes(search) ||
          b.skills.some((s) => s.toLowerCase().includes(search))
      );
    }

    if (filters.category && filters.category !== 'all') {
      const catLower = filters.category.toLowerCase();
      items = items.filter((b) => b.category.toLowerCase() === catLower);
    }

    if (filters.status === 'open') {
      items = items.filter((b) => b.status === 'open' || b.acceptingSubmissions);
    } else if (filters.status === 'resolved') {
      items = items.filter((b) => b.status !== 'open' && !b.acceptingSubmissions);
    }

    if (filters.watchlistedOnly) {
      items = items.filter((b) => b.watchlisted);
    }

    const sortBy = filters.sortBy || 'status_deadline';
    items.sort((a, b) => {
      if (sortBy === 'ratio_desc') {
        const ratioA = (a.potUsd || a.rewardAmount) / Math.max(a.submissionCount, 1);
        const ratioB = (b.potUsd || b.rewardAmount) / Math.max(b.submissionCount, 1);
        return ratioB - ratioA;
      }
      if (sortBy === 'reward_desc') {
        return (b.potUsd || b.rewardAmount) - (a.potUsd || a.rewardAmount);
      }
      if (sortBy === 'submissions_desc') {
        return b.submissionCount - a.submissionCount;
      }
      if (sortBy === 'deadline_asc') {
        const da = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        const dbTime = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER;
        return da - dbTime;
      }
      const aOpen = a.status === 'open' || a.acceptingSubmissions ? 1 : 0;
      const bOpen = b.status === 'open' || b.acceptingSubmissions ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      const da = a.deadline ? new Date(a.deadline).getTime() : 0;
      const dbTime = b.deadline ? new Date(b.deadline).getTime() : 0;
      return dbTime - da;
    });

    return { items, categories };
  }

  function getBountyBySlug(slug: string): BountyRecord | null {
    const row = ormDb.select().from(bounties).where(eq(bounties.slug, slug)).get();
    return row ? mapBountyRecord(row) : null;
  }

  function upsertBounty(input: UpsertBountyInput): BountyRecord {
    const skillsJson = JSON.stringify(input.skills);
    const prerequisitesJson = input.prerequisites ? JSON.stringify(input.prerequisites) : null;

    ormDb
      .insert(bounties)
      .values({
        slug: input.slug,
        id: input.id,
        title: input.title,
        url: input.url,
        category: input.category,
        skillsJson,
        rewardAmount: input.rewardAmount,
        potUsd: input.potUsd,
        entryFeeUsd: input.entryFeeUsd,
        deadline: input.deadline,
        publishedAt: input.publishedAt,
        status: input.status,
        submissionCount: input.submissionCount,
        sponsorName: input.sponsorName,
        sponsorVerified: input.sponsorVerified,
        summary: input.summary,
        harnessKind: input.harnessKind,
        acceptingSubmissions: input.acceptingSubmissions,
        isDemo: input.isDemo,
        syncState: input.syncState,
        lastSyncedAt: input.lastSyncedAt,
        prerequisitesJson,
      })
      .onConflictDoUpdate({
        target: bounties.slug,
        set: {
          id: input.id,
          title: input.title,
          url: input.url,
          category: input.category,
          skillsJson,
          rewardAmount: input.rewardAmount,
          potUsd: input.potUsd,
          entryFeeUsd: input.entryFeeUsd,
          deadline: input.deadline,
          publishedAt: input.publishedAt,
          status: input.status,
          submissionCount: input.submissionCount,
          sponsorName: input.sponsorName,
          sponsorVerified: input.sponsorVerified,
          summary: sql`COALESCE(${input.summary}, ${bounties.summary})`,
          harnessKind: sql`COALESCE(${input.harnessKind}, ${bounties.harnessKind})`,
          acceptingSubmissions: input.acceptingSubmissions,
          isDemo: input.isDemo,
          syncState: input.syncState,
          lastSyncedAt: input.lastSyncedAt,
          prerequisitesJson: sql`COALESCE(${prerequisitesJson}, ${bounties.prerequisitesJson})`,
        },
      })
      .run();

    return getBountyBySlug(input.slug)!;
  }

  function updateBountyWatchlist(slug: string, watchlisted: boolean): boolean {
    const res = ormDb
      .update(bounties)
      .set({ watchlisted })
      .where(eq(bounties.slug, slug))
      .run();
    return res.changes > 0;
  }

  function updateBountyNotes(slug: string, founderNotes: string): boolean {
    const res = ormDb
      .update(bounties)
      .set({ founderNotes })
      .where(eq(bounties.slug, slug))
      .run();
    return res.changes > 0;
  }

  function markBountiesOffline(slug?: string): void {
    if (slug) {
      ormDb.update(bounties).set({ syncState: 'OFFLINE' }).where(eq(bounties.slug, slug)).run();
    } else {
      ormDb.update(bounties).set({ syncState: 'OFFLINE' }).run();
    }
  }

  function deleteBounty(slug: string): boolean {
    const res = ormDb.delete(bounties).where(eq(bounties.slug, slug)).run();
    return res.changes > 0;
  }

  // =========================================================================
  // Bounty Snapshots CRUD
  // =========================================================================
  function getLatestBountySnapshot(slug: string): BountySnapshot | null {
    const row = ormDb
      .select()
      .from(bountySnapshots)
      .where(eq(bountySnapshots.bountySlug, slug))
      .orderBy(desc(bountySnapshots.id))
      .limit(1)
      .get();
    return row ? mapSnapshotRecord(row) : null;
  }

  function hasAnyBountySnapshot(slug: string): boolean {
    const row = ormDb
      .select({ id: bountySnapshots.id })
      .from(bountySnapshots)
      .where(eq(bountySnapshots.bountySlug, slug))
      .limit(1)
      .get();
    return Boolean(row);
  }

  function saveBountySnapshot(input: SaveSnapshotInput): BountySnapshot {
    const previous = ormDb
      .select()
      .from(bountySnapshots)
      .where(eq(bountySnapshots.bountySlug, input.bountySlug))
      .orderBy(desc(bountySnapshots.id))
      .limit(1)
      .get();

    const manualOverride =
      input.manualPromptOverride !== undefined
        ? input.manualPromptOverride
        : previous?.manualPromptOverride ?? null;

    if (!previous || previous.contentHash !== input.contentHash || !previous.rawRequirementsJson) {
      const inserted = ormDb
        .insert(bountySnapshots)
        .values({
          bountySlug: input.bountySlug,
          sourceEndpoint: input.sourceEndpoint,
          rawCompetitionJson: input.rawCompetition ? JSON.stringify(input.rawCompetition) : null,
          rawRequirementsJson: input.rawRequirements ? JSON.stringify(input.rawRequirements) : null,
          rawLeaderboardJson: input.rawLeaderboard ? JSON.stringify(input.rawLeaderboard) : null,
          rawKitJson: input.rawKit ? JSON.stringify(input.rawKit) : null,
          officialPromptText: input.officialPromptText,
          manualPromptOverride: manualOverride,
          fetchedAt: input.fetchedAt,
          contentHash: input.contentHash,
        })
        .returning()
        .get();
      return mapSnapshotRecord(inserted);
    }

    ormDb
      .update(bountySnapshots)
      .set({ fetchedAt: input.fetchedAt })
      .where(eq(bountySnapshots.id, previous.id))
      .run();

    return getLatestBountySnapshot(input.bountySlug)!;
  }

  // =========================================================================
  // Submissions CRUD
  // =========================================================================
  function listSubmissions(): SubmissionRecord[] {
    const rows = ormDb
      .select({
        submission: submissions,
        bountyTitle: bounties.title,
      })
      .from(submissions)
      .leftJoin(bounties, eq(bounties.slug, submissions.bountySlug))
      .orderBy(desc(submissions.verifiedAt))
      .all();

    return rows.map(({ submission, bountyTitle }) => mapSubmissionRecord(submission, bountyTitle));
  }

  function getSubmissionById(id: string): SubmissionRecord | null {
    const row = ormDb
      .select({
        submission: submissions,
        bountyTitle: bounties.title,
      })
      .from(submissions)
      .leftJoin(bounties, eq(bounties.slug, submissions.bountySlug))
      .where(eq(submissions.id, id))
      .get();

    return row ? mapSubmissionRecord(row.submission, row.bountyTitle) : null;
  }

  function upsertSubmission(input: UpsertSubmissionInput): SubmissionRecord {
    const verifiedAt = input.verifiedAt || new Date().toISOString();

    ormDb
      .insert(submissions)
      .values({
        id: input.id,
        bountySlug: input.bountySlug,
        hunterHandle: input.hunterHandle,
        entryTitle: input.entryTitle,
        commitSha: input.commitSha ?? null,
        repoUrl: input.repoUrl ?? null,
        status: input.status,
        rank: input.rank ?? null,
        scoreDisplay: input.scoreDisplay ?? null,
        source: input.source,
        verifiedAt,
        rawJson: input.rawJson ?? null,
      })
      .onConflictDoUpdate({
        target: submissions.id,
        set: {
          status: input.status,
          rank: sql`COALESCE(${input.rank ?? null}, ${submissions.rank})`,
          scoreDisplay: sql`COALESCE(${input.scoreDisplay ?? null}, ${submissions.scoreDisplay})`,
          verifiedAt,
          rawJson: input.rawJson ?? null,
        },
      })
      .run();

    return getSubmissionById(input.id)!;
  }

  function createSubmission(input: Omit<UpsertSubmissionInput, 'id'> & { id?: string }): SubmissionRecord {
    const id = input.id || crypto.randomUUID();
    const verifiedAt = input.verifiedAt || new Date().toISOString();

    ormDb
      .insert(submissions)
      .values({
        id,
        bountySlug: input.bountySlug,
        hunterHandle: input.hunterHandle,
        entryTitle: input.entryTitle,
        commitSha: input.commitSha ?? null,
        repoUrl: input.repoUrl ?? null,
        status: input.status,
        rank: input.rank ?? null,
        scoreDisplay: input.scoreDisplay ?? null,
        source: input.source,
        verifiedAt,
        rawJson: input.rawJson ?? null,
      })
      .run();

    return getSubmissionById(id)!;
  }

  function updateSubmission(
    id: string,
    patch: Partial<{
      entryTitle: string;
      commitSha: string | null;
      repoUrl: string | null;
      status: SubmissionStatus;
      rank: number | null;
      scoreDisplay: string | null;
    }>
  ): SubmissionRecord | null {
    const existing = ormDb.select().from(submissions).where(eq(submissions.id, id)).get();
    if (!existing) return null;

    ormDb
      .update(submissions)
      .set({
        entryTitle: patch.entryTitle ?? existing.entryTitle,
        commitSha: patch.commitSha !== undefined ? patch.commitSha : existing.commitSha,
        repoUrl: patch.repoUrl !== undefined ? patch.repoUrl : existing.repoUrl,
        status: patch.status ?? existing.status,
        rank: patch.rank !== undefined ? patch.rank : existing.rank,
        scoreDisplay: patch.scoreDisplay !== undefined ? patch.scoreDisplay : existing.scoreDisplay,
        verifiedAt: new Date().toISOString(),
      })
      .where(eq(submissions.id, id))
      .run();

    return getSubmissionById(id);
  }

  function deleteSubmission(id: string): boolean {
    const res = ormDb.delete(submissions).where(eq(submissions.id, id)).run();
    return res.changes > 0;
  }

  // =========================================================================
  // Rewards CRUD
  // =========================================================================
  function listRewardsWithTotals(): {
    records: RewardRecord[];
    totals: {
      marketOpenPoolUsd: number;
      trackedAnnouncedUsd: number;
      verifiedAwardedUsd: number;
      actuallyReceivedUsd: number;
    };
    openMarketByCategory: Array<{ category: string; pool: number }>;
  } {
    const rows = ormDb
      .select({
        reward: rewards,
        bountyTitle: bounties.title,
      })
      .from(rewards)
      .leftJoin(bounties, eq(bounties.slug, rewards.bountySlug))
      .orderBy(desc(rewards.verifiedAt))
      .all();

    const records = rows.map(({ reward, bountyTitle }) => mapRewardRecord(reward, bountyTitle));

    const openBountiesByCat = ormDb
      .select({
        category: bounties.category,
        pool: sql<number>`COALESCE(SUM(${bounties.potUsd}), 0)`,
      })
      .from(bounties)
      .where(or(eq(bounties.status, 'open'), eq(bounties.acceptingSubmissions, true)))
      .groupBy(bounties.category)
      .all();

    const openMarketByCategory = openBountiesByCat.map((c) => ({
      category: c.category,
      pool: Number(c.pool || 0),
    }));

    const totals = {
      marketOpenPoolUsd: openMarketByCategory.reduce((acc, c) => acc + c.pool, 0),
      trackedAnnouncedUsd: records.reduce((acc, r) => acc + r.announcedPrizeUsd, 0),
      verifiedAwardedUsd: records.reduce((acc, r) => acc + r.verifiedAwardUsd, 0),
      actuallyReceivedUsd: records.reduce((acc, r) => acc + r.receivedUsd, 0),
    };

    return { records, totals, openMarketByCategory };
  }

  function getRewardById(id: string): RewardRecord | null {
    const row = ormDb
      .select({
        reward: rewards,
        bountyTitle: bounties.title,
      })
      .from(rewards)
      .leftJoin(bounties, eq(bounties.slug, rewards.bountySlug))
      .where(eq(rewards.id, id))
      .get();
    return row ? mapRewardRecord(row.reward, row.bountyTitle) : null;
  }

  function createReward(input: CreateRewardInput): RewardRecord {
    const id = input.id || crypto.randomUUID();
    const verifiedAt = input.verifiedAt || new Date().toISOString();

    ormDb
      .insert(rewards)
      .values({
        id,
        bountySlug: input.bountySlug,
        announcedPrizeUsd: input.announcedPrizeUsd,
        verifiedAwardUsd: input.verifiedAwardUsd,
        receivedUsd: input.receivedUsd,
        txSignature: input.txSignature ?? null,
        claimStatus: input.claimStatus,
        verifiedAt,
        notes: input.notes || '',
      })
      .run();

    return getRewardById(id)!;
  }

  function updateReward(
    id: string,
    patch: Partial<Omit<CreateRewardInput, 'id' | 'bountySlug'>>
  ): RewardRecord | null {
    const existing = ormDb.select().from(rewards).where(eq(rewards.id, id)).get();
    if (!existing) return null;

    ormDb
      .update(rewards)
      .set({
        announcedPrizeUsd: patch.announcedPrizeUsd ?? existing.announcedPrizeUsd,
        verifiedAwardUsd: patch.verifiedAwardUsd ?? existing.verifiedAwardUsd,
        receivedUsd: patch.receivedUsd ?? existing.receivedUsd,
        txSignature: patch.txSignature !== undefined ? patch.txSignature : existing.txSignature,
        claimStatus: patch.claimStatus ?? existing.claimStatus,
        notes: patch.notes ?? existing.notes,
        verifiedAt: new Date().toISOString(),
      })
      .where(eq(rewards.id, id))
      .run();

    return getRewardById(id);
  }

  function deleteReward(id: string): boolean {
    const res = ormDb.delete(rewards).where(eq(rewards.id, id)).run();
    return res.changes > 0;
  }

  // =========================================================================
  // Evidence CRUD
  // =========================================================================
  function listEvidence(): EvidenceRecord[] {
    const rows = ormDb
      .select()
      .from(hermesEvidence)
      .orderBy(desc(hermesEvidence.importedAt))
      .all();
    return rows.map(mapEvidenceRecord);
  }

  function getEvidenceById(id: string): EvidenceRecord | null {
    const row = ormDb.select().from(hermesEvidence).where(eq(hermesEvidence.id, id)).get();
    return row ? mapEvidenceRecord(row) : null;
  }

  function findEvidenceBySourcePath(sourcePathOrName: string): EvidenceRecord | null {
    const row = ormDb
      .select()
      .from(hermesEvidence)
      .where(eq(hermesEvidence.sourcePathOrName, sourcePathOrName))
      .limit(1)
      .get();
    return row ? mapEvidenceRecord(row) : null;
  }

  function createEvidence(input: CreateEvidenceInput): EvidenceRecord {
    const id = input.id || crypto.randomUUID();
    const importedAt = input.importedAt || new Date().toISOString();

    const row = ormDb
      .insert(hermesEvidence)
      .values({
        id,
        bountySlug: input.bountySlug ?? null,
        sourceType: input.sourceType,
        sourcePathOrName: input.sourcePathOrName,
        sessionId: input.sessionId ?? null,
        summary: input.summary,
        rawContent: input.rawContent,
        metadataJson: JSON.stringify(input.metadata || {}),
        importedAt,
      })
      .returning()
      .get();

    return mapEvidenceRecord(row);
  }

  function deleteEvidence(id: string): boolean {
    const res = ormDb.delete(hermesEvidence).where(eq(hermesEvidence.id, id)).run();
    return res.changes > 0;
  }

  // =========================================================================
  // Overview Aggregations
  // =========================================================================
  function getOverviewData(
    settings: AppSettings,
    computeSyncState: (b: BountyRecord) => SyncState
  ) {
    const allBounties = ormDb
      .select()
      .from(bounties)
      .orderBy(bounties.deadline)
      .all()
      .map((row) => {
        const b = mapBountyRecord(row);
        b.syncState = computeSyncState(b);
        return b;
      });

    const openBounties = allBounties.filter((b) => b.status === 'open' || b.acceptingSubmissions);
    const watchlisted = allBounties.filter((b) => b.watchlisted);

    const evidenceCount = Number(ormDb.select({ c: count() }).from(hermesEvidence).get()?.c || 0);
    const submissionCount = Number(ormDb.select({ c: count() }).from(submissions).get()?.c || 0);

    const rewardSummaryRow = ormDb
      .select({
        totalAnnounced: sql<number>`COALESCE(SUM(${rewards.announcedPrizeUsd}), 0)`,
        totalVerifiedAwarded: sql<number>`COALESCE(SUM(${rewards.verifiedAwardUsd}), 0)`,
        totalReceived: sql<number>`COALESCE(SUM(${rewards.receivedUsd}), 0)`,
      })
      .from(rewards)
      .get();

    const rewardSummary = {
      totalAnnounced: Number(rewardSummaryRow?.totalAnnounced || 0),
      totalVerifiedAwarded: Number(rewardSummaryRow?.totalVerifiedAwarded || 0),
      totalReceived: Number(rewardSummaryRow?.totalReceived || 0),
    };

    const categoryBreakdownMap = new Map<
      string,
      { category: string; openCount: number; openPoolUsd: number }
    >();
    for (const b of openBounties) {
      const existing = categoryBreakdownMap.get(b.category) || {
        category: b.category,
        openCount: 0,
        openPoolUsd: 0,
      };
      existing.openCount += 1;
      existing.openPoolUsd += b.potUsd || b.rewardAmount;
      categoryBreakdownMap.set(b.category, existing);
    }

    return {
      totalSyncedBounties: allBounties.length,
      openBountiesCount: openBounties.length,
      openPoolTotalUsd: openBounties.reduce((acc, b) => acc + (b.potUsd || b.rewardAmount), 0),
      watchlistedCount: watchlisted.length,
      evidenceCount,
      verifiedSubmissionsCount: submissionCount,
      rewardSummary,
      topOpenBounties: openBounties.slice(0, 6),
      watchlistedBounties: watchlisted.slice(0, 6),
      categoryBreakdown: Array.from(categoryBreakdownMap.values()),
      lastGlobalSyncAt: getSettingValue('lastGlobalSyncAt') || null,
      settings,
    };
  }

  return {
    // Settings
    getSettingValue,
    setSettingValue,
    // Bounties
    listBounties,
    getBountyBySlug,
    upsertBounty,
    updateBountyWatchlist,
    updateBountyNotes,
    markBountiesOffline,
    deleteBounty,
    // Snapshots
    getLatestBountySnapshot,
    hasAnyBountySnapshot,
    saveBountySnapshot,
    // Submissions
    listSubmissions,
    getSubmissionById,
    upsertSubmission,
    createSubmission,
    updateSubmission,
    deleteSubmission,
    // Rewards
    listRewardsWithTotals,
    getRewardById,
    createReward,
    updateReward,
    deleteReward,
    // Evidence
    listEvidence,
    getEvidenceById,
    findEvidenceBySourcePath,
    createEvidence,
    deleteEvidence,
    // Overview
    getOverviewData,
  };
}

export const crud = createCommandCenterCrud(defaultOrm);
