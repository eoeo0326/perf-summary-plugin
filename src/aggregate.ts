import { DateTime } from 'luxon';
import { activityMonth } from './period.js';
import type { Period, PullRequest, Statistics } from './types.js';

export function statistics(prs: readonly PullRequest[]): Statistics {
  const result: Statistics = {
    prs: prs.length, merged: 0, open: 0, closed: 0, draft: 0,
    additions: 0, deletions: 0, changedFiles: 0, commits: 0,
  };
  for (const pr of prs) {
    result[pr.state]++;
    result.additions += pr.additions;
    result.deletions += pr.deletions;
    result.changedFiles += pr.changedFiles;
    result.commits += pr.commits;
  }
  return result;
}

export function aggregate(prs: readonly PullRequest[], period: Period) {
  const repos = new Map<string, PullRequest[]>();
  const months = new Map<string, PullRequest[]>();
  if (!period.empty) {
    const end = DateTime.min(
      DateTime.fromISO(period.until, { zone: period.timezone }),
      DateTime.fromISO(period.capturedAt).setZone(period.timezone),
    );
    for (let d = DateTime.fromISO(period.since, { zone: period.timezone }).startOf('month');
      d <= end; d = d.plus({ months: 1 })) months.set(d.toFormat('yyyy-MM'), []);
  }
  for (const pr of prs) {
    const repo = repos.get(pr.repository) ?? [];
    repo.push(pr);
    repos.set(pr.repository, repo);
    const key = activityMonth(pr.createdAt, period);
    const month = months.get(key) ?? [];
    month.push(pr);
    months.set(key, month);
  }
  const repositories = [...repos].map(([repository, values]) => ({ repository, ...statistics(values) }))
    .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions) ||
      b.prs - a.prs || a.repository.localeCompare(b.repository));
  return {
    total: { ...statistics(prs), repositories: repos.size },
    repositories,
    months: [...months].sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({ month, ...statistics(values) })),
  };
}

export function sortPullRequests(prs: PullRequest[], period: Period): PullRequest[] {
  const order = new Map(aggregate(prs, period).repositories.map((r, i) => [r.repository, i]));
  return [...prs].sort((a, b) =>
    order.get(a.repository)! - order.get(b.repository)! ||
    (b.mergedAt ?? b.closedAt ?? b.createdAt).localeCompare(a.mergedAt ?? a.closedAt ?? a.createdAt) ||
    a.url.localeCompare(b.url));
}
