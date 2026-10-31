import test from 'node:test';
import assert from 'node:assert/strict';
import { GithubClient } from '../src/github/client.js';
import { CollectionManager, type ActivitySource } from '../src/collections.js';
import { groupCommits } from '../src/commit-groups.js';
import { normalizePeriod } from '../src/period.js';
import type { StandaloneCommit } from '../src/types.js';
import { fixtureRunner, json, pr, item } from './fixtures.js';

const sha = (n: number) => String(n).repeat(40);
const commit = (n: number, changes: Partial<StandaloneCommit> = {}): StandaloneCommit => ({
  repository: 'acme/app', sha: sha(n), url: `https://github.com/acme/app/commit/${sha(n)}`,
  author: 'alice', authoredAt: '2025-01-15T00:00:00Z', message: '작업', messageTruncated: false,
  branches: ['feature/a'], defaultBranch: 'main', association: 'none', ...changes,
});
const period = normalizePeriod({ year: '2025' }, Date.parse('2026-01-02T00:00:00Z'), 'Asia/Seoul');
const signal = new AbortController().signal;

test('이슈 키, 단일 작업 브랜치, 개별 커밋을 안전하게 묶는다', () => {
  const groups = groupCommits([
    commit(1, { message: 'ABC-12 인증', branches: ['main'] }),
    commit(2, { message: 'abc-12 수정', branches: ['main', 'other'] }),
    commit(3), commit(4),
    commit(5, { branches: ['main', 'feature/a'] }),
    commit(6, { branches: ['feature/a', 'feature/b'] }),
    commit(7, { message: 'ABC-12 DEF-10', branches: ['feature/a'] }),
    commit(8, { association: 'unknown' }),
  ]);
  assert.deepEqual(groups.map(g => [g.basis, g.label, g.commits.length]).sort(), [
    ['branch', 'feature/a', 2], ['branch', 'feature/a', 1], ['commit', sha(5), 1],
    ['commit', sha(6), 1], ['commit', sha(7), 1], ['issue', 'ABC-12', 2],
  ].sort());
});

test('모든 브랜치에서 SHA 중복을 제거하고 기간 밖 PR의 커밋을 제외한다', async () => {
  const raw = (n: number) => ({ sha: sha(n), html_url: `https://github.com/acme/app/commit/${sha(n)}`,
    author: { login: 'alice' }, commit: { message: `ABC-12 작업 ${n}`, author: { date: '2025-01-15T00:00:00Z' } } });
  const { runner } = fixtureRunner((args, options) => {
    if (args.includes('repos/acme/app')) return json({ full_name: 'acme/app', default_branch: 'main', fork: false });
    if (args.includes('repos/acme/app/branches')) return json([
      { name: 'main', commit: { sha: sha(8) } }, { name: 'feature/a', commit: { sha: sha(9) } },
    ]);
    if (args.includes('repos/acme/app/commits')) return json(args.includes('sha=' + sha(8)) ? [raw(1), raw(2)] : [raw(1), raw(3)]);
    if (args.includes('repos/acme/app/pulls')) return json([{ number: 999 }]);
    if (args.includes('graphql') && JSON.parse(options.input!).query.includes('pageInfo')) {
      const cursor = JSON.parse(options.input!).variables.cursor;
      return json({ data: { repository: { pullRequest: { commits: cursor === null ?
        { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'next' } } :
        { nodes: [{ commit: { oid: sha(2) } }], pageInfo: { hasNextPage: false, endCursor: null } },
      } } } });
    }
    if (args.includes(`repos/acme/app/commits/${sha(1)}/pulls`)) return json([]);
    if (args.includes(`repos/acme/app/commits/${sha(3)}/pulls`)) return json([{ number: 1000 }]);
  });
  const issues: unknown[] = [];
  const result = await new GithubClient(runner).standaloneCommits({ login: 'alice', token: 'secret' }, { repo: 'acme/app' }, period, signal, e => issues.push(e));
  assert.equal(issues.length, 0);
  assert.deepEqual(result.map(c => c.sha), [sha(1)]);
  assert.deepEqual(result[0]?.branches, ['main', 'feature/a']);
});

test('PR 확인 실패는 발견된 커밋을 확인 필요 상태로 유지한다', async () => {
  const { runner } = fixtureRunner(args => {
    if (args.includes('repos/acme/app')) return json({ full_name: 'acme/app', default_branch: 'main', fork: false });
    if (args.includes('repos/acme/app/branches')) return json([{ name: 'main', commit: { sha: sha(8) } }]);
    if (args.includes('repos/acme/app/commits')) return json([{ sha: sha(1), html_url: commit(1).url,
      author: { login: 'alice' }, commit: { message: '변경', author: { date: commit(1).authoredAt } } }]);
    if (args.includes('repos/acme/app/pulls')) return { stdout: 'HTTP/2 403 Forbidden\r\n\r\n{}', stderr: '', exitCode: 1 };
  });
  const issues: unknown[] = [];
  const result = await new GithubClient(runner).standaloneCommits({ login: 'alice', token: 'secret' }, { repo: 'acme/app' }, period, signal, e => issues.push(e));
  assert.equal(result[0]?.association, 'unknown');
  assert.equal(issues.length, 1);
});

test('포크의 상위 저장소 PR 연결을 확인하지 못하면 확정하지 않는다', async () => {
  const { runner } = fixtureRunner(args => {
    if (args.includes('repos/acme/app')) return json({ full_name: 'acme/app', default_branch: 'main', fork: true });
    if (args.includes('repos/acme/app/branches')) return json([{ name: 'main', commit: { sha: sha(8) } }]);
    if (args.includes('repos/acme/app/commits')) return json([{ sha: sha(1), html_url: commit(1).url,
      author: { login: 'alice' }, commit: { message: '변경', author: { date: commit(1).authoredAt } } }]);
    if (args.includes('repos/acme/app/pulls') || args.includes(`repos/acme/app/commits/${sha(1)}/pulls`)) return json([]);
  });
  const issues: unknown[] = [];
  const result = await new GithubClient(runner).standaloneCommits({ login: 'alice', token: 'secret' }, { repo: 'acme/app' }, period, signal, e => issues.push(e));
  assert.equal(result[0]?.association, 'unknown');
  assert.equal(issues.length, 1);
});

test('작업 묶음은 페이지 경계와 월 필터에서도 전체 통계를 유지한다', async () => {
  const source: ActivitySource = {
    credentials: async () => [{ login: 'alice', token: 'secret' }],
    search: async () => ({ total_count: 1, incomplete_results: false, items: [item()] }),
    detail: async () => pr(),
    standaloneCommits: async () => [commit(1), commit(2), commit(3, { authoredAt: '2025-02-01T00:00:00Z', association: 'unknown' })],
  };
  const manager = new CollectionManager(source, () => Date.parse('2026-01-02T00:00:00Z'), () => 'Asia/Seoul');
  const { collectionId } = manager.start({ year: '2025' });
  await manager.finished(collectionId);
  const first = manager.read({ collectionId, month: '2025-01', pageSize: 2 });
  assert.deepEqual(first.commitSummary, { commits: 2, groups: 1, unknown: 0 });
  assert.equal(first.prs.length, 1);
  const second = manager.read({ collectionId, month: '2025-01', pageSize: 2, cursor: first.nextCursor! });
  assert.equal(first.commitGroups[0]?.id, second.commitGroups[0]?.id);
  assert.deepEqual(manager.read({ collectionId, month: '2025-02' }).commitSummary, { commits: 0, groups: 0, unknown: 1 });
  assert.equal(manager.read({ collectionId }).complete, false);
  await manager.close();
});
