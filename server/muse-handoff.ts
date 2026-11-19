import { createHash } from 'node:crypto';
import { bountySlugSchema, musePackageSchema, type MusePackage } from '../src/types/muse-package.ts';
import { museBootstrap } from '../src/lib/muse-bootstrap.ts';
import type { BountyRecord, BountySnapshot, LeaderboardGapInsights } from '../src/types/command-center.ts';

const origin = 'https://make.fun';
type Fields = Record<string, unknown>;
const object = (value: unknown): Fields | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Fields : null;
const string = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const boolean = (value: unknown) => typeof value === 'boolean' ? value : null;
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const money = (value: unknown) => typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? value : number(value);
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const fields = object(value);
  if (!fields) return JSON.stringify(value);
  return '{' + Object.keys(fields).sort().map(key => JSON.stringify(key) + ':' + canonicalJson(fields[key])).join(',') + '}';
}

const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;

function list<T>(value: unknown, project: (value: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  return value.map(project).filter((item): item is T => item !== null);
}

function officialUrl(value: unknown, allowedPaths: string[]): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password || !allowedPaths.includes(url.pathname)) return null;
    const phase = url.searchParams.get('phase');
    const query = url.pathname === '/api/competitions' && url.searchParams.get('status') === 'open'
      ? '?status=open' : phase === 'final' || phase === 'practice' ? '?phase=' + phase : '';
    return origin + url.pathname + query;
  } catch {
    return null;
  }
}

function projectCheck(value: unknown) {
  const row = object(value);
  const check = string(row?.check);
  return check !== null ? {
    check, title: string(row?.title), description: string(row?.description),
    phase: string(row?.phase), applies: boolean(row?.applies),
  } : null;
}

function projectPrerequisite(value: unknown) {
  const row = object(value);
  const name = string(row?.name);
  return name !== null ? {
    name, required: boolean(row?.required), version: string(row?.version), why: string(row?.why),
    howToCheck: string(row?.how_to_check),
  } : null;
}

function projectEntry(entry: LeaderboardGapInsights['houseBaseline']) {
  return entry && { rank: entry.rank, handle: entry.handle, title: entry.title, metric: entry.primaryMetricValue };
}

