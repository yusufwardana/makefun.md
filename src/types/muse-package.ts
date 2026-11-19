import { z } from 'zod';

export const bountySlugSchema = z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const text = z.string().nullable();
const date = z.iso.datetime({ offset: true }).nullable();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const money = z.union([z.number(), z.string().regex(/^\d+(?:\.\d+)?$/)]).nullable();
const officialUrl = z.url().regex(/^https:\/\/make\.fun\//);
const check = z.strictObject({
  check: z.string(), title: text, description: text, phase: text, applies: z.boolean().nullable(),
});
const deliverable = z.strictObject({
  name: z.string(), kind: text, description: text, required: z.boolean().nullable(),
});
const prerequisite = z.strictObject({
  name: z.string(), required: z.boolean().nullable(), version: text, why: text, howToCheck: text,
});
const entry = z.strictObject({
  rank: z.number().nullable(), handle: z.string(), title: z.string(), metric: z.string(),
});

export const musePackageSchema = z.strictObject({
  schemaVersion: z.literal('1.0.0'),
  packageId: z.string().regex(/^muse-sha256:[a-f0-9]{64}$/),
  createdAt: date,
  sourceRepository: z.literal('https://github.com/yusufwardana/makefun.md'),
  bounty: z.strictObject({
    slug: bountySlugSchema, title: z.string(), url: officialUrl, status: text, deadline: date,
    publishedAt: date, prizePoolUsd: money, submissionCount: z.number().int().nonnegative().nullable(),
    acceptingSubmissions: z.boolean().nullable(),
    payout: z.strictObject({
      rail: text, claimDeadline: date, announcement: text,
      places: z.array(z.strictObject({ place: z.number(), amountUsd: money })).nullable(),
    }),
  }),
  officialPrompt: text,
  officialRequirements: z.strictObject({
    checks: z.array(check).nullable(),
    quotaRule: text,
  }).nullable(),
  officialRules: z.strictObject({
    text, addendum: text, current: z.array(z.string()).nullable(),
  }).nullable(),
  deliverables: z.array(deliverable).nullable(),
  judgingCriteria: z.strictObject({
    method: text, summary: text, criteria: z.array(z.string()).nullable(), tieBreak: text,
  }).nullable(),
  prerequisites: z.strictObject({
    asOf: text, summary: text, ifUnmet: text,
    software: z.array(prerequisite).nullable(), accounts: z.array(prerequisite).nullable(),
    mcp: z.array(prerequisite).nullable(),
  }).nullable(),
  competitionKit: z.strictObject({
    manifestUrl: officialUrl.nullable(), downloadUrl: officialUrl.nullable(),
    phase: text, bundleSha256: sha256.nullable(),
    finalManifestUrl: officialUrl.nullable(), finalDownloadUrl: officialUrl.nullable(),
    files: z.array(z.strictObject({ path: z.string(), sha256: sha256.nullable(), size: z.number().nonnegative().nullable() })).nullable(),
  }).nullable(),
  leaderboardContext: z.strictObject({
    view: text, phase: text, snapshotRankedCount: z.number().int().nonnegative(),
    metric: z.string(), leader: entry.nullable(), houseBaseline: entry.nullable(),
    topEntries: z.array(entry),
  }).nullable(),
  recordingRequirements: z.array(check).nullable(),
  submissionRequirements: z.strictObject({
    endpoint: officialUrl.nullable(), method: text, contentType: text, fields: z.array(z.string()).nullable(),
    readmeTemplate: text,
    repositoryAbout: z.strictObject({ description: text, homepage: text, topics: z.array(z.string()).nullable() }).nullable(),
  }).nullable(),
  sourceProvenance: z.strictObject({
    snapshotId: z.string().regex(/^makefun-sha256:[a-f0-9]{64}$/).nullable(),
    fetchedAt: date,
    recordLastSyncedAt: date,
    status: z.enum(['LIVE', 'STALE', 'OFFLINE', 'UNVERIFIED']),
    competitionUrl: officialUrl.nullable(), requirementsUrl: officialUrl.nullable(),
    kitUrl: officialUrl.nullable(), leaderboardUrl: officialUrl.nullable(),
    contentChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }),
  missingInformation: z.array(z.string()),
});

export type MusePackage = z.infer<typeof musePackageSchema>;
