export interface CollectInput {
  year?: string;
  month?: string;
  since?: string;
  until?: string;
  orgs?: string[];
  repo?: string;
  accounts?: string[];
}

export interface ReportPeriod {
  kind: 'month' | 'range' | 'year';
  since: string;
  until: string;
  relativePath: string;
}

export interface Period {
  mode: 'year' | 'month' | 'range';
  since: string;
  until: string;
  timezone: string;
  capturedAt: string;
  startMs: number;
  endMs: number; // Exclusive; clipped to the captured instant.
  empty: boolean;
  reports: ReportPeriod[];
}

export interface Account {
  login: string;
  active: boolean;
  authenticated: boolean;
}

export interface Environment {
  ready: boolean;
  nodeVersion: string;
  ghVersion: string | null;
  timezone: string;
  accounts: Account[];
  errors: { code: string; message: string; account?: string }[];
}

export interface PullRequest {
  url: string;
  number: number;
  repository: string;
  author: string;
  title: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  state: 'merged' | 'open' | 'closed' | 'draft';
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  isRelease: boolean;
  body: string;
  commitHeadlines: string[];
  files: string[];
  evidenceNotes: string[];
}

export interface Statistics {
  prs: number;
  merged: number;
  open: number;
  closed: number;
  draft: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
}

export interface Issue {
  code: string;
  message: string;
  account?: string;
  url?: string;
}

export interface Progress {
  phase: 'authentication' | 'search' | 'details' | 'done';
  discovered: number;
  processed: number;
  succeeded: number;
  failed: number;
}