export function buildMusePackage(bounty: BountyRecord, snapshot: BountySnapshot | null,
  leaderboard: LeaderboardGapInsights | null, now = Date.now()): MusePackage {
  const slug = bountySlugSchema.parse(bounty.slug);
  const apiPath = '/api/competitions/' + slug;
  const listPath = '/api/competitions';
  const source = snapshot?.bountySlug === slug
    ? officialUrl(snapshot.sourceEndpoint, [apiPath, listPath])
    : null;
  const detail = source === origin + apiPath;
  const rawCompetition = source ? object(snapshot?.rawCompetition) : null;
  const comp = rawCompetition?.slug === slug ? rawCompetition : null;
  const rawRequirements = detail && comp ? object(snapshot?.rawRequirements) : null;
  const requirements = object(rawRequirements?.competition)?.slug === slug ? rawRequirements : null;
  const manifest = detail && comp ? object(snapshot?.rawKit) : null;
  const board = detail && comp ? object(snapshot?.rawLeaderboard) : null;

  const payout = object(requirements?.payout_curve);
  const resolution = object(comp?.resolution);
  const deadlines = object(requirements?.deadlines);
  const checks = list(requirements?.checks, projectCheck);
  const deliverables = list(requirements?.deliverables, (value) => {
    const row = object(value);
    const name = string(row?.name);
    return name !== null ? { name, kind: string(row?.kind), description: string(row?.description), required: boolean(row?.required) } : null;
  });
  const note = object(comp?.rulesNote);
  const rules = string(comp?.rules);
  const prereqs = object(requirements?.prerequisites) ?? object(comp?.prerequisites);
  const kitLinks = object(comp?.kit);
  const finalKit = object(kitLinks?.final);
  const how = object(requirements?.how_to_submit);
  const about = object(how?.repo_about);
  const kitPaths = [apiPath + '/kit', '/c/' + slug + '/kit'];
  const files = list(manifest?.files, (value) => {
    const row = object(value);
    const path = string(row?.path);
    return path && { path, sha256: digest(row?.sha256), size: typeof row?.size === 'number' && row.size >= 0 ? number(row.size) : null };
  }) ?? (object(manifest?.files) && Object.keys(object(manifest?.files)!).sort().map(path => ({
    path, sha256: null, size: null,
  })));
  const count = number(comp?.submissionCount);
  const fetchedAt = comp ? date(snapshot?.fetchedAt) : null;
  const prompt = string(comp?.description);
  const rawPayload = {
    bounty: {
      slug,
      title: string(comp?.title) ?? slug,
      url: officialUrl(comp?.url, ['/bounty/' + slug, '/c/' + slug]) ?? origin + '/bounty/' + slug,
      status: string(comp?.status) ?? string(object(requirements?.competition)?.status),
      deadline: date(deadlines?.entries_close) ?? date(comp?.deadline),
      publishedAt: date(comp?.publishedAt),
      prizePoolUsd: money(payout?.total_usd) ?? money(comp?.potUsd) ?? money(comp?.rewardAmount),
      submissionCount: count !== null && Number.isInteger(count) && count >= 0 ? count : null,
      acceptingSubmissions: boolean(comp?.acceptingSubmissions),
      payout: {
        rail: string(payout?.rail), claimDeadline: date(deadlines?.claim_deadline),
        announcement: string(resolution?.announce),
        places: list(payout?.places ?? requirements?.payout_curve ?? comp?.rewardsNow, (value) => {
          const row = object(value);
          const place = number(row?.place);
          return place === null ? null : { place, amountUsd: money(row?.amount_usd ?? row?.amountUsd ?? row?.usd) };
        }),
      },
    },
    officialPrompt: prompt,
    officialRequirements: requirements ? { checks, quotaRule: string(object(requirements.quota)?.rule) } : null,
    officialRules: rules || note ? { text: rules, addendum: string(note?.text), current: list(note?.current, string) } : null,
    deliverables,
    judgingCriteria: resolution ? {
      method: string(resolution.method), summary: string(resolution.summary),
      criteria: list(resolution.criteria, string), tieBreak: string(resolution.tieBreak),
    } : null,
    prerequisites: prereqs ? {
      asOf: string(prereqs.as_of), summary: string(prereqs.summary), ifUnmet: string(prereqs.if_unmet),
      software: list(prereqs.software, projectPrerequisite), accounts: list(prereqs.accounts, projectPrerequisite),
      mcp: list(prereqs.mcp, projectPrerequisite),
    } : null,
    competitionKit: manifest || kitLinks ? {
      manifestUrl: officialUrl(kitLinks?.json, kitPaths) ?? (manifest ? origin + apiPath + '/kit' : null),
      downloadUrl: officialUrl(kitLinks?.tarball, kitPaths),
      phase: string(manifest?.phase) ?? string(object(manifest?.phase)?.key),
      bundleSha256: digest(manifest?.bundle_sha256 ?? comp?.bundleSha256),
      finalManifestUrl: officialUrl(finalKit?.json, kitPaths), finalDownloadUrl: officialUrl(finalKit?.tarball, kitPaths),
      files,
    } : null,
    leaderboardContext: board && leaderboard ? {
      view: string(board.view), phase: string(object(board.phase)?.key),
      snapshotRankedCount: leaderboard.totalRanked, metric: leaderboard.rankKeyTitle,
      leader: projectEntry(leaderboard.topEntries[0] ?? null), houseBaseline: projectEntry(leaderboard.houseBaseline),
      topEntries: leaderboard.topEntries.map(entry => projectEntry(entry)!),
    } : null,
    recordingRequirements: checks?.filter(check => /^(transcripts?_|thinking_|recording_)/.test(check.check)) ?? null,
    submissionRequirements: how ? {
      endpoint: officialUrl(how.href, [apiPath + '/submissions']), method: string(how.method),
      contentType: string(how.content_type),
      fields: list(how.fields, string) ?? (object(how.fields) ? Object.keys(object(how.fields)!).sort() : null),
      readmeTemplate: string(how.readme_template),
      repositoryAbout: about ? {
        description: string(about.description), homepage: string(about.homepage), topics: list(about.topics, string),
      } : null,
    } : null,
  };

  const missingInformation = [
    [!comp, 'Official competition snapshot'],
    [!detail, 'Competition detail source'],
    [!prompt, 'Verbatim official prompt'],
    [rawPayload.bounty.status === null, 'Competition status'],
    [rawPayload.bounty.deadline === null, 'Entry deadline'],
    [rawPayload.bounty.prizePoolUsd === null, 'Prize pool'],
    [rawPayload.bounty.submissionCount === null, 'Submission count'],
    [rawPayload.bounty.payout.places === null, 'Payout schedule'],
    [!rules && !note, 'Official rules'],
    [deliverables === null, 'Official deliverables'],
    [deliverables?.some(item => item.required === null), 'Mandatory status for some deliverables'],
    [!rawPayload.judgingCriteria?.criteria && !rawPayload.judgingCriteria?.summary, 'Judging criteria'],
    [!prereqs, 'Software, account and MCP prerequisites'],
    [!files, 'Competition Kit manifest contents'],
    [!rawPayload.leaderboardContext, 'Public leaderboard'],
    [!requirements || !checks, 'Official requirements and checks'],
    [!rawPayload.recordingRequirements?.length, 'Explicit session recording policy (verify against the rules)'],
    [!how, 'Submission instructions'],
  ].flatMap(([missing, label]) => missing ? [label as string] : []);

  const endpoints = {
    competitionUrl: comp ? source : null,
    requirementsUrl: requirements ? origin + apiPath + '/requirements' : null,
    kitUrl: manifest ? origin + apiPath + '/kit' : null,
    leaderboardUrl: board ? origin + apiPath + '/leaderboard' : null,
  };
  const contentHash = hash({ ...rawPayload, ...endpoints, missingInformation });
  const age = fetchedAt ? now - Date.parse(fetchedAt) : -1;
  let status: MusePackage['sourceProvenance']['status'] = 'UNVERIFIED';
  if (bounty.syncState === 'OFFLINE') status = 'OFFLINE';
  else if (detail && prompt && requirements && age >= 0) {
    status = age > 6 * 60 * 60 * 1000 ? 'STALE' : 'LIVE';
  }

  return musePackageSchema.parse({
    schemaVersion: '1.0.0',
    packageId: 'muse-sha256:' + contentHash,
    createdAt: fetchedAt,
    sourceRepository: 'https://github.com/yusufwardana/makefun.md',
    ...rawPayload,
    sourceProvenance: {
      snapshotId: comp ? 'makefun-sha256:' + hash({ source, comp, requirements, board, manifest }) : null,
      fetchedAt, recordLastSyncedAt: date(bounty.lastSyncedAt), status, ...endpoints,
      contentChecksum: 'sha256:' + contentHash,
    },
    missingInformation,
  });
}

