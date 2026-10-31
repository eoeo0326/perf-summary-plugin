import type { CommitGroup, StandaloneCommit } from './types.js';

export function groupCommits(commits: readonly StandaloneCommit[]): CommitGroup[] {
  const groups = new Map<string, CommitGroup>();
  for (const commit of commits) {
    const keys = [...new Set((commit.message.match(/\b[A-Za-z][A-Za-z0-9]+-\d+\b/g) ?? []).map(key => key.toUpperCase()))];
    const branches = [...new Set(commit.branches.filter(branch => branch !== commit.defaultBranch))];
    const basis = keys.length === 1 ? 'issue' : keys.length === 0 && branches.length === 1 &&
      !commit.branches.includes(commit.defaultBranch) ? 'branch' : 'commit';
    const label = basis === 'issue' ? keys[0]! : basis === 'branch' ? branches[0]! : commit.sha;
    // Unknown associations are never silently mixed with confirmed standalone work.
    const id = JSON.stringify([commit.repository.toLowerCase(), commit.association, basis, label]);
    const group = groups.get(id) ?? { id, repository: commit.repository, basis, label, commits: [] };
    group.commits.push(commit);
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
}
