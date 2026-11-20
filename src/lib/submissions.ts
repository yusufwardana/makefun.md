import type { SubmissionRecord } from '../types/command-center';
import type { OfficialEntry } from '../types/makefun-monitor';

export interface SubmissionListEntry {
  id: string;
  bountySlug: string;
  stage: string;
  official: OfficialEntry | null;
  local: SubmissionRecord | null;
}

export function mergeSubmissionEntries(officialEntries: OfficialEntry[], localEntries: SubmissionRecord[]): SubmissionListEntry[] {
  const entries = new Map<string, SubmissionListEntry>();
  for (const official of officialEntries) {
    entries.set(official.id, { id: official.id, bountySlug: official.bounty, stage: official.stage, official, local: null });
  }
  for (const local of localEntries) {
    const existing = entries.get(local.id);
    if (existing) {
      existing.local = local;
    } else {
      entries.set(local.id, { id: local.id, bountySlug: local.bountySlug, stage: local.status, official: null, local });
    }
  }
  return [...entries.values()];
}

export function matchesSubmissionStatus(entry: SubmissionListEntry, filter: string): boolean {
  return filter === 'all' || entry.stage === filter || entry.official?.outcome === filter;
}