function dataBlock(value: string, language = '') {
  const width = (value.match(/~+/g) ?? []).reduce((longest, run) => Math.max(longest, run.length), 2) + 1;
  const fence = '~'.repeat(width);
  return fence + language + '\n' + value + '\n' + fence;
}

export function formatMuseMarkdown(packageData: MusePackage): string {
  const p = packageData;
  const block = (value: unknown) => value === null ? 'Unavailable in the official snapshot.' : dataBlock(JSON.stringify(value, null, 2), 'json');
  const sections = [
    ['Bounty Identity', block({ ...p.bounty, packageId: p.packageId, schemaVersion: p.schemaVersion })],
    ['Official Prompt — Verbatim', p.officialPrompt === null ? block(null) : dataBlock(p.officialPrompt)],
    ['Rules and Constraints', [
      p.officialRules?.text && dataBlock(p.officialRules.text),
      p.officialRules?.addendum && dataBlock(p.officialRules.addendum),
      p.officialRules?.current && block(p.officialRules.current),
      'Official checks and limits', block(p.officialRequirements),
    ].filter(Boolean).join('\n\n')],
    ['Mandatory Deliverables', block(p.deliverables?.filter(item => item.required === true) ?? null) +
      '\n\nOther listed deliverables\n\n' + block(p.deliverables?.filter(item => item.required !== true) ?? null)],
    ['Judging Criteria', block(p.judgingCriteria)],
    ['Prerequisites', block(p.prerequisites)],
    ['Competition Kit', block(p.competitionKit)],
    ['Leaderboard Context', block(p.leaderboardContext)],
    ['Recording and Provenance Requirements', block(p.recordingRequirements)],
    ['Submission Checklist', block(p.submissionRequirements)],
    ['Sources and Verification Status', block({ ...p.sourceProvenance, sourceRepository: p.sourceRepository,
      missingInformation: p.missingInformation })],
    ['Muse Execution Bootstrap', museBootstrap],
  ];
  return '# Muse Bounty Context\n\n' + sections.map(([title, body]) => '## ' + title + '\n\n' + body).join('\n\n') + '\n';
}
