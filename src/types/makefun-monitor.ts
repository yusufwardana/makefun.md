export interface OfficialEntry {
  id: string;
  bounty: string;
  stage: string;
  outcome: string | null;
  checks: Array<{ name: string; status: string; reason: string }>;
}

export interface OfficialReward {
  id: string;
  bounty: string;
  title: string;
  amountUsd: string | null;
  status: string;
  place: number | null;
  claimDeadline: string | null;
}

export interface MakefunAccountMonitor {
  connection: 'disconnected' | 'connected' | 'pending' | 'expired' | 'invalid';
  syncing: boolean;
  error: string | null;
  snapshot: {
    handle: string;
    syncedAt: string;
    entryCount: number;
    entries: OfficialEntry[];
    rewards: OfficialReward[];
  } | null;
}

export interface MakefunWatchlistMonitor {
  syncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
  handle: string;
  items: Array<{
    slug: string;
    title: string;
    status: string;
    deadline: string | null;
    acceptingSubmissions: boolean | null;
    rankAvailable: boolean;
    rank: number | null;
    syncedAt: string | null;
  }>;
}

export interface MakefunRecordings {
  competition: string;
  syncedAt: string;
  recordings: Array<{
    id: string;
    startedAt: string;
    sealedAt: string | null;
    chunks: number;
    documents: number;
  }>;
}
